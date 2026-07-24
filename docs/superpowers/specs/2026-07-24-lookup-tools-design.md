# Design: `get_projects`, `get_statuses`, `get_priorities`, `get_environments` MCP Tools

**Date:** 2026-07-24
**Status:** Approved

---

## Background

A gap review of this server against the official SmartBear Zephyr integration docs (`developer.smartbear.com/smartbear-mcp/docs/zephyr-integration`) found several missing tool categories. This design covers the first and smallest of them: read-only lookups for **Projects**, **Statuses**, **Priorities**, and **Environments** — the reference data needed to populate valid `statusName`/`priorityName`/`environmentName`/`projectKey` values when calling every other create/update tool in this server (`create_test_case`, `create_test_run`, `update_test_run`, etc.).

Endpoint paths, query parameters, and response schemas below were verified against the real Zephyr Scale Cloud v2 OpenAPI spec (`https://support.smartbear.com/zephyr-scale-cloud/api-docs/api.cloud.stripped.yml`), not guessed. Existing code already touches one of these endpoints: `tool-handlers.ts`'s private `resolveStatusName()` helper already calls `GET /statuses/{statusId}`.

**Cloud vs. Data Center:** The official SmartBear integration doc only documents these resources for Zephyr Scale Cloud. Data Center's ATM 1.0 REST API equivalents (if any) haven't been verified. Per user decision, these 4 tools are **Cloud-only** for now — they throw `McpError` on Data Center, matching the existing precedent set by `add_test_cases_to_run`.

---

## Goals

1. Let an assistant discover valid `projectKey`, `statusName`, `priorityName`, and `environmentName` values before calling create/update tools, instead of guessing or failing with a 400.
2. Support single-project lookup (`get_projects` with a key/id) as well as listing all projects, matching the official docs' "Get Project" + "Get Projects" pair without adding a 5th tool.
3. Match this repo's existing one-tool-per-resource convention (`get_folders`, `get_test_run`, etc.) rather than a combined multiplexed tool.

## Non-goals

- Data Center support for any of these 4 tools (see Background).
- Create/Update operations for statuses, priorities, or environments (the OpenAPI spec defines them, e.g. `CreateStatusInput`, but the official Zephyr integration doc doesn't list creation tools for these either, and there's no stated need yet).
- Auto-pagination across multiple pages (unlike `get_folders`, which fetches all pages internally). These resource lists are small, bounded, admin-configured lists — a single call with a generous `max_results` default covers virtually all real orgs, and `total`/`isLast` are surfaced so a caller can page manually in the rare case they don't.

---

## Tools

### `get_projects`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_key_or_id` | string | No | Zephyr project ID or Jira project key. When given, fetches a single project instead of listing. |
| `start_at` | number | No | Zero-indexed starting position. **Ignored when `project_key_or_id` is given.** Default `0`. |
| `max_results` | number | No | Max results per call, capped at API's hard max of 1000. **Ignored when `project_key_or_id` is given.** Default `200`. |

**Endpoint:** `GET /projects/{projectIdOrKey}` (single) or `GET /projects?maxResults&startAt` (list).

**Response — single lookup** (bare object, no pagination wrapper, mirrors `get_test_case`):
```json
{ "id": 10005, "key": "PROJ", "jiraProjectId": 10000, "enabled": true }
```

**Response — list**:
```json
{
  "total": 12,
  "isLast": true,
  "startAt": 0,
  "maxResults": 200,
  "projects": [
    { "id": 10005, "key": "PROJ", "jiraProjectId": 10000, "enabled": true }
  ]
}
```

### `get_statuses`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_key` | string | No | Jira project key filter. |
| `status_type` | string | No | One of `TEST_CASE`, `TEST_PLAN`, `TEST_CYCLE`, `TEST_EXECUTION`. Passed through to the API unvalidated client-side. |
| `start_at` | number | No | Default `0`. |
| `max_results` | number | No | Default `200`, hard cap 1000. |

**Endpoint:** `GET /statuses?projectKey&statusType&maxResults&startAt`

**Response:**
```json
{
  "total": 5,
  "isLast": true,
  "startAt": 0,
  "maxResults": 200,
  "statuses": [
    {
      "id": 10000,
      "project": { "id": 10005 },
      "name": "Draft",
      "description": "An important status",
      "index": 0,
      "color": "#FFF",
      "archived": false,
      "default": true
    }
  ]
}
```

Note: per the verified schema, a `Status` object does **not** include a `type`/`statusType` field on the returned resource itself — `status_type` is filter-only.

### `get_priorities`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_key` | string | No | Jira project key filter. |
| `start_at` | number | No | Default `0`. |
| `max_results` | number | No | Default `200`, hard cap 1000. |

**Endpoint:** `GET /priorities?projectKey&maxResults&startAt`

**Response:** same wrapper shape as `get_statuses`, `priorities` array with `{ id, project: { id }, name, description, index, color, default }`.

### `get_environments`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_key` | string | No | Jira project key filter. |
| `start_at` | number | No | Default `0`. |
| `max_results` | number | No | Default `200`, hard cap 1000. |

**Endpoint:** `GET /environments?projectKey&maxResults&startAt`

**Response:** same wrapper shape, `environments` array with `{ id, project: { id }, name, description, index, archived }`.

---

## Shared response conventions

**Key renaming:** the verified OpenAPI schemas (`ProjectList`, `StatusList`, `PriorityList`, `EnvironmentList`) confirm all 4 list endpoints wrap results under `values` in the raw API response — identical to `/folders`, not a resource-specific key. Each handler renames `response.data.values` → the resource-specific output key (`projects`/`statuses`/`priorities`/`environments`), exactly as `getFolders` maps its internal `allFolders` array → the output's `folders` key. This is a rename in the handler code, not something the API does for us.

**Field projection:** each handler builds its output items via an explicit `.map()` allow-list of known fields — the same explicit-projection approach `getFolders` uses (`{ id: f.id, name: f.name, parentId: f.parentId ?? null, folderType: f.folderType }`), not a `JSON.stringify` of the raw object with `self` deleted. Concretely:

```js
// get_projects (list and single)
{ id: p.id, key: p.key, jiraProjectId: p.jiraProjectId, enabled: p.enabled }

// get_statuses
{ id: s.id, project: { id: s.project?.id }, name: s.name, description: s.description ?? null,
  index: s.index, color: s.color ?? null, archived: s.archived ?? false, default: s.default ?? false }

// get_priorities
{ id: p.id, project: { id: p.project?.id }, name: p.name, description: p.description ?? null,
  index: p.index, color: p.color ?? null, default: p.default ?? false }

// get_environments
{ id: e.id, project: { id: e.project?.id }, name: e.name, description: e.description ?? null,
  index: e.index, archived: e.archived ?? false }
```

`project.self` and the top-level `PagedList.next` field are never included — only `project.id` is projected out of the `ProjectLink`, dropping `self` by construction rather than by deleting it after the fact.

- All list responses surface `total`, `isLast`, `startAt`, `maxResults` read directly off `response.data` (the `PagedList` envelope) so a caller can manually request the next page via `start_at` if `isLast` is `false`.
- Returned as a JSON text block, matching `get_folders`' `content: [{ type: 'text', text: JSON.stringify(...) }]` convention.

## Error handling

- **Data Center:** each of the 4 handlers throws `McpError(ErrorCode.InvalidRequest, ...)` immediately, before any network call, with an explicit reason clause matching the precedent at `tool-handlers.ts:1385-1390` (`add_test_cases_to_run`). Exact messages:
  - `get_projects`: `"get_projects is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /projects endpoint."`
  - `get_statuses`: `"get_statuses is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /statuses endpoint."`
  - `get_priorities`: `"get_priorities is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /priorities endpoint."`
  - `get_environments`: `"get_environments is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /environments endpoint."`
- **Axios errors** (401 unauthorized, 404 unknown `project_key_or_id`, 500): unwrapped via the existing `this.formatError(error)` helper, rethrown as `McpError(ErrorCode.InternalError, ...)`, matching every other handler in `tool-handlers.ts`.
- No client-side validation of `status_type`'s enum or `project_key`'s pattern — the API is the source of truth; avoids duplicating/drifting from the spec's own validation.

---

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | Add `GetProjectsArgs`, `GetStatusesArgs`, `GetPrioritiesArgs`, `GetEnvironmentsArgs` interfaces |
| `src/tool-schemas.ts` | Append 4 schema entries |
| `src/tool-handlers.ts` | Add `getProjects()`, `getStatuses()`, `getPriorities()`, `getEnvironments()` methods to `ZephyrToolHandlers` |
| `src/index.ts` | Add dispatch cases for the 4 new tool names |
| `test/zephyr-server.test.cjs` | Unit tests: tool registration/schema shape for each; DC-mode test asserting `McpError` is thrown for each, following the exact pattern already established at lines 249-260 / 316-332 (`testGetTestCaseStepsUnit`/`testUpdateTestCaseStepsUnit`): build a `dcConfig = { type: 'datacenter', apiEndpoints: {...} }`, instantiate `new ZephyrToolHandlers({}, dcConfig)`, call the method, assert the thrown error is `instanceof McpError` |
| `test/integration.test.cjs` | Live-call integration tests for each endpoint, guarded by the existing `ZEPHYR_BASE_URL` requirement |
| `README.md` | Document the 4 new tools in the MCP Tools reference section |
| `CLAUDE.md` | Add a new "Lookup / Reference Data" subsection under `## MCP Tools` listing `get_projects`, `get_statuses`, `get_priorities`, `get_environments` — this file is the authoritative tool reference and must stay in sync with README.md |

---

## Implementation Notes

- `max_results` default of 200 is a starting point, not tuned against a real large org's status/priority/environment counts — these are typically small (tens, not thousands), so 200 should cover almost all cases in one call. Revisit if real usage shows otherwise.
- `get_projects`' dual-mode behavior (single vs. list based on whether `project_key_or_id` is provided) is the one tool of the four with branching logic; the other 3 are pure single-endpoint list wrappers.
- These tools are purely additive — no existing tool, schema, or handler is modified.
- The private `resolveStatusName()` helper (`tool-handlers.ts:989`) already calls `GET /statuses/{statusId}` without a DC guard. This is pre-existing and out of scope — it's only reachable from Cloud-aware call paths today. Not touched by this change; noted here only so the new public `get_statuses` tool's DC guard isn't mistaken for redundant.
- Out of scope but worth flagging during implementation: `index.ts` hardcodes `version: '0.3.1'` in the server constructor while `package.json` is at `0.7.0`. Unrelated to this spec — do not fix as a drive-by change here.
