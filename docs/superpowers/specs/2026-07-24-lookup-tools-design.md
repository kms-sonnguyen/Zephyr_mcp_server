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
| `start_at` | number | No | Zero-indexed starting position (ignored when `project_key_or_id` is given). Default `0`. |
| `max_results` | number | No | Max results per call, capped at API's hard max of 1000 (ignored when `project_key_or_id` is given). Default `200`. |

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

- All 4 list responses trim the raw API's `self` URLs (not actionable for an LLM caller) but otherwise pass fields through close to verbatim.
- All list responses surface `total`, `isLast`, `startAt`, `maxResults` from the API's `PagedList` envelope so a caller can manually request the next page via `start_at` if `isLast` is `false`.
- Returned as a JSON text block, matching `get_folders`' `content: [{ type: 'text', text: JSON.stringify(...) }]` convention.

## Error handling

- **Data Center:** each of the 4 handlers throws `McpError(ErrorCode.InvalidRequest, 'get_X is only supported on Zephyr Scale Cloud...')` immediately, before any network call — same message style as `add_test_cases_to_run`.
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
| `test/zephyr-server.test.cjs` | Unit tests: tool registration/schema shape for each; DC-mode test asserting `McpError` is thrown for each (pattern to be confirmed against the existing `add_test_cases_to_run` DC-guard test during implementation) |
| `test/integration.test.cjs` | Live-call integration tests for each endpoint, guarded by the existing `ZEPHYR_BASE_URL` requirement |
| `README.md` | Document the 4 new tools in the MCP Tools reference section |

---

## Implementation Notes

- `max_results` default of 200 is a starting point, not tuned against a real large org's status/priority/environment counts — these are typically small (tens, not thousands), so 200 should cover almost all cases in one call. Revisit if real usage shows otherwise.
- `get_projects`' dual-mode behavior (single vs. list based on whether `project_key_or_id` is provided) is the one tool of the four with branching logic; the other 3 are pure single-endpoint list wrappers.
- These tools are purely additive — no existing tool, schema, or handler is modified.
