# Design: `search_test_cases` MCP Tool

**Date:** 2026-07-02
**Status:** Approved

---

## Background

The server currently exposes `search_test_cases_by_folder`, which requires an exact `folder_path` and returns every test case in that folder. There is no way to search test cases by name — an assistant that only knows a rough title has to fetch entire folders and eyeball the results.

The two Zephyr Scale platforms differ sharply in what's available server-side:

- **Cloud (v2):** `GET /testcases` only accepts `projectKey`, `folderId`, `maxResults`, `startAt`. There is no name/status/priority/label filter and no query-language endpoint — confirmed both by SmartBear support ("get all Test Cases and iterate over the results") and by this repo's own `apiEndpoints.search` (`/testcases/search`) being defined but never called anywhere in `tool-handlers.ts`.
- **Data Center (v1):** `GET /rest/atm/1.0/testcase/search` accepts a real JQL-like `query` string supporting `projectKey`, `key`, `name`, `status`, `priority`, `component`, `folder`, `estimatedTime`, `labels`, `owner`, and custom fields, with operators `=`, `>`, `>=`, `<`, `<=`, `IN`. This repo already calls this endpoint in `searchTestCasesByFolder`'s DC branch, but only ever builds a `projectKey = "X" AND folder = "Y"` query — it never uses `name`.

This design adds name search on both platforms: client-side filtering on Cloud (no alternative exists), true server-side `name ~` filtering on Data Center (the endpoint already supports it).

---

## Goals

1. Let an assistant find test cases by a name substring, scoped to a project and optionally a folder.
2. Reuse the existing pagination/folder-resolution patterns already in `tool-handlers.ts` rather than inventing new ones.
3. Support Data Center via its native query filter, even though the primary user only runs Cloud — the endpoint already exists and the extra code is small.

## Non-goals

- Filtering by status, priority, labels, or owner (Cloud has no server-side support for these; user's stated need is name search only — can be a future addition on Data Center only, since Cloud would require an extra id→name resolution call per unique status/priority).
- Cross-project search (`project_key` is required, matching `search_test_cases_by_folder`).
- Subfolder recursion (`folder_path`, when given, matches the exact folder only — consistent with existing `search_test_cases_by_folder` / `search_test_runs` behavior on Cloud).

---

## Tool: `search_test_cases`

### Schema

| Parameter | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `project_key` | string | Yes | — | Project key (e.g., `PROJ`) |
| `name_contains` | string | Yes | non-empty after trim | Case-insensitive substring to match against test case names |
| `folder_path` | string | No | — | Exact folder path to scope the search to (e.g., `/ProjectName/SubFolder`). Exact folder only, not subfolders. |
| `max_results` | number | No | default 100 | Maximum number of **matching** test cases to return |

**Validation:** `name_contains` empty or whitespace-only is rejected with `McpError(ErrorCode.InvalidParams, ...)` before any request is made.

### Behavior — Cloud

1. If `folder_path` is given, resolve it to a `folderId` via the existing `resolveFolderIdByPath()`. If not found, return the same soft `⚠️ Folder not found...` message pattern used by `search_test_cases_by_folder` (empty result, no throw).
2. Paginate `GET /testcases` with `{ projectKey, folderId?, maxResults: 1000, startAt }` until the API signals the last page — fetching the **entire** scoped set regardless of `max_results` (there's no server-side name filter, so under-fetching risks missing matches). This mirrors the existing loop in `searchTestCasesByFolder` (tool-handlers.ts:1096-1119).
3. Filter the fetched set: `tc.name.toLowerCase().includes(name_contains.toLowerCase().trim())`.
4. Slice to `max_results`.
5. Return matched test case keys/names, `totalCount` (matches returned), and `totalScanned` (test cases fetched before filtering), so the caller can tell whether it hit the `max_results` cap.

### Behavior — Data Center

1. Build a TQL query: `projectKey = "X"` [`AND folder = "Y"` if `folder_path` given] `AND name ~ "needle"`. Both `folder_path` and `name_contains` are escaped for embedded double quotes, matching the existing `escapedFolderPath` handling in `searchTestCasesByFolder`.
2. `GET` the search endpoint (`apiEndpoints.search`) with `{ query, maxResults: max_results }` — filtering happens server-side, so no client-side pass is needed and no separate `totalScanned` figure applies.
3. Parse the response the same way `searchTestCasesByFolder`'s DC branch does (array, `.values`, or `.results` shapes).

### Error handling

- Axios errors on either platform: unwrapped via `this.formatError(error)`, rethrown as `McpError(ErrorCode.InternalError, ...)`, matching every other handler in this file.
- `name_contains` validation happens before any network call.

### Return format

Text block matching the existing search tools' shape:

```
✅ Found 3 test case(s) matching "login" in project PROJ:
{
  "project_key": "PROJ",
  "name_contains": "login",
  "folder": "/Auth" | null,
  "testCaseKeys": ["PROJ-T101", "PROJ-T145", "PROJ-T201"],
  "totalCount": 3,
  "totalScanned": 842
}
```

(`totalScanned` omitted on Data Center, since the API does the filtering.)

---

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | Add `SearchTestCasesByNameArgs` interface (`project_key`, `name_contains`, `folder_path?`, `max_results?`) |
| `src/tool-schemas.ts` | Append `search_test_cases` schema entry |
| `src/tool-handlers.ts` | Add `searchTestCases()` method to `ZephyrToolHandlers`, reusing `resolveFolderIdByPath` and the same pagination/query-building patterns as `searchTestCasesByFolder` |
| `src/index.ts` | Add `case 'search_test_cases'` to the tool-dispatch switch |
| `test/zephyr-server.test.cjs` | Unit test: tool registration with correct schema (`project_key`/`name_contains` required, `folder_path`/`max_results` optional); empty `name_contains` validation |
| `README.md` | Add `search_test_cases` to the MCP Tools reference section, near `search_test_cases_by_folder` |

---

## Implementation Notes

- Named `SearchTestCasesByNameArgs` (not reusing `SearchTestCasesArgs`) to avoid clashing with `search_test_cases_by_folder`'s existing type of the same shape-adjacent name.
- The Cloud pagination loop duplicates logic from `searchTestCasesByFolder`. Intentional — no shared helper extracted until there's a third caller (matches the "no abstraction until three callers" precedent already established in this codebase's step-tools design).
- `search_test_cases_by_folder` is left completely untouched; this is a new, additive tool.
