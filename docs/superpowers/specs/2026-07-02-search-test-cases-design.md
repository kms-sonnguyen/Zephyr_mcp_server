# Design: `search_test_cases` MCP Tool

**Date:** 2026-07-02
**Status:** Approved

---

## Background

The server currently exposes `search_test_cases_by_folder`, which requires an exact `folder_path` and returns every test case in that folder. There is no way to search test cases by name — an assistant that only knows a rough title has to fetch entire folders and eyeball the results.

The two Zephyr Scale platforms differ sharply in what's available server-side:

- **Cloud (v2):** `GET /testcases` only accepts `projectKey`, `folderId`, `maxResults`, `startAt`. There is no name/status/priority/label filter and no query-language endpoint — confirmed both by SmartBear support ("get all Test Cases and iterate over the results") and by this repo's own `apiEndpoints.search` (`/testcases/search`) being defined but never called anywhere in `tool-handlers.ts`.
- **Data Center (v1):** `GET /rest/atm/1.0/testcase/search` accepts a real JQL-like `query` string supporting `projectKey`, `key`, `name`, `status`, `priority`, `component`, `folder`, `estimatedTime`, `labels`, `owner`, and custom fields, with operators `=`, `>`, `>=`, `<`, `<=`, `IN`. This repo already calls this endpoint in `searchTestCasesByFolder`'s DC branch, but only ever builds a `projectKey = "X" AND folder = "Y"` query — it never uses `name`.

**Operator caveat:** every documentation source found for DC's TQL (SmartBear JQL Functions docs, community threads) lists the supported operators as exactly `=, >, >=, <, <=, IN` — no `~` (contains) operator appears anywhere. An earlier draft of this design proposed `name ~ "needle"` for substring matching on DC, but that operator is unconfirmed and risks a runtime API error if TQL rejects it. Since `name` only reliably supports `=` (exact match), and the goal is substring search, this design uses **client-side filtering on Data Center too** — see Behavior below.

This design adds name search on both platforms via client-side filtering, since Cloud has no alternative and DC's exact-match-only `name =` doesn't satisfy the substring requirement.

---

## Goals

1. Let an assistant find test cases by a name substring, scoped to a project and optionally a folder.
2. Reuse the existing pagination/folder-resolution patterns already in `tool-handlers.ts` rather than inventing new ones.
3. Support Data Center via its existing `/testcase/search` endpoint for project/folder scoping, even though the primary user only runs Cloud and this path won't get integration coverage from them.

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
2. Paginate `GET /testcases` with `{ projectKey, folderId?, maxResults: 1000, startAt }` until the API signals the last page **or a scan cap of 5000 test cases is reached** — fetching regardless of `max_results` (there's no server-side name filter, so under-fetching risks missing matches). This mirrors the existing loop in `searchTestCasesByFolder` (tool-handlers.ts:1096-1119), except it does not stop early at `max_results` — see Implementation Notes.
3. Filter the fetched set: `tc.name.toLowerCase().includes(name_contains.toLowerCase().trim())`.
4. Slice matches to `max_results`.
5. Return matched test case keys/names, `totalCount` (matches returned), `totalScanned` (test cases fetched before filtering), and `truncated` (`true` if the scan cap was hit before reaching the last page — meaning results may be incomplete).

**Unbounded-fetch trade-off:** when `folder_path` is omitted, this scans the *entire project*. For a project with tens of thousands of test cases, that's tens of API round-trips before any filtering happens — slow, and (on Cloud's rate limits) potentially throttled. The `folder_path` parameter was deliberately kept optional per user preference, so instead of requiring it, this design adds a **5000-test-case scan cap**: once hit, the tool returns whatever matches were found so far with `truncated: true` in the response, rather than either hanging on huge projects or guessing at an unbounded fetch. Callers who need exhaustive results on a very large project should narrow with `folder_path`. 5000 is a starting default, not tuned against a real large project — worth revisiting after first use if it's too low or unnecessarily conservative.

### Behavior — Data Center

1. If `folder_path` is given, it's inlined directly into the TQL query (no ID pre-resolution — DC's `folder` field takes a path string, matching current `searchTestCasesByFolder` DC behavior).
2. Build a TQL query scoped to `projectKey = "X"` [`AND folder = "Y"` if `folder_path` given] — **no `name` clause**, per the operator caveat above. `folder_path` is escaped for embedded double quotes, matching the existing `escapedFolderPath` handling in `searchTestCasesByFolder`.
3. `GET` the search endpoint (`apiEndpoints.search`) with `{ query, maxResults: <scan cap, e.g. 1000> }`. Note `maxResults` here bounds the *scan*, not the match count — same reasoning as Cloud, and subject to the same 5000-item scan cap and `truncated` flag if DC's search endpoint supports paging (needs confirming during implementation; if it doesn't, the cap is simply the single request's `maxResults`).
4. Parse the response the same way `searchTestCasesByFolder`'s DC branch does (array, `.values`, or `.results` shapes).
5. Filter the fetched set client-side, identically to the Cloud path (step 3 above): `tc.name.toLowerCase().includes(name_contains.toLowerCase().trim())`.
6. Slice matches to `max_results`, return the same shape as Cloud (including `totalScanned`/`truncated` — DC gets the same transparency fields now that both platforms filter client-side).

### Error handling

- Axios errors on either platform: unwrapped via `this.formatError(error)`, rethrown as `McpError(ErrorCode.InternalError, ...)`, matching every other handler in this file.
- `name_contains` validation happens before any network call.

### Return format

Text block matching the existing search tools' shape. Same shape on both platforms, since both now filter client-side.

With a folder scope:
```
✅ Found 3 test case(s) matching "login" in project PROJ:
{
  "project_key": "PROJ",
  "name_contains": "login",
  "folder": "/Auth",
  "testCaseKeys": ["PROJ-T101", "PROJ-T145", "PROJ-T201"],
  "totalCount": 3,
  "totalScanned": 842,
  "truncated": false
}
```

Without a folder scope (`folder` is `null`):
```
✅ Found 1 test case(s) matching "checkout" in project PROJ:
{
  "project_key": "PROJ",
  "name_contains": "checkout",
  "folder": null,
  "testCaseKeys": ["PROJ-T404"],
  "totalCount": 1,
  "totalScanned": 5000,
  "truncated": true
}
```

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
- **Pagination divergence from `searchTestCasesByFolder` is intentional — do not "fix" it to match.** The existing tool uses `pageSize = Math.min(max_results, 1000)` and stops as soon as it has `max_results` items, because every fetched item is already a valid result. This tool's `max_results` instead caps *matches after filtering*, not *raw fetches* — stopping the fetch early at `max_results` raw records would silently miss later matches. So this tool always requests full 1000-item pages and only stops at the last page or the 5000-item scan cap, never at `max_results`.
- DC's paging support for `/testcase/search` (whether it honors `startAt`/`firstResult` the same way the folder-search DC branch assumes) should be confirmed during implementation — the existing DC branch of `searchTestCasesByFolder` doesn't paginate at all, it makes one request with `maxResults`. If DC's search endpoint turns out not to support paging beyond one page, the scan cap for DC becomes "however many that one request returns" rather than the full 5000 — note this as a known platform difference rather than a bug if so.
- `search_test_cases_by_folder` is left completely untouched; this is a new, additive tool.
