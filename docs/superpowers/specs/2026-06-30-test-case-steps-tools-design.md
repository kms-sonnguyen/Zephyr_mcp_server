# Design: `get_test_case_steps` and `update_test_case_steps` MCP Tools

**Date:** 2026-06-30  
**Status:** Approved

---

## Background

The MCP server currently exposes `get_test_case` (which returns metadata only — no step content) and `update_test_case_bdd` (the only write path for test content, forces BDD/Gherkin format). There is no way to read existing STEP_BY_STEP steps or update them in place without converting them to BDD.

The Zephyr Scale Cloud API v2 provides two endpoints that close this gap:

- `GET /testcases/{testCaseKey}/teststeps` — fetches existing steps with pagination
- `POST /testcases/{testCaseKey}/teststeps` — writes steps with a `mode` parameter (`APPEND` or `OVERWRITE`)

These are **Cloud only**. Data Center (API v1) embeds test script content in the main test case record, not in a separate steps endpoint.

The step-writing logic (`{ mode, items }` payload shape) is already implemented internally in `upsertTestScriptCloud` for `create_test_case`. This design exposes it as a standalone tool.

---

## Goals

1. Let AI assistants read existing STEP_BY_STEP test steps without having to recreate them.
2. Let AI assistants append or overwrite STEP_BY_STEP test steps without converting them to BDD.
3. Support both inline steps (`description`, `testData`, `expectedResult`) and call-to-test references (`testCaseKey`), matching the existing `create_test_case` schema.

## Non-goals

- Data Center support (no equivalent endpoint exists in DC API v1).
- Auto-pagination in `get_test_case_steps` (callers navigate pages via `start_at`/`max_results`).
- Updating BDD or PLAIN_TEXT scripts (existing `update_test_case_bdd` tool handles that).

---

## Tool 1: `get_test_case_steps`

### Schema

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_case_key` | string | Yes | Test case key (e.g., `QA-T123`) |
| `start_at` | integer | No | Zero-based offset for pagination (default 0) |
| `max_results` | integer | No | Page size (default 100) |

### Behavior

- **Cloud:** GETs `{apiEndpoints.testcase}/{key}/teststeps?startAt={start_at}&maxResults={max_results}`. Returns the raw API response as JSON text (includes `values`, `total`, `startAt`, `maxResults` pagination fields).
- **Data Center:** Throws `McpError(ErrorCode.InvalidRequest, 'get_test_case_steps is only supported on Zephyr Scale Cloud...')`.

### Return format

Raw JSON from the API. Example shape:
```json
{
  "startAt": 0,
  "maxResults": 100,
  "total": 3,
  "values": [
    {
      "id": 1,
      "index": 0,
      "inline": {
        "description": "Navigate to homepage",
        "testData": null,
        "expectedResult": "Page loads"
      }
    },
    {
      "id": 2,
      "index": 1,
      "testCase": { "testCaseKey": "QA-T100" }
    }
  ]
}
```

---

## Tool 2: `update_test_case_steps`

### Schema

| Parameter | Type | Required | Description |
|---|---|---|---|
| `test_case_key` | string | Yes | Test case key to update |
| `steps` | array | Yes | Steps to write (see step shape below) |
| `mode` | `APPEND` \| `OVERWRITE` | No | Default `APPEND` (safe default — avoids accidental data loss) |

**Step shape (unified — Option A):**

Each step object may include any combination of:
- `description` (string, optional) — step action text
- `testData` (string, optional) — input data for the step
- `expectedResult` (string, optional) — expected outcome
- `testCaseKey` (string, optional) — if present, step is a call-to-test reference; other fields ignored

### Behavior

- **Cloud:** Maps `steps` to the `items` array format the API expects:
  - If `testCaseKey` present → `{ testCase: { testCaseKey } }`
  - Otherwise → `{ inline: { description, testData, expectedResult } }`
  - POSTs `{ mode, items }` to `{apiEndpoints.testcase}/{key}/teststeps`.
  - Returns a success message with the test case key, mode used, and count of steps sent.
- **Data Center:** Throws `McpError(ErrorCode.InvalidRequest, 'update_test_case_steps is only supported on Zephyr Scale Cloud...')`.

### Return format

Text confirmation. Example:
```
✅ Updated QA-T123 test steps successfully (mode: APPEND, 3 steps sent)
```

---

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | Add `GetTestCaseStepsArgs`, `UpdateTestCaseStepsArgs` interfaces |
| `src/tool-schemas.ts` | Append schema entries for both tools |
| `src/tool-handlers.ts` | Add `getTestCaseSteps()` and `updateTestCaseSteps()` methods to `ZephyrToolHandlers` |
| `src/index.ts` | Add `case 'get_test_case_steps'` and `case 'update_test_case_steps'` to the switch |
| `test/zephyr-server.test.cjs` | Add assertions that both tools appear in the registered tool list |

---

## Implementation Notes

- The step-to-items mapping logic duplicates code from `upsertTestScriptCloud`. This is intentional — no abstraction until there are three callers.
- `null` vs omitted fields: pass `testData` and `expectedResult` as `null` when absent (matching existing `upsertTestScriptCloud` behavior), not omitted, so the API overwrites any previously set values in OVERWRITE mode.
- Error handling follows the existing pattern: catch axios errors, unwrap via `this.formatError(error)`, rethrow as `McpError(ErrorCode.InternalError, ...)`.
