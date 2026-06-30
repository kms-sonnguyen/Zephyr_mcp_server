# Design: `get_test_case_steps` and `update_test_case_steps` MCP Tools

**Date:** 2026-06-30  
**Status:** Approved

---

## Background

The MCP server currently exposes `get_test_case` (which fetches metadata and embeds `testScript` content for BDD/PLAIN_TEXT scripts, but does **not** return STEP_BY_STEP step content — that requires a separate `/teststeps` endpoint) and `update_test_case_bdd` (the only write path for test content, forces BDD/Gherkin format). There is no way to read existing STEP_BY_STEP steps or update them in place without converting them to BDD.

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

| Parameter | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `test_case_key` | string | Yes | — | Test case key (e.g., `QA-T123`) |
| `start_at` | integer | No | minimum 0, default 0 | Zero-based page offset |
| `max_results` | integer | No | minimum 1, maximum 100, default 100 | Page size |

**Out-of-range values:** Rejected with `McpError(ErrorCode.InvalidParams, ...)` before the API call is made. Do not clamp silently.

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

**Step shape (unified):**

Each step is an object with these fields:
- `description` (string, optional) — step action text
- `testData` (string, optional) — input data for the step
- `expectedResult` (string, optional) — expected outcome
- `testCaseKey` (string, optional) — marks this step as a call-to-test reference

**Step validation rules (enforced before the API call):**

1. At least one of `testCaseKey` or `description` must be present. An empty step object `{}` is rejected with `McpError(ErrorCode.InvalidParams, ...)`.
2. If `testCaseKey` is present and any of `description`, `testData`, or `expectedResult` are also present, the call is rejected with `McpError(ErrorCode.InvalidParams, 'Step at index N: testCaseKey and inline fields (description/testData/expectedResult) are mutually exclusive')`. Silent ignore is not acceptable.
3. If `testCaseKey` is absent, `description` is required. A step with only `testData` or `expectedResult` but no `description` is rejected.

### Behavior

- **Cloud:** Validates all steps (rules above), then maps to the `items` array:
  - `testCaseKey` present → `{ testCase: { testCaseKey } }`
  - Otherwise → `{ inline: { description, testData: testData ?? null, expectedResult: expectedResult ?? null } }`
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
| `test/zephyr-server.test.cjs` | Unit tests: tool registration, steps-to-items mapping (inline and call-to-test), mode defaulting to APPEND, Data Center rejection, `null` handling for `testData`/`expectedResult`, step validation rules |
| `README.md` | Add both tools to the MCP Tools reference section |

---

## Implementation Notes

- The step-to-items mapping logic duplicates code from `upsertTestScriptCloud`. This is intentional — no abstraction until there are three callers.
- `null` vs omitted fields: pass `testData` and `expectedResult` as `null` when absent (matching existing `upsertTestScriptCloud` behavior), not omitted, so the API overwrites any previously set values in OVERWRITE mode.
- Error handling follows the existing pattern: catch axios errors, unwrap via `this.formatError(error)`, rethrow as `McpError(ErrorCode.InternalError, ...)`.
- Step validation runs before the axios call so invalid payloads never reach the API.
