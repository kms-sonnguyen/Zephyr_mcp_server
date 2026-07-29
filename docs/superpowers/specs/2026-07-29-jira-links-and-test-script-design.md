# Design: `get_test_script` + Jira Link Tools (11 tools)

**Date:** 2026-07-29
**Status:** Approved

---

## Background

Continuing the gap review against the official SmartBear Zephyr integration docs (`developer.smartbear.com/smartbear-mcp/docs/zephyr-integration`, previously covered by [[2026-07-24-lookup-tools-design]]), two categories remain unimplemented:

1. **Test Scripts (read)** — the docs' `Get Test Script` operation. This server already fetches test script content internally (`getTestCase()`'s embedded `testScript` field, and `updateTestCaseBddDC`'s read-before-write), but never exposes it as a standalone callable tool. The user specifically wants this because in Zephyr, step-by-step *and* BDD/plain-text test content both live under the "test script" resource — `get_test_case_steps` (already implemented) only covers the `STEP_BY_STEP` script type, not `PLAIN_TEXT`/`BDD`.
2. **Jira Link tools** — 11 operations across test cases, test cycles, and test executions: creating issue/web links, reading a resource's links, and reverse-looking-up which test cases/cycles/executions are linked to a given Jira issue.

All 12 endpoint paths, HTTP methods, and request/response schemas below were verified against the real Zephyr Scale Cloud v2 OpenAPI spec (`https://support.smartbear.com/zephyr-scale-cloud/api-docs/api.cloud.stripped.yml`), not guessed — including confirming that **test executions only support issue links, not web links** (the spec has no `/testexecutions/{id}/links/weblinks` path; `TestExecutionLinkList` only has an `issues` field, unlike `TestCaseLinkList`/`TestCycleLinkList` which also have `webLinks`).

**Cloud vs. Data Center:** Per user decision, all 11 Jira-link tools are **Cloud-only** — Data Center's ATM 1.0 REST API has no verified equivalent endpoints (its test case object embeds `issueLinks` inline instead of exposing separate link endpoints, per the existing `updateTestCaseBddDC` code path). This matches the precedent set by `get_projects`/`get_statuses`/`get_test_case_steps`/`add_test_cases_to_run`. `get_test_script` is **not** gated — the codebase already calls its endpoint unconditionally for both platforms inside `getTestCase()`.

---

## Goals

1. Let an assistant retrieve a test case's script content (BDD/plain text/step type) without pulling the entire test case object.
2. Let an assistant create and inspect Jira issue/web links on test cases and test cycles, and issue links on test executions, without doing it only as a side effect of `create_test_case`/`create_test_run`.
3. Let an assistant answer "what test cases/cycles/executions are linked to issue X" — a reverse lookup with no existing equivalent in this server.

## Non-goals

- Data Center support for the 11 link tools (see Background).
- Deleting links (`DELETE /links/{linkId}` exists in the spec but isn't in the official docs' tool list, and there's no stated need yet).
- Web links on test executions (the API doesn't support them — confirmed above).
- `Create Test Script` (standalone write) — user explicitly scoped this to retrieval only; the write path already exists via `create_test_case`'s `test_script` param and `update_test_case_bdd`.

---

## Tools

### `get_test_script`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_case_key` | string | Yes | Test case key (e.g. `PROJ-T123`). |

**Endpoint:** `GET {apiEndpoints.testcase}/{test_case_key}/testscript` — same endpoint `getTestCase()` already calls internally at `tool-handlers.ts:40-43`. Works for both Cloud (`/testcases/{key}/testscript`) and Data Center (`/rest/atm/1.0/testcase/{key}/testscript`); no platform gating.

**Response** (raw passthrough, matching `getTestCaseSteps`'s convention):
```json
{ "id": 1, "type": "plain", "text": "Attempt to login to the application" }
```
`type` is `"plain"` or `"bdd"` (lowercase, per the verified `TestScriptInput` schema — note this differs from the `STEP_BY_STEP`/`PLAIN_TEXT`/`BDD` enum used in this server's own `create_test_case` tool, which is a client-side convenience naming, not the raw API's).

---

### `get_test_case_links`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_case_key` | string | Yes | Test case key (e.g. `PROJ-T123`). |

**Endpoint:** `GET /testcases/{testCaseKey}/links` → `TestCaseLinkList`

**Response:**
```json
{
  "issues": [
    { "id": 1, "issueId": 10100, "type": "COVERAGE", "target": "https://.../rest/api/2/issue/10100", "self": "https://.../links/1" }
  ],
  "webLinks": [
    { "id": 2, "url": "https://atlassian.com", "description": "A link to atlassian.com", "type": "RELATED", "self": "https://.../links/2" }
  ]
}
```
Unlike the lookup-tools spec's projects/statuses, `self` **is** kept here — it's the only handle available to reference a specific link (there's no `id`-only delete flow surfaced by this server today, but dropping it would make the response strictly less useful for no benefit).

---

### `create_test_case_web_link`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_case_key` | string | Yes | Test case key. |
| `url` | string | Yes | The web link URL. |
| `description` | string | No | The web link description. |

**Endpoint:** `POST /testcases/{testCaseKey}/links/weblinks`, body `{ url, description? }` → `CreatedResource { id, self }`

**Response:** `✅ Web link created on {test_case_key}: {id: ..., self: ...}`

---

### `create_test_case_issue_link`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_case_key` | string | Yes | Test case key. |
| `issue_key` | string | Yes | Jira issue key (e.g. `PROJ-123`). |

**Endpoint:** `POST /testcases/{testCaseKey}/links/issues`, body `{ issueId }` → `CreatedResource { id, self }`. `issue_key` is resolved to the numeric `issueId` via the existing private `resolveJiraIssueId()` helper (`tool-handlers.ts:1686`), the same one `createTestCaseCloud` already uses for `issue_links` at creation time.

**Response:** `✅ Issue link created on {test_case_key} → {issue_key}: {id: ..., self: ...}`

---

### `get_test_cases_linked_to_issue`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `issue_key` | string | Yes | Jira issue key. |

**Endpoint:** `GET /issuelinks/{issueKey}/testcases` → `TestCaseKeyAndVersionList`

**Response:**
```json
{ "testCases": [{ "key": "PROJ-T42", "version": 1 }] }
```
(`self` dropped here — it's a versioned test-case-detail URL, not a link-delete handle, so it fits the lookup-tools precedent of dropping pure-noise `self` fields.)

---

### `get_test_cycle_links`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_run_key` | string | Yes | Test cycle key or numeric ID (e.g. `PROJ-R123`). |

**Endpoint:** `GET /testcycles/{testCycleIdOrKey}/links` → `TestCycleLinkList`

**Response:** same `issues`/`webLinks` shape as `get_test_case_links`, plus:
```json
"testPlans": [
  { "id": 1, "testPlanId": 2, "type": "RELATED", "target": "https://.../testplan/123", "self": "https://.../links/1" }
]
```

---

### `create_test_cycle_web_link`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_run_key` | string | Yes | Test cycle key or ID. |
| `url` | string | Yes | The web link URL. |
| `description` | string | No | The web link description. |

**Endpoint:** `POST /testcycles/{testCycleIdOrKey}/links/weblinks`, body `{ url, description? }` → `CreatedResource`

---

### `create_test_cycle_issue_link`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_run_key` | string | Yes | Test cycle key or ID. |
| `issue_key` | string | Yes | Jira issue key. |

**Endpoint:** `POST /testcycles/{testCycleIdOrKey}/links/issues`, body `{ issueId }` → `CreatedResource`. Reuses `resolveJiraIssueId()`, same endpoint `createTestRunCloud` already calls for `issue_links`/`issue_key` at creation time (`tool-handlers.ts:833-836`).

---

### `get_test_cycles_linked_to_issue`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `issue_key` | string | Yes | Jira issue key. |

**Endpoint:** `GET /issuelinks/{issueKey}/testcycles` → `TestCycleIdList`

**Response:**
```json
{ "testCycles": [{ "id": 1 }] }
```
Note this reverse lookup returns numeric **IDs only**, not keys (`TestCycleId` = `{ id, self }`, no `key` field) — unlike `get_test_cases_linked_to_issue`, which does get keys. This is the verified API's own asymmetry, not a design choice; the tool description will call this out so callers know they'll need `get_test_run` with the numeric ID (this server's `get_test_run` already accepts a key, and the Cloud API accepts numeric IDs interchangeably with keys for path params per every other `testCycleIdOrKey` endpoint above).

---

### `get_test_execution_links`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `execution_id` | string | Yes | Test execution ID or key (e.g. `5805255` or `PROJ-E123`), matching the existing `get_test_execution` tool's `execution_id` param naming. |

**Endpoint:** `GET /testexecutions/{testExecutionIdOrKey}/links` → `TestExecutionLinkList`

**Response:**
```json
{ "issues": [{ "id": 1, "issueId": 10100, "type": "COVERAGE", "target": "...", "self": "..." }] }
```
No `webLinks` key — test executions don't support web links (see Background).

---

### `create_test_execution_issue_link`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `execution_id` | string | Yes | Test execution ID or key. |
| `issue_key` | string | Yes | Jira issue key. |

**Endpoint:** `POST /testexecutions/{testExecutionIdOrKey}/links/issues`, body `{ issueId }` → `CreatedResource`. Reuses `resolveJiraIssueId()`.

---

### `get_test_executions_linked_to_issue`

**Schema**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `issue_key` | string | Yes | Jira issue key. |

**Endpoint:** `GET /issuelinks/{issueKey}/executions` → `TestExecutionIdList` (note: `executions`, not `testexecutions`, in the path — verified against the spec, not a typo).

**Response:**
```json
{ "testExecutions": [{ "id": 1 }] }
```
Same ID-only asymmetry as `get_test_cycles_linked_to_issue`.

---

## Shared conventions

- **Field projection:** every response is built via an explicit `.map()`/object-literal allow-list of known fields (matching `getFolders`/`getStatuses` convention) — never a raw `JSON.stringify` of the axios response body.
- **`self` handling:** kept wherever it's the only handle to reference a specific link (`get_test_case_links`, `get_test_cycle_links`, `get_test_execution_links`, and all `create_*_link` responses); dropped in the three `get_*_linked_to_issue` reverse lookups where it's pure noise pointing back to a detail endpoint the caller already knows how to construct.
- **Issue key resolution:** all three `create_*_issue_link` tools accept a Jira issue **key** (`issue_key`, e.g. `PROJ-123`) and resolve it to the numeric `issueId` the API requires via the existing private `resolveJiraIssueId()` helper — no new Jira-auth code path. Same `JIRA_USERNAME`/`JIRA_API_TOKEN` env var requirement as today's `create_test_case`/`create_test_run` issue linking, and the same fallback-to-Bearer-token behavior.
- **Returned as a JSON text block** (`content: [{ type: 'text', text: JSON.stringify(...) }]`), except the three `create_*` tools which return a `✅ ...` success-message string embedding the created resource's `id`/`self`, matching `createFolder`'s convention.

## Error handling

- **Data Center guard** on all 11 link tools, thrown before any network call:
  `"{tool_name} is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose this endpoint."`
- `get_test_script` has no DC guard (see Background).
- Axios errors unwrapped via the existing `this.formatError(error)` helper, rethrown as `McpError(ErrorCode.InternalError, ...)`.
- `create_*_issue_link` tools: if `resolveJiraIssueId()` throws (e.g. missing `JIRA_USERNAME`/`JIRA_API_TOKEN`, or the issue key doesn't exist), the error propagates as `McpError(ErrorCode.InternalError, ...)` — no silent warning-and-continue behavior like `create_test_case`'s bulk `issue_links` array has, since here there's exactly one link being created per call and the caller should see the failure directly.

---

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | Add `GetTestScriptArgs`, `GetTestCaseLinksArgs`, `CreateWebLinkArgs { key, url, description? }`, `CreateIssueLinkArgs { key, issue_key }`, `GetLinkedToIssueArgs { issue_key }`, `GetTestExecutionLinksArgs { execution_id }`, `CreateExecutionIssueLinkArgs { execution_id, issue_key }` interfaces (shared shapes reused across test case/cycle variants where the field names line up) |
| `src/tool-schemas.ts` | Append 12 schema entries |
| `src/tool-handlers.ts` | Add 12 methods to `ZephyrToolHandlers`; no changes to existing methods |
| `src/index.ts` | Add 12 dispatch cases |
| `test/zephyr-server.test.cjs` | Unit tests per tool: DC-rejection (`McpError`) for the 11 Cloud-only tools; successful-call param/URL/response-shape assertions via mock axios; schema + `index.js` dispatch wiring checks — following the exact pattern at lines 249-315 (`testGetTestCaseStepsUnit`) |
| `test/integration.test.cjs` | Live-call integration tests, guarded by the existing `ZEPHYR_BASE_URL` requirement |
| `README.md` | Document the 12 new tools |
| `CLAUDE.md` | Add "Test Scripts" and "Jira Links" subsections under `## MCP Tools` |

---

## Implementation Notes

- These tools are purely additive — no existing tool, schema, or handler is modified.
- `create_test_case_issue_link` and `create_test_cycle_issue_link` expose, as standalone tools, functionality that already exists inline inside `createTestCaseCloud`/`createTestRunCloud` (both call the identical endpoint during creation). This is intentional duplication of the *endpoint*, not the *code* — the standalone tools call `resolveJiraIssueId()` + `axiosInstance.post()` directly rather than routing through the creation handlers, since the creation handlers have unrelated required params (`project_key`, `name`, etc.) that don't apply post-creation.
- `get_test_cycles_linked_to_issue` and `get_test_executions_linked_to_issue` return bare numeric IDs with no key — this is a genuine API asymmetry (verified in the spec, `TestCycleId`/`TestExecutionId` schemas have no `key` field, while `TestCaseKeyAndVersion` does). Each tool's schema `description` will state this explicitly so callers aren't surprised.
- Out of scope but worth flagging during implementation: `index.ts` still hardcodes `version: '0.3.1'` while `package.json` is ahead of that. Unrelated to this spec — do not fix as a drive-by change here (same note carried over from the lookup-tools spec, still unresolved).
