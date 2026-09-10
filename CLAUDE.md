# Zephyr Scale MCP Server

## Project Overview

A **Model Context Protocol (MCP) server** that bridges AI assistants to Zephyr Scale test case management. It supports both **Jira Cloud** and **Jira Data Center**, exposing tools and resources for creating, reading, and managing test cases, test runs, and test executions via the Atlassian REST API.

Published to npm as `zephyr-scale-mcp-server` (v0.3.2).

---

## Architecture

```
src/
├── index.ts          # MCP server entry point — wires transport, tools, resources
├── tool-handlers.ts  # ZephyrToolHandlers class — all tool implementations
├── tool-schemas.ts   # MCP tool input schemas (JSON Schema)
├── resources.ts      # MCP resource handlers (file://, zephyr://testcase/, zephyr://examples/)
├── types.ts          # TypeScript interfaces (TestCaseArgs, JiraConfig, etc.)
└── utils.ts          # Jira config, BDD→Gherkin conversion, API endpoint routing
build/                # Compiled output (ES2022, Node16 modules) — committed to repo
test/
├── run-tests.cjs     # Main test runner (unit + integration)
├── zephyr-server.test.cjs  # Unit tests
└── integration.test.cjs    # Integration tests (require live env vars)
scripts/
└── weekly-report.cjs # Standalone weekly report script
```

**Module system**: The server uses ES modules (`"type": "module"` in package.json); test files use `.cjs` extension to stay CommonJS.

---

## Build & Run

```bash
npm run build          # tsc + chmod 755 build/index.js
npm start              # node build/index.js
npm run watch          # tsc --watch
npm run inspector      # MCP inspector UI
```

Always run `npm run build` after editing `src/` — the `build/` directory is what gets published and executed.

---

## Testing

```bash
npm test               # unit + integration (needs env vars for integration)
npm run test:unit      # unit tests only — no env vars required
npm run test:integration
```

Unit tests check: package config, build artifacts, environment variables, server startup, tool registration.
Integration tests require at minimum `ZEPHYR_BASE_URL` to be set.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ZEPHYR_BASE_URL` | ✅ | Jira base URL (e.g., `https://company.atlassian.net` or `https://jira.company.com`) |
| `ZEPHYR_API_KEY` | ✅ | Bearer token for both Cloud and Data Center |
| `JIRA_USERNAME` | Cloud only | Email address (legacy Cloud auth — currently unused in code, `ZEPHYR_API_KEY` is used for both) |
| `JIRA_API_TOKEN` | Cloud only | API token (legacy — see above) |
| `JIRA_TYPE` | Optional | `"cloud"` or `"datacenter"` — overrides auto-detection |

**Auto-detection**: If `ZEPHYR_BASE_URL` contains `.atlassian.net` → Cloud; otherwise → Data Center. Override with `JIRA_TYPE`.

---

## Cloud vs. Data Center API Routing

`utils.ts → getApiEndpoints()` selects the correct base paths:

| Endpoint | Cloud (v2) | Data Center (v1) |
|---|---|---|
| Base URL | `https://api.zephyrscale.smartbear.com/v2` | `ZEPHYR_BASE_URL` |
| Test cases | `/testcases` | `/rest/atm/1.0/testcase` |
| Test runs | `/testruns` | `/rest/atm/1.0/testrun` |
| Folders | `/folders` | `/rest/atm/1.0/folder` |
| Search | `/testcases/search` | `/rest/atm/1.0/testcase/search` |

`add_test_cases_to_run` is **Cloud only** — throws `McpError` if called on Data Center.

---

## MCP Tools

All tools are defined in `tool-schemas.ts` and implemented in `tool-handlers.ts`.

### Test Case Management
- `get_test_case` — fetch by key (e.g., `PROJ-T123`)
- `create_test_case` — create with `STEP_BY_STEP`, `PLAIN_TEXT`, or `BDD` script; always sets `status: "Draft"`
- `update_test_case_bdd` — PUT update preserving all existing fields, replacing only the BDD script
- `update_test_case_custom_fields` — PUT update merging given `custom_fields` into the existing `customFields` object; fields not mentioned are preserved
- `move_test_case_folder` — PUT update setting the destination folder; Cloud resolves the path to `folderId` via `resolveFolderIdByPath()` (errors if not found), DC sends the path string directly as `folder`; all other fields are preserved
- `update_test_case_name` — PUT update setting the test case's `name`; all other fields (including folder) are preserved
- `update_test_case_precondition_objective` — PUT update setting `precondition` and/or `objective`; at least one required, the other is preserved from the existing record if omitted; all other fields preserved
- `delete_test_case` — DELETE, expects 204

### Test Scripts
- `get_test_script` — `GET {testcase}/{key}/testscript`; works on both Cloud and Data Center (already used internally by `getTestCase()`)

### Test Run Management
- `create_test_run` — POST; `test_case_keys` maps to `items[].testCaseKey`
- `get_test_run` — fetch by key (e.g., `PROJ-R123`)
- `get_test_run_cases` — returns array of test case keys from run's `items`
- `add_test_cases_to_run` — Cloud only; POSTs to `/testcycles/{key}/testcases`
- `delete_test_run` — DELETE, expects 204

### Search & Execution
- `search_test_cases_by_folder` — builds `projectKey = "X" AND folder = "Y"` query
- `search_test_runs` — supports `project_key` and/or `folder` filters; uses platform-specific search endpoint
- `get_test_execution` — iterates provided `test_run_keys`, searches `/testresults` for matching `execution_id`
- `update_test_execution` — **Cloud only**; updates a test case execution's status/comment/etc. via `PUT /testexecutions/{key}`, and attaches bugs via `POST /testexecutions/{key}/links/issues`. Resolves the execution from `execution_id`, or from `test_cycle_key` + `test_case_key` (uses `onlyLastExecutions`). Bug keys are resolved to numeric issue IDs via `resolveJiraIssueId` (needs `JIRA_USERNAME` + `JIRA_API_TOKEN`); link failures become warnings.
- `get_test_cycles_for_issue` — **Cloud only**; `GET /issuelinks/{issueKey}/testcycles` returns cycle IDs linked to a Jira issue. By default (`resolve_keys: true`) each numeric ID is resolved to its key + name via `GET /testcycles/{id}`; per-cycle resolution failures are surfaced inline (`error` field) rather than failing the call. This is the bridge from a Jira ticket → its Zephyr cycle (the link lives on the Zephyr side, not in Jira issue fields).

### Organization
- `create_folder` — POST with `projectKey`, `name` (full path), `type`

### Lookup / Reference Data
- `get_projects` — Cloud only; `GET /projects` (list) or `GET /projects/{projectIdOrKey}` (single, when `project_key_or_id` given)
- `get_statuses` — Cloud only; `GET /statuses`, filterable by `projectKey`/`statusType`
- `get_priorities` — Cloud only; `GET /priorities`, filterable by `projectKey`
- `get_environments` — Cloud only; `GET /environments`, filterable by `projectKey`

### Jira Links
- `get_test_case_links` — Cloud only; `GET /testcases/{key}/links`; `self` kept in the response as the only handle to a specific link
- `create_test_case_web_link` — Cloud only; `POST /testcases/{key}/links/weblinks`
- `create_test_case_issue_link` — Cloud only; resolves `issue_key` → numeric `issueId` via `resolveJiraIssueId()`, then `POST /testcases/{key}/links/issues`
- `get_test_cases_linked_to_issue` — Cloud only; `GET /issuelinks/{issueKey}/testcases`, returns `{ key, version }` pairs
- `get_test_cycle_links` — Cloud only; `GET /testcycles/{key}/links`, response includes `issues`, `webLinks`, and `testPlans`
- `create_test_cycle_web_link` — Cloud only; `POST /testcycles/{key}/links/weblinks`
- `create_test_cycle_issue_link` — Cloud only; resolves `issue_key` → numeric `issueId`, then `POST /testcycles/{key}/links/issues`
- `get_test_execution_links` — Cloud only; `GET /testexecutions/{id}/links` (hardcoded prefix, no `apiEndpoints` key); response has `issues` only, no `webLinks`
- `create_test_execution_issue_link` — Cloud only; resolves `issue_key` → numeric `issueId`, then `POST /testexecutions/{id}/links/issues` (hardcoded prefix)
- `get_test_executions_linked_to_issue` — Cloud only; `GET /issuelinks/{issueKey}/executions` (note: `executions`, not `testexecutions` — verified API path), returns `{ id }` only

---

## MCP Resources

Defined in `resources.ts`:

| URI | Description |
|---|---|
| `zephyr://testcase/{KEY}` | Live fetch of a test case — use as template for `customFields` |
| `file:///absolute/path` | Read local files (JSON, YAML, MD, etc.) |
| `zephyr://examples/step-by-step-payload` | Example STEP_BY_STEP creation payload |
| `zephyr://examples/gherkin-conversion` | BDD markdown → Gherkin conversion reference |

---

## BDD / Gherkin Conversion (`utils.ts → convertToGherkin`)

Converts markdown-bold BDD (`**Given**`, `**When**`, `**Then**`, `**And**`) to indented Gherkin.
Plain Gherkin keywords (`Given `, `When `, `Then `, `And `) pass through unchanged.
Output lines are prefixed with 4 spaces. Empty lines and `---` separators are stripped.
If conversion yields empty output, the original content is used as fallback.

---

## Key Implementation Notes

- **`update_test_case_bdd`**: First GETs the existing test case, then PUTs a full payload back. Required fields (`projectKey`, `name`, `status`, `priority`) must exist on the fetched data or it throws. All other fields are preserved.
- **`update_test_case_custom_fields`**: Same GET-then-PUT pattern as `update_test_case_bdd`, but merges the caller's `custom_fields` into the existing `customFields` object (`{ ...existing, ...given }`) instead of replacing it wholesale — fields not mentioned in the call keep their current value. DC's PUT is full-replace, so the DC path also re-sends the existing `testScript` to avoid clearing it.
- **`move_test_case_folder`**: Same GET-then-PUT pattern. Neither platform has a dedicated "move" endpoint — moving is just a full-record update with a new folder reference. Cloud's `UpdateTestCaseInput` takes `folderId` (integer, resolved from the given path via `resolveFolderIdByPath`, same helper `create_test_case` uses); if the path doesn't resolve to an existing folder, it throws rather than silently dropping the move. DC takes `folder` as a full path string directly, same as DC's create/update payloads elsewhere. DC re-sends the existing `testScript` for the same full-replace reason as `update_test_case_custom_fields`.
- **`update_test_case_name`**: Same GET-then-PUT pattern. Neither platform has a dedicated "rename" endpoint. Rejects an empty/whitespace-only `name` with `McpError` before issuing any request. All other fields, including the existing folder, are re-sent unchanged from the fetched record. DC re-sends the existing `testScript` for the same full-replace reason as `update_test_case_custom_fields`.
- **`update_test_case_precondition_objective`**: Same GET-then-PUT pattern. Neither platform has a dedicated endpoint for these fields. Rejects a call with neither `precondition` nor `objective` set with `McpError` before issuing any request; whichever of the two is omitted is re-sent unchanged from the fetched record (same preserve-fields loop as the other update tools). DC re-sends the existing `testScript` for the same full-replace reason as `update_test_case_custom_fields`.
- **`create_test_case`**: The `status` parameter is accepted in the schema but always overridden to `"Draft"` in the handler (line 98 of `tool-handlers.ts`).
- **`search_test_runs`**: Uses a different endpoint for Cloud vs. Data Center (hardcoded in handler, not in `jiraConfig.apiEndpoints`).
- **`get_test_execution`**: Requires `test_run_keys` — will not do open-ended searches.
- **Error handling**: Axios errors are unwrapped to include HTTP status and response body in the message.

---

## Publishing

```bash
npm run build
npm version patch|minor|major
npm publish
```

See `PUBLISHING.md` for full checklist. The `prepublishOnly` hook runs `build` automatically.
