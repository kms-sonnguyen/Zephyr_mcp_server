# Jira Link Tools + get_test_script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 new MCP tools — `get_test_script` (Cloud + Data Center) plus 11 Cloud-only Jira-link tools spanning test cases, test cycles, and test executions (create/get links, get-linked-to-issue reverse lookups) — closing the gap identified against the official SmartBear Zephyr integration docs.

**Architecture:** Each tool is a thin wrapper on `ZephyrToolHandlers`: optional DC guard → one `axiosInstance` call → explicit field-projection mapping → JSON-text or `✅ ...` success response. No new abstractions — follows the exact class/method/dispatch pattern already used by `getFolders`, `getTestCaseSteps`, and the 4 lookup tools (`getProjects` et al.) in `tool-handlers.ts`. The 3 `create_*_issue_link` tools reuse the existing private `resolveJiraIssueId()` helper instead of adding new Jira-auth code.

**Tech Stack:** TypeScript (ES2022/Node16 modules), `@modelcontextprotocol/sdk`, `axios`. No new dependencies.

## Global Constraints

- **11 of the 12 tools are Cloud-only.** Every tool except `get_test_script` throws `McpError(ErrorCode.InvalidRequest, ...)` immediately when `this.jiraConfig.type === 'datacenter'`, before any network call — matching the existing `update_test_run`/`add_test_cases_to_run` precedent (`ErrorCode.InvalidRequest`, not `InternalError`). `get_test_script` has no guard — its endpoint is already called unconditionally for both platforms inside the existing `getTestCase()` handler.
- **Exact DC-guard message template** (verbatim, one per tool, `{tool_name}` and `{endpoint_desc}` substituted per task): `"{tool_name} is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose {endpoint_desc}."`
- **`/testexecutions/` and `/issuelinks/` prefixes are hardcoded directly in the 5 tools that touch them**, never routed through `this.jiraConfig.apiEndpoints` — that interface (`ApiEndpoints` in `types.ts`) has no `testexecution` or `issuelink` key. This matches how the existing `getTestExecution()` handler already hardcodes `/testexecutions/${execution_id}` (`tool-handlers.ts:1213`) instead of adding a config key for a single call site.
- **Issue key resolution:** the 3 `create_*_issue_link` tools (`create_test_case_issue_link`, `create_test_cycle_issue_link`, `create_test_execution_issue_link`) accept a Jira issue **key** (`issue_key`, e.g. `PROJ-123`) and resolve it to the numeric `issueId` the API requires via the existing private `resolveJiraIssueId()` method (`tool-handlers.ts:1686`) — the same one `createTestCaseCloud`/`createTestRunCloud` already use. Requires `JIRA_USERNAME`+`JIRA_API_TOKEN` env vars (Jira Cloud Basic Auth), falling back to the Zephyr Bearer token otherwise, exactly as today. Unlike `create_test_case`'s bulk `issue_links` array (which collects per-link warnings and continues), these 3 tools create exactly one link per call — if `resolveJiraIssueId()` throws, the error propagates directly as `McpError(ErrorCode.InternalError, ...)`, no warning-and-continue behavior.
- **Response field projection:** every response is built via an explicit object-literal/`.map()` allow-list of named fields (matching `getFolders`/`getStatuses` convention), never a raw passthrough of the axios response body — except `get_test_script`, which *is* a raw passthrough (matching `getTestCaseSteps`'s convention for that one tool, since its shape is already minimal: `{ id, type, text }`).
- **`self` URL handling:** kept in `get_test_case_links`, `get_test_cycle_links`, `get_test_execution_links`, and all 5 `create_*_link` success responses — it's the only handle to reference a specific link. Dropped in the 3 `get_*_linked_to_issue` reverse lookups (`get_test_cases_linked_to_issue`, `get_test_cycles_linked_to_issue`, `get_test_executions_linked_to_issue`) — there it's pure noise pointing at a detail endpoint the caller already knows how to construct.
- **No pagination handling needed.** Unlike the 4 lookup tools' `/projects`, `/statuses`, etc. (which return a `PagedList` envelope with `values`/`total`/`isLast`), every endpoint in this plan returns either a single object (`TestScript`, `TestCaseLinkList`, `TestCycleLinkList`, `TestExecutionLinkList`) or a bare unpaginated array (`TestCaseKeyAndVersionList`, `TestCycleIdList`, `TestExecutionIdList`, `CreatedResource`) — confirmed against the real OpenAPI spec, not assumed.
- **Non-goals (do not implement):** deleting links (`DELETE /links/{linkId}`), web links on test executions (the API has no such endpoint — `TestExecutionLinkList` only has an `issues` field), a standalone `create_test_script` write tool.
- Design spec: `docs/superpowers/specs/2026-07-29-jira-links-and-test-script-design.md` — full endpoint/schema verification detail (including the raw OpenAPI YAML line numbers) lives there.

**`testSchemaContainsNewTools` is intentionally left untouched**, same as the lookup-tools plan's precedent — that test only checks 3 hardcoded tool names and is superseded by each new tool's own schema/dispatch assertions in its unit test.

**`test/integration.test.cjs` is intentionally left untouched**, same as the lookup-tools plan's precedent — every method in that file is a simulated placeholder that never calls the live API, and adding 12 more in that style would just be more of the same placeholder pattern this process forbids. The unit tests in each task below (DC-guard behavior, request URL/param/body construction, response shaping, all against a mocked `axiosInstance`) are the real verification.

---

### Task 1: `get_test_script`

**Files:**
- Modify: `src/types.ts` (append `GetTestScriptArgs` interface)
- Modify: `src/tool-schemas.ts:679` (insert new schema entry before the closing `];`)
- Modify: `src/tool-handlers.ts:1716-1718` (add `getTestScript()` method between the end of `resolveJiraIssueId()` and `private formatError`)
- Modify: `src/index.ts` (insert dispatch case immediately before `case 'list_executions_by_cycle':`)
- Modify: `test/zephyr-server.test.cjs` (add `testGetTestScriptUnit()` method + register it)
- Modify: `README.md:126-128` (insert new `### Test Scripts` section between Test Case Management and Test Run Management)
- Modify: `CLAUDE.md:98-100` (insert new `### Test Scripts` section between Test Case Management and Test Run Management)

**Interfaces:**
- Produces: `GetTestScriptArgs { test_case_key: string }` (in `src/types.ts`).
- Produces: `ZephyrToolHandlers.getTestScript(args: GetTestScriptArgs): Promise<{ content: [{ type: 'text', text: string }] }>` — dispatched from `index.ts`'s `case 'get_test_script'`. No DC guard; works on both platforms.

- [ ] **Step 1: Add the `GetTestScriptArgs` type**

In `src/types.ts`, append after the existing `GetEnvironmentsArgs` interface (end of file):

```typescript
export interface GetTestScriptArgs {
  test_case_key: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert this entry immediately before the final `];`:

```typescript
  {
    name: 'get_test_script',
    description: 'Get the test script (PLAIN_TEXT or BDD content) for a specific test case. Zephyr stores BDD/plain-text test content under the test script resource, separate from STEP_BY_STEP steps — use get_test_case_steps instead for STEP_BY_STEP test cases.',
    inputSchema: {
      type: 'object',
      properties: {
        test_case_key: {
          type: 'string',
          description: 'Test case key (e.g., PROJ-T123)',
        },
      },
      required: ['test_case_key'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add this method after `testIndexDispatchesSearchTestCases()` (the last test method, immediately before `async runAllTests()`):

```javascript
  async testGetTestScriptUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- Cloud: successful fetch, raw passthrough ---
    const cloudConfig = { type: 'cloud', apiEndpoints: { testcase: '/testcases' } };
    const cloudRequests = [];
    const cloudAxios = {
      get: async (url) => {
        cloudRequests.push(url);
        return { data: { id: 1, type: 'plain', text: 'Attempt to login to the application' } };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(cloudAxios, cloudConfig);
    const cloudResult = await cloudHandlers.getTestScript({ test_case_key: 'QA-T1' });
    if (cloudRequests[0] !== '/testcases/QA-T1/testscript') {
      throw new Error(`Expected GET /testcases/QA-T1/testscript, got ${cloudRequests[0]}`);
    }
    if (!cloudResult.content[0].text.includes('"plain"')) throw new Error('Expected script type "plain" in response');
    if (!cloudResult.content[0].text.includes('Attempt to login')) throw new Error('Expected script text in response');

    // --- Data Center: not gated, same endpoint pattern via apiEndpoints.testcase ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testcase: '/rest/atm/1.0/testcase' } };
    const dcRequests = [];
    const dcAxios = {
      get: async (url) => {
        dcRequests.push(url);
        return { data: { id: 2, type: 'bdd', text: 'Given a user\nWhen they log in\nThen they see the dashboard' } };
      },
    };
    const dcHandlers = new ZephyrToolHandlers(dcAxios, dcConfig);
    const dcResult = await dcHandlers.getTestScript({ test_case_key: 'QA-T2' });
    if (dcRequests[0] !== '/rest/atm/1.0/testcase/QA-T2/testscript') {
      throw new Error(`Expected DC testscript URL, got ${dcRequests[0]}`);
    }
    if (!dcResult.content[0].text.includes('"bdd"')) throw new Error('Expected script type "bdd" in DC response');

    // --- Error propagation wraps axios failures in McpError ---
    const errorAxios = { get: async () => { throw new Error('boom'); } };
    const errorHandlers = new ZephyrToolHandlers(errorAxios, cloudConfig);
    try {
      await errorHandlers.getTestScript({ test_case_key: 'QA-T1' });
      throw new Error('Expected McpError on axios failure');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError, got: ${e.message}`);
    }

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_test_script'")) throw new Error("'get_test_script' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_test_script':`)) throw new Error("build/index.js does not dispatch 'get_test_script'");
    if (!indexContent.includes('getTestScript(args')) throw new Error('build/index.js does not call toolHandlers.getTestScript(...)');
  }
```

Then register it in `runAllTests()`, after the `search_test_cases Index Dispatch` line (the last registered test):

```javascript
    await this.runTest('get_test_script Unit Tests', () => this.testGetTestScriptUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_script Unit Tests - FAILED` (`getTestScript` doesn't exist yet on `ZephyrToolHandlers`, so calling it throws a `TypeError`, not the expected behavior). Every other test still passes.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add this method immediately after the closing brace of `resolveJiraIssueId()` (ends at line 1716), before `private formatError(error: unknown): string {` (line 1718):

```typescript
  async getTestScript(args: GetTestScriptArgs) {
    const { test_case_key } = args;
    try {
      const response = await this.axiosInstance.get(
        `${this.jiraConfig.apiEndpoints.testcase}/${test_case_key}/testscript`
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get test script: ${this.formatError(error)}`);
    }
  }
```

Add `GetTestScriptArgs` to the import block at the top of `src/tool-handlers.ts`, right after `GetEnvironmentsArgs,`:

```typescript
  GetEnvironmentsArgs,
  GetTestScriptArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before the `case 'list_executions_by_cycle':` line — i.e. right after the `get_environments` case:

```typescript
          case 'get_test_script':
            return await this.toolHandlers.getTestScript(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_script Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

In `README.md`, insert this new section between the end of `### Test Case Management` (line 126) and `### Test Run Management` (line 128):

```markdown

### Test Scripts
- `get_test_script`: Get the test script (PLAIN_TEXT or BDD content) for a test case — use this instead of `get_test_case_steps` for non-STEP_BY_STEP test cases.
```

- [ ] **Step 9: Update CLAUDE.md**

In `CLAUDE.md`, insert this new section between the end of `### Test Case Management` (line 98) and `### Test Run Management` (line 100):

```markdown

### Test Scripts
- `get_test_script` — `GET {testcase}/{key}/testscript`; works on both Cloud and Data Center (already used internally by `getTestCase()`)
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_test_script tool"
```

---

### Task 2: `get_test_case_links`

**Files:**
- Modify: `src/types.ts` (append `GetTestCaseLinksArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry before the closing `];`, after the `get_test_script` entry)
- Modify: `src/tool-handlers.ts` (add `getTestCaseLinks()` method after `getTestScript()`)
- Modify: `src/index.ts` (insert dispatch case immediately before `case 'list_executions_by_cycle':`, right after the `get_test_script` case)
- Modify: `test/zephyr-server.test.cjs` (add `testGetTestCaseLinksUnit()` method + register it)
- Modify: `README.md` (insert new `### Jira Links` section after `### Lookup & Reference Data`, before `## Usage Examples`)
- Modify: `CLAUDE.md` (insert new `### Jira Links` section after `### Lookup / Reference Data`, before the `---` separator)

**Interfaces:**
- Produces: `GetTestCaseLinksArgs { test_case_key: string }`.
- Produces: `ZephyrToolHandlers.getTestCaseLinks(args: GetTestCaseLinksArgs)` — Cloud only.

- [ ] **Step 1: Add the `GetTestCaseLinksArgs` type**

In `src/types.ts`, append after `GetTestScriptArgs`:

```typescript
export interface GetTestCaseLinksArgs {
  test_case_key: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after the `get_test_script` entry:

```typescript
  {
    name: 'get_test_case_links',
    description: 'Get all links (Jira issue links and web links) associated with a test case. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        test_case_key: {
          type: 'string',
          description: 'Test case key (e.g., PROJ-T123)',
        },
      },
      required: ['test_case_key'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testGetTestScriptUnit()`:

```javascript
  async testGetTestCaseLinksUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testcase: '/rest/atm/1.0/testcase' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestCaseLinks({ test_case_key: 'QA-T1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: response shaped, self kept ---
    const cloudConfig = { type: 'cloud', apiEndpoints: { testcase: '/testcases' } };
    const requests = [];
    const mockAxios = {
      get: async (url) => {
        requests.push(url);
        return {
          data: {
            issues: [{ id: 1, issueId: 10100, type: 'COVERAGE', target: 'https://x/rest/api/2/issue/10100', self: 'https://x/links/1' }],
            webLinks: [{ id: 2, url: 'https://atlassian.com', description: 'A link to atlassian.com', type: 'RELATED', self: 'https://x/links/2' }],
          },
        };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    const result = await cloudHandlers.getTestCaseLinks({ test_case_key: 'QA-T1' });
    if (requests[0] !== '/testcases/QA-T1/links') throw new Error(`Expected GET /testcases/QA-T1/links, got ${requests[0]}`);
    const text = result.content[0].text;
    if (!text.includes('"issueId": 10100')) throw new Error('Expected issueId 10100 in response');
    if (!text.includes('"url": "https://atlassian.com"')) throw new Error('Expected web link url in response');
    if (!text.includes('"self": "https://x/links/1"')) throw new Error('Expected self URL kept for issue link');
    if (!text.includes('"self": "https://x/links/2"')) throw new Error('Expected self URL kept for web link');

    // --- Empty response: missing issues/webLinks default to empty arrays ---
    const emptyAxios = { get: async () => ({ data: {} }) };
    const emptyHandlers = new ZephyrToolHandlers(emptyAxios, cloudConfig);
    const emptyResult = await emptyHandlers.getTestCaseLinks({ test_case_key: 'QA-T2' });
    const emptyPayload = JSON.parse(emptyResult.content[0].text);
    if (!Array.isArray(emptyPayload.issues) || emptyPayload.issues.length !== 0) throw new Error('Expected empty issues array');
    if (!Array.isArray(emptyPayload.webLinks) || emptyPayload.webLinks.length !== 0) throw new Error('Expected empty webLinks array');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_test_case_links'")) throw new Error("'get_test_case_links' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_test_case_links':`)) throw new Error("build/index.js does not dispatch 'get_test_case_links'");
    if (!indexContent.includes('getTestCaseLinks(args')) throw new Error('build/index.js does not call toolHandlers.getTestCaseLinks(...)');
  }
```

Register it in `runAllTests()`, after `get_test_script Unit Tests`:

```javascript
    await this.runTest('get_test_case_links Unit Tests', () => this.testGetTestCaseLinksUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_case_links Unit Tests - FAILED` (`getTestCaseLinks` doesn't exist yet). Task 1's test still passes.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `getTestScript()`:

```typescript
  async getTestCaseLinks(args: GetTestCaseLinksArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_test_case_links is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /links endpoint.'
      );
    }

    const { test_case_key } = args;

    try {
      const response = await this.axiosInstance.get(`${this.jiraConfig.apiEndpoints.testcase}/${test_case_key}/links`);
      const data = response.data;
      const issues: any[] = Array.isArray(data?.issues) ? data.issues : [];
      const webLinks: any[] = Array.isArray(data?.webLinks) ? data.webLinks : [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            issues: issues.map((i: any) => ({
              id: i.id, issueId: i.issueId, type: i.type, target: i.target, self: i.self,
            })),
            webLinks: webLinks.map((w: any) => ({
              id: w.id, url: w.url, description: w.description ?? null, type: w.type, self: w.self,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to get test case links: ${this.formatError(error)}`);
    }
  }
```

Add `GetTestCaseLinksArgs` to the import block, after `GetTestScriptArgs,`:

```typescript
  GetTestScriptArgs,
  GetTestCaseLinksArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after the `get_test_script` case:

```typescript
          case 'get_test_case_links':
            return await this.toolHandlers.getTestCaseLinks(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_case_links Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

In `README.md`, insert this new section between the last bullet of `### Lookup & Reference Data` (`get_environments`) and `## Usage Examples`:

```markdown

### Jira Links
- `get_test_case_links`: Get all links (Jira issue links and web links) associated with a test case. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

In `CLAUDE.md`, insert this new section between the last bullet of `### Lookup / Reference Data` (`get_environments`) and the `---` separator before `## MCP Resources`:

```markdown

### Jira Links
- `get_test_case_links` — Cloud only; `GET /testcases/{key}/links`; `self` kept in the response as the only handle to a specific link
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_test_case_links tool (Cloud only)"
```

---

### Task 3: `create_test_case_web_link`

**Files:**
- Modify: `src/types.ts` (append `CreateTestCaseWebLinkArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after the `get_test_case_links` entry)
- Modify: `src/tool-handlers.ts` (add `createTestCaseWebLink()` method after `getTestCaseLinks()`)
- Modify: `src/index.ts` (insert dispatch case, right after the `get_test_case_links` case)
- Modify: `test/zephyr-server.test.cjs` (add `testCreateTestCaseWebLinkUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`)

**Interfaces:**
- Produces: `CreateTestCaseWebLinkArgs { test_case_key: string; url: string; description?: string }`.
- Produces: `ZephyrToolHandlers.createTestCaseWebLink(args: CreateTestCaseWebLinkArgs)` — Cloud only.

- [ ] **Step 1: Add the `CreateTestCaseWebLinkArgs` type**

In `src/types.ts`, append after `GetTestCaseLinksArgs`:

```typescript
export interface CreateTestCaseWebLinkArgs {
  test_case_key: string;
  url: string;
  description?: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `get_test_case_links`:

```typescript
  {
    name: 'create_test_case_web_link',
    description: 'Create a web link that associates a test case with a generic URL. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        test_case_key: {
          type: 'string',
          description: 'Test case key (e.g., PROJ-T123)',
        },
        url: {
          type: 'string',
          description: 'The web link URL',
        },
        description: {
          type: 'string',
          description: 'The web link description (optional)',
        },
      },
      required: ['test_case_key', 'url'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testGetTestCaseLinksUnit()`:

```javascript
  async testCreateTestCaseWebLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testcase: '/rest/atm/1.0/testcase' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestCaseWebLink({ test_case_key: 'QA-T1', url: 'https://example.com' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: with description ---
    const cloudConfig = { type: 'cloud', apiEndpoints: { testcase: '/testcases' } };
    const posted = [];
    const mockAxios = {
      post: async (url, body) => {
        posted.push({ url, body });
        return { data: { id: 5, self: 'https://x/links/5' } };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    const result = await cloudHandlers.createTestCaseWebLink({
      test_case_key: 'QA-T1', url: 'https://atlassian.com', description: 'A link to atlassian.com',
    });
    if (posted[0].url !== '/testcases/QA-T1/links/weblinks') throw new Error(`Expected POST to weblinks endpoint, got ${posted[0].url}`);
    if (posted[0].body.url !== 'https://atlassian.com') throw new Error('Expected url in POST body');
    if (posted[0].body.description !== 'A link to atlassian.com') throw new Error('Expected description in POST body');
    if (!result.content[0].text.includes('QA-T1')) throw new Error('Expected test case key in success message');
    if (!result.content[0].text.includes('"id": 5')) throw new Error('Expected created id in success message');
    if (!result.content[0].text.includes('links/5')) throw new Error('Expected self URL in success message');

    // --- Cloud: without description (optional field omitted from body) ---
    posted.length = 0;
    await cloudHandlers.createTestCaseWebLink({ test_case_key: 'QA-T1', url: 'https://example.com' });
    if ('description' in posted[0].body) throw new Error('description should be omitted from body when not provided');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'create_test_case_web_link'")) throw new Error("'create_test_case_web_link' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'create_test_case_web_link':`)) throw new Error("build/index.js does not dispatch 'create_test_case_web_link'");
    if (!indexContent.includes('createTestCaseWebLink(args')) throw new Error('build/index.js does not call toolHandlers.createTestCaseWebLink(...)');
  }
```

Register it in `runAllTests()`, after `get_test_case_links Unit Tests`:

```javascript
    await this.runTest('create_test_case_web_link Unit Tests', () => this.testCreateTestCaseWebLinkUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_case_web_link Unit Tests - FAILED`. Tasks 1-2 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `getTestCaseLinks()`:

```typescript
  async createTestCaseWebLink(args: CreateTestCaseWebLinkArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'create_test_case_web_link is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /links/weblinks endpoint.'
      );
    }

    const { test_case_key, url, description } = args;
    const payload: any = { url };
    if (description) payload.description = description;

    try {
      const response = await this.axiosInstance.post(
        `${this.jiraConfig.apiEndpoints.testcase}/${test_case_key}/links/weblinks`, payload
      );
      return {
        content: [{
          type: 'text',
          text: `✅ Web link created on ${test_case_key}: ${JSON.stringify({ id: response.data.id, self: response.data.self }, null, 2)}`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to create test case web link: ${this.formatError(error)}`);
    }
  }
```

Add `CreateTestCaseWebLinkArgs` to the import block, after `GetTestCaseLinksArgs,`:

```typescript
  GetTestCaseLinksArgs,
  CreateTestCaseWebLinkArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `get_test_case_links`:

```typescript
          case 'create_test_case_web_link':
            return await this.toolHandlers.createTestCaseWebLink(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_case_web_link Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`:

```markdown
- `create_test_case_web_link`: Create a web link that associates a test case with a generic URL. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`:

```markdown
- `create_test_case_web_link` — Cloud only; `POST /testcases/{key}/links/weblinks`
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add create_test_case_web_link tool (Cloud only)"
```

---

### Task 4: `create_test_case_issue_link`

**Files:**
- Modify: `src/types.ts` (append `CreateTestCaseIssueLinkArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after `create_test_case_web_link`)
- Modify: `src/tool-handlers.ts` (add `createTestCaseIssueLink()` method after `createTestCaseWebLink()`)
- Modify: `src/index.ts` (insert dispatch case, right after `create_test_case_web_link`)
- Modify: `test/zephyr-server.test.cjs` (add `testCreateTestCaseIssueLinkUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`)

**Interfaces:**
- Consumes: the existing private `ZephyrToolHandlers.resolveJiraIssueId(issueKey: string): Promise<number>` (already defined at `tool-handlers.ts:1686`, unchanged by this task).
- Produces: `CreateTestCaseIssueLinkArgs { test_case_key: string; issue_key: string }`.
- Produces: `ZephyrToolHandlers.createTestCaseIssueLink(args: CreateTestCaseIssueLinkArgs)` — Cloud only.

- [ ] **Step 1: Add the `CreateTestCaseIssueLinkArgs` type**

In `src/types.ts`, append after `CreateTestCaseWebLinkArgs`:

```typescript
export interface CreateTestCaseIssueLinkArgs {
  test_case_key: string;
  issue_key: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `create_test_case_web_link`:

```typescript
  {
    name: 'create_test_case_issue_link',
    description: 'Create a Jira issue link that associates a test case with a Jira issue. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        test_case_key: {
          type: 'string',
          description: 'Test case key (e.g., PROJ-T123)',
        },
        issue_key: {
          type: 'string',
          description: 'Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['test_case_key', 'issue_key'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testCreateTestCaseWebLinkUnit()`:

```javascript
  async testCreateTestCaseIssueLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testcase: '/rest/atm/1.0/testcase' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestCaseIssueLink({ test_case_key: 'QA-T1', issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: issue key resolved to numeric id, then POSTed ---
    const cloudConfig = {
      type: 'cloud',
      apiEndpoints: { testcase: '/testcases' },
      jiraBaseUrl: 'https://example.atlassian.net',
    };
    const posted = [];
    const mockAxios = {
      post: async (url, body) => {
        posted.push({ url, body });
        return { data: { id: 7, self: 'https://x/links/7' } };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    // Stub the private issue-resolution helper so this test doesn't depend on real Jira auth env vars
    cloudHandlers.resolveJiraIssueId = async (issueKey) => {
      if (issueKey !== 'QA-1') throw new Error(`Unexpected issue key ${issueKey}`);
      return 10100;
    };

    const result = await cloudHandlers.createTestCaseIssueLink({ test_case_key: 'QA-T1', issue_key: 'QA-1' });
    if (posted[0].url !== '/testcases/QA-T1/links/issues') throw new Error(`Expected POST to issues endpoint, got ${posted[0].url}`);
    if (posted[0].body.issueId !== 10100) throw new Error(`Expected issueId=10100 in POST body, got ${posted[0].body.issueId}`);
    if (!result.content[0].text.includes('QA-T1')) throw new Error('Expected test case key in success message');
    if (!result.content[0].text.includes('QA-1')) throw new Error('Expected issue key in success message');
    if (!result.content[0].text.includes('"id": 7')) throw new Error('Expected created id in success message');

    // --- Resolution failure propagates as McpError, not silently swallowed ---
    const failHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    failHandlers.resolveJiraIssueId = async () => { throw new Error('Could not resolve numeric ID for Jira issue "QA-404"'); };
    try {
      await failHandlers.createTestCaseIssueLink({ test_case_key: 'QA-T1', issue_key: 'QA-404' });
      throw new Error('Expected McpError when issue resolution fails');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError, got: ${e.message}`);
    }

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'create_test_case_issue_link'")) throw new Error("'create_test_case_issue_link' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'create_test_case_issue_link':`)) throw new Error("build/index.js does not dispatch 'create_test_case_issue_link'");
    if (!indexContent.includes('createTestCaseIssueLink(args')) throw new Error('build/index.js does not call toolHandlers.createTestCaseIssueLink(...)');
  }
```

Register it in `runAllTests()`, after `create_test_case_web_link Unit Tests`:

```javascript
    await this.runTest('create_test_case_issue_link Unit Tests', () => this.testCreateTestCaseIssueLinkUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_case_issue_link Unit Tests - FAILED`. Tasks 1-3 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `createTestCaseWebLink()`:

```typescript
  async createTestCaseIssueLink(args: CreateTestCaseIssueLinkArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'create_test_case_issue_link is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /links/issues endpoint.'
      );
    }

    const { test_case_key, issue_key } = args;

    try {
      const issueId = await this.resolveJiraIssueId(issue_key);
      const response = await this.axiosInstance.post(
        `${this.jiraConfig.apiEndpoints.testcase}/${test_case_key}/links/issues`, { issueId }
      );
      return {
        content: [{
          type: 'text',
          text: `✅ Issue link created on ${test_case_key} → ${issue_key}: ${JSON.stringify({ id: response.data.id, self: response.data.self }, null, 2)}`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to create test case issue link: ${this.formatError(error)}`);
    }
  }
```

Add `CreateTestCaseIssueLinkArgs` to the import block, after `CreateTestCaseWebLinkArgs,`:

```typescript
  CreateTestCaseWebLinkArgs,
  CreateTestCaseIssueLinkArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `create_test_case_web_link`:

```typescript
          case 'create_test_case_issue_link':
            return await this.toolHandlers.createTestCaseIssueLink(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_case_issue_link Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`:

```markdown
- `create_test_case_issue_link`: Create a Jira issue link that associates a test case with a Jira issue. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`:

```markdown
- `create_test_case_issue_link` — Cloud only; resolves `issue_key` → numeric `issueId` via `resolveJiraIssueId()`, then `POST /testcases/{key}/links/issues`
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add create_test_case_issue_link tool (Cloud only)"
```

---

### Task 5: `get_test_cases_linked_to_issue`

**Files:**
- Modify: `src/types.ts` (append `GetTestCasesLinkedToIssueArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after `create_test_case_issue_link`)
- Modify: `src/tool-handlers.ts` (add `getTestCasesLinkedToIssue()` method after `createTestCaseIssueLink()`)
- Modify: `src/index.ts` (insert dispatch case, right after `create_test_case_issue_link`)
- Modify: `test/zephyr-server.test.cjs` (add `testGetTestCasesLinkedToIssueUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`)

**Interfaces:**
- Produces: `GetTestCasesLinkedToIssueArgs { issue_key: string }`.
- Produces: `ZephyrToolHandlers.getTestCasesLinkedToIssue(args: GetTestCasesLinkedToIssueArgs)` — Cloud only.

- [ ] **Step 1: Add the `GetTestCasesLinkedToIssueArgs` type**

In `src/types.ts`, append after `CreateTestCaseIssueLinkArgs`:

```typescript
export interface GetTestCasesLinkedToIssueArgs {
  issue_key: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `create_test_case_issue_link`:

```typescript
  {
    name: 'get_test_cases_linked_to_issue',
    description: 'Get test case keys and versions linked to a given Jira issue. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        issue_key: {
          type: 'string',
          description: 'Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issue_key'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testCreateTestCaseIssueLinkUnit()`:

```javascript
  async testGetTestCasesLinkedToIssueUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestCasesLinkedToIssue({ issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: bare array response, key+version kept, self dropped ---
    const cloudConfig = { type: 'cloud', apiEndpoints: {} };
    const requests = [];
    const mockAxios = {
      get: async (url) => {
        requests.push(url);
        return { data: [{ key: 'PROJ-T42', version: 1, self: 'https://x/testcases/PROJ-T42/versions/1' }] };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    const result = await cloudHandlers.getTestCasesLinkedToIssue({ issue_key: 'PROJ-123' });
    if (requests[0] !== '/issuelinks/PROJ-123/testcases') throw new Error(`Expected GET /issuelinks/PROJ-123/testcases, got ${requests[0]}`);
    const payload = JSON.parse(result.content[0].text);
    if (payload.testCases.length !== 1) throw new Error(`Expected 1 test case, got ${payload.testCases.length}`);
    if (payload.testCases[0].key !== 'PROJ-T42') throw new Error('Expected key PROJ-T42');
    if (payload.testCases[0].version !== 1) throw new Error('Expected version 1');
    if ('self' in payload.testCases[0]) throw new Error('self should be dropped from reverse-lookup response');

    // --- Empty result ---
    const emptyAxios = { get: async () => ({ data: [] }) };
    const emptyHandlers = new ZephyrToolHandlers(emptyAxios, cloudConfig);
    const emptyResult = await emptyHandlers.getTestCasesLinkedToIssue({ issue_key: 'PROJ-999' });
    const emptyPayload = JSON.parse(emptyResult.content[0].text);
    if (emptyPayload.testCases.length !== 0) throw new Error('Expected empty testCases array');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_test_cases_linked_to_issue'")) throw new Error("'get_test_cases_linked_to_issue' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_test_cases_linked_to_issue':`)) throw new Error("build/index.js does not dispatch 'get_test_cases_linked_to_issue'");
    if (!indexContent.includes('getTestCasesLinkedToIssue(args')) throw new Error('build/index.js does not call toolHandlers.getTestCasesLinkedToIssue(...)');
  }
```

Register it in `runAllTests()`, after `create_test_case_issue_link Unit Tests`:

```javascript
    await this.runTest('get_test_cases_linked_to_issue Unit Tests', () => this.testGetTestCasesLinkedToIssueUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_cases_linked_to_issue Unit Tests - FAILED`. Tasks 1-4 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `createTestCaseIssueLink()`:

```typescript
  async getTestCasesLinkedToIssue(args: GetTestCasesLinkedToIssueArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_test_cases_linked_to_issue is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose an /issuelinks endpoint.'
      );
    }

    const { issue_key } = args;

    try {
      const response = await this.axiosInstance.get(`/issuelinks/${issue_key}/testcases`);
      const data: any[] = Array.isArray(response.data) ? response.data : [];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            testCases: data.map((tc: any) => ({ key: tc.key, version: tc.version })),
          }, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to get test cases linked to issue: ${this.formatError(error)}`);
    }
  }
```

Add `GetTestCasesLinkedToIssueArgs` to the import block, after `CreateTestCaseIssueLinkArgs,`:

```typescript
  CreateTestCaseIssueLinkArgs,
  GetTestCasesLinkedToIssueArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `create_test_case_issue_link`:

```typescript
          case 'get_test_cases_linked_to_issue':
            return await this.toolHandlers.getTestCasesLinkedToIssue(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_cases_linked_to_issue Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`:

```markdown
- `get_test_cases_linked_to_issue`: Get test case keys and versions linked to a given Jira issue. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`:

```markdown
- `get_test_cases_linked_to_issue` — Cloud only; `GET /issuelinks/{issueKey}/testcases`, returns `{ key, version }` pairs
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_test_cases_linked_to_issue tool (Cloud only)"
```

---

### Task 6: `get_test_cycle_links`

**Files:**
- Modify: `src/types.ts` (append `GetTestCycleLinksArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after `get_test_cases_linked_to_issue`)
- Modify: `src/tool-handlers.ts` (add `getTestCycleLinks()` method after `getTestCasesLinkedToIssue()`)
- Modify: `src/index.ts` (insert dispatch case, right after `get_test_cases_linked_to_issue`)
- Modify: `test/zephyr-server.test.cjs` (add `testGetTestCycleLinksUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`)

**Interfaces:**
- Produces: `GetTestCycleLinksArgs { test_run_key: string }`.
- Produces: `ZephyrToolHandlers.getTestCycleLinks(args: GetTestCycleLinksArgs)` — Cloud only.

- [ ] **Step 1: Add the `GetTestCycleLinksArgs` type**

In `src/types.ts`, append after `GetTestCasesLinkedToIssueArgs`:

```typescript
export interface GetTestCycleLinksArgs {
  test_run_key: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `get_test_cases_linked_to_issue`:

```typescript
  {
    name: 'get_test_cycle_links',
    description: 'Get all links (Jira issue links, web links, and test plan links) associated with a test cycle. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        test_run_key: {
          type: 'string',
          description: 'Test cycle key or numeric ID (e.g., PROJ-R123)',
        },
      },
      required: ['test_run_key'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testGetTestCasesLinkedToIssueUnit()`:

```javascript
  async testGetTestCycleLinksUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testrun: '/rest/atm/1.0/testrun' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestCycleLinks({ test_run_key: 'QA-R1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: issues + webLinks + testPlans all shaped ---
    const cloudConfig = { type: 'cloud', apiEndpoints: { testrun: '/testcycles' } };
    const requests = [];
    const mockAxios = {
      get: async (url) => {
        requests.push(url);
        return {
          data: {
            issues: [{ id: 1, issueId: 10100, type: 'COVERAGE', target: 'https://x/rest/api/2/issue/10100', self: 'https://x/links/1' }],
            webLinks: [{ id: 2, url: 'https://atlassian.com', description: 'A link', type: 'RELATED', self: 'https://x/links/2' }],
            testPlans: [{ id: 3, testPlanId: 2, type: 'RELATED', target: 'https://x/rest/api/2/testplan/123', self: 'https://x/links/3' }],
          },
        };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    const result = await cloudHandlers.getTestCycleLinks({ test_run_key: 'QA-R1' });
    if (requests[0] !== '/testcycles/QA-R1/links') throw new Error(`Expected GET /testcycles/QA-R1/links, got ${requests[0]}`);
    const payload = JSON.parse(result.content[0].text);
    if (payload.issues[0].issueId !== 10100) throw new Error('Expected issueId 10100');
    if (payload.webLinks[0].url !== 'https://atlassian.com') throw new Error('Expected web link url');
    if (payload.testPlans[0].testPlanId !== 2) throw new Error('Expected testPlanId 2');
    if (payload.testPlans[0].self !== 'https://x/links/3') throw new Error('Expected self kept on testPlans item');

    // --- Missing fields default to empty arrays ---
    const emptyAxios = { get: async () => ({ data: {} }) };
    const emptyHandlers = new ZephyrToolHandlers(emptyAxios, cloudConfig);
    const emptyResult = await emptyHandlers.getTestCycleLinks({ test_run_key: 'QA-R2' });
    const emptyPayload = JSON.parse(emptyResult.content[0].text);
    if (emptyPayload.testPlans.length !== 0) throw new Error('Expected empty testPlans array');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_test_cycle_links'")) throw new Error("'get_test_cycle_links' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_test_cycle_links':`)) throw new Error("build/index.js does not dispatch 'get_test_cycle_links'");
    if (!indexContent.includes('getTestCycleLinks(args')) throw new Error('build/index.js does not call toolHandlers.getTestCycleLinks(...)');
  }
```

Register it in `runAllTests()`, after `get_test_cases_linked_to_issue Unit Tests`:

```javascript
    await this.runTest('get_test_cycle_links Unit Tests', () => this.testGetTestCycleLinksUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_cycle_links Unit Tests - FAILED`. Tasks 1-5 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `getTestCasesLinkedToIssue()`:

```typescript
  async getTestCycleLinks(args: GetTestCycleLinksArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_test_cycle_links is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /links endpoint.'
      );
    }

    const { test_run_key } = args;

    try {
      const response = await this.axiosInstance.get(`${this.jiraConfig.apiEndpoints.testrun}/${test_run_key}/links`);
      const data = response.data;
      const issues: any[] = Array.isArray(data?.issues) ? data.issues : [];
      const webLinks: any[] = Array.isArray(data?.webLinks) ? data.webLinks : [];
      const testPlans: any[] = Array.isArray(data?.testPlans) ? data.testPlans : [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            issues: issues.map((i: any) => ({
              id: i.id, issueId: i.issueId, type: i.type, target: i.target, self: i.self,
            })),
            webLinks: webLinks.map((w: any) => ({
              id: w.id, url: w.url, description: w.description ?? null, type: w.type, self: w.self,
            })),
            testPlans: testPlans.map((p: any) => ({
              id: p.id, testPlanId: p.testPlanId, type: p.type, target: p.target, self: p.self,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to get test cycle links: ${this.formatError(error)}`);
    }
  }
```

Add `GetTestCycleLinksArgs` to the import block, after `GetTestCasesLinkedToIssueArgs,`:

```typescript
  GetTestCasesLinkedToIssueArgs,
  GetTestCycleLinksArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `get_test_cases_linked_to_issue`:

```typescript
          case 'get_test_cycle_links':
            return await this.toolHandlers.getTestCycleLinks(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_cycle_links Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`:

```markdown
- `get_test_cycle_links`: Get all links (Jira issue links, web links, and test plan links) associated with a test cycle. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`:

```markdown
- `get_test_cycle_links` — Cloud only; `GET /testcycles/{key}/links`, response includes `issues`, `webLinks`, and `testPlans`
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_test_cycle_links tool (Cloud only)"
```

---

### Task 7: `create_test_cycle_web_link`

**Files:**
- Modify: `src/types.ts` (append `CreateTestCycleWebLinkArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after `get_test_cycle_links`)
- Modify: `src/tool-handlers.ts` (add `createTestCycleWebLink()` method after `getTestCycleLinks()`)
- Modify: `src/index.ts` (insert dispatch case, right after `get_test_cycle_links`)
- Modify: `test/zephyr-server.test.cjs` (add `testCreateTestCycleWebLinkUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`)

**Interfaces:**
- Produces: `CreateTestCycleWebLinkArgs { test_run_key: string; url: string; description?: string }`.
- Produces: `ZephyrToolHandlers.createTestCycleWebLink(args: CreateTestCycleWebLinkArgs)` — Cloud only.

- [ ] **Step 1: Add the `CreateTestCycleWebLinkArgs` type**

In `src/types.ts`, append after `GetTestCycleLinksArgs`:

```typescript
export interface CreateTestCycleWebLinkArgs {
  test_run_key: string;
  url: string;
  description?: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `get_test_cycle_links`:

```typescript
  {
    name: 'create_test_cycle_web_link',
    description: 'Create a web link that associates a test cycle with a generic URL. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        test_run_key: {
          type: 'string',
          description: 'Test cycle key or numeric ID (e.g., PROJ-R123)',
        },
        url: {
          type: 'string',
          description: 'The web link URL',
        },
        description: {
          type: 'string',
          description: 'The web link description (optional)',
        },
      },
      required: ['test_run_key', 'url'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testGetTestCycleLinksUnit()`:

```javascript
  async testCreateTestCycleWebLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testrun: '/rest/atm/1.0/testrun' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestCycleWebLink({ test_run_key: 'QA-R1', url: 'https://example.com' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: with description ---
    const cloudConfig = { type: 'cloud', apiEndpoints: { testrun: '/testcycles' } };
    const posted = [];
    const mockAxios = {
      post: async (url, body) => {
        posted.push({ url, body });
        return { data: { id: 9, self: 'https://x/links/9' } };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    const result = await cloudHandlers.createTestCycleWebLink({
      test_run_key: 'QA-R1', url: 'https://atlassian.com', description: 'A link to atlassian.com',
    });
    if (posted[0].url !== '/testcycles/QA-R1/links/weblinks') throw new Error(`Expected POST to weblinks endpoint, got ${posted[0].url}`);
    if (posted[0].body.url !== 'https://atlassian.com') throw new Error('Expected url in POST body');
    if (posted[0].body.description !== 'A link to atlassian.com') throw new Error('Expected description in POST body');
    if (!result.content[0].text.includes('QA-R1')) throw new Error('Expected test cycle key in success message');
    if (!result.content[0].text.includes('"id": 9')) throw new Error('Expected created id in success message');

    // --- Cloud: without description ---
    posted.length = 0;
    await cloudHandlers.createTestCycleWebLink({ test_run_key: 'QA-R1', url: 'https://example.com' });
    if ('description' in posted[0].body) throw new Error('description should be omitted from body when not provided');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'create_test_cycle_web_link'")) throw new Error("'create_test_cycle_web_link' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'create_test_cycle_web_link':`)) throw new Error("build/index.js does not dispatch 'create_test_cycle_web_link'");
    if (!indexContent.includes('createTestCycleWebLink(args')) throw new Error('build/index.js does not call toolHandlers.createTestCycleWebLink(...)');
  }
```

Register it in `runAllTests()`, after `get_test_cycle_links Unit Tests`:

```javascript
    await this.runTest('create_test_cycle_web_link Unit Tests', () => this.testCreateTestCycleWebLinkUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_cycle_web_link Unit Tests - FAILED`. Tasks 1-6 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `getTestCycleLinks()`:

```typescript
  async createTestCycleWebLink(args: CreateTestCycleWebLinkArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'create_test_cycle_web_link is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /links/weblinks endpoint.'
      );
    }

    const { test_run_key, url, description } = args;
    const payload: any = { url };
    if (description) payload.description = description;

    try {
      const response = await this.axiosInstance.post(
        `${this.jiraConfig.apiEndpoints.testrun}/${test_run_key}/links/weblinks`, payload
      );
      return {
        content: [{
          type: 'text',
          text: `✅ Web link created on ${test_run_key}: ${JSON.stringify({ id: response.data.id, self: response.data.self }, null, 2)}`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to create test cycle web link: ${this.formatError(error)}`);
    }
  }
```

Add `CreateTestCycleWebLinkArgs` to the import block, after `GetTestCycleLinksArgs,`:

```typescript
  GetTestCycleLinksArgs,
  CreateTestCycleWebLinkArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `get_test_cycle_links`:

```typescript
          case 'create_test_cycle_web_link':
            return await this.toolHandlers.createTestCycleWebLink(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_cycle_web_link Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`:

```markdown
- `create_test_cycle_web_link`: Create a web link that associates a test cycle with a generic URL. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`:

```markdown
- `create_test_cycle_web_link` — Cloud only; `POST /testcycles/{key}/links/weblinks`
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add create_test_cycle_web_link tool (Cloud only)"
```

---

### Task 8: `create_test_cycle_issue_link`

**Files:**
- Modify: `src/types.ts` (append `CreateTestCycleIssueLinkArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after `create_test_cycle_web_link`)
- Modify: `src/tool-handlers.ts` (add `createTestCycleIssueLink()` method after `createTestCycleWebLink()`)
- Modify: `src/index.ts` (insert dispatch case, right after `create_test_cycle_web_link`)
- Modify: `test/zephyr-server.test.cjs` (add `testCreateTestCycleIssueLinkUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`)

**Interfaces:**
- Consumes: the existing private `resolveJiraIssueId()`, same as Task 4.
- Produces: `CreateTestCycleIssueLinkArgs { test_run_key: string; issue_key: string }`.
- Produces: `ZephyrToolHandlers.createTestCycleIssueLink(args: CreateTestCycleIssueLinkArgs)` — Cloud only.

- [ ] **Step 1: Add the `CreateTestCycleIssueLinkArgs` type**

In `src/types.ts`, append after `CreateTestCycleWebLinkArgs`:

```typescript
export interface CreateTestCycleIssueLinkArgs {
  test_run_key: string;
  issue_key: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `create_test_cycle_web_link`:

```typescript
  {
    name: 'create_test_cycle_issue_link',
    description: 'Create a Jira issue link that associates a test cycle with a Jira issue. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        test_run_key: {
          type: 'string',
          description: 'Test cycle key or numeric ID (e.g., PROJ-R123)',
        },
        issue_key: {
          type: 'string',
          description: 'Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['test_run_key', 'issue_key'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testCreateTestCycleWebLinkUnit()`:

```javascript
  async testCreateTestCycleIssueLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testrun: '/rest/atm/1.0/testrun' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestCycleIssueLink({ test_run_key: 'QA-R1', issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: issue key resolved, then POSTed ---
    const cloudConfig = { type: 'cloud', apiEndpoints: { testrun: '/testcycles' } };
    const posted = [];
    const mockAxios = {
      post: async (url, body) => {
        posted.push({ url, body });
        return { data: { id: 11, self: 'https://x/links/11' } };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    cloudHandlers.resolveJiraIssueId = async (issueKey) => {
      if (issueKey !== 'QA-1') throw new Error(`Unexpected issue key ${issueKey}`);
      return 10100;
    };

    const result = await cloudHandlers.createTestCycleIssueLink({ test_run_key: 'QA-R1', issue_key: 'QA-1' });
    if (posted[0].url !== '/testcycles/QA-R1/links/issues') throw new Error(`Expected POST to issues endpoint, got ${posted[0].url}`);
    if (posted[0].body.issueId !== 10100) throw new Error(`Expected issueId=10100, got ${posted[0].body.issueId}`);
    if (!result.content[0].text.includes('QA-R1')) throw new Error('Expected test cycle key in success message');
    if (!result.content[0].text.includes('QA-1')) throw new Error('Expected issue key in success message');

    // --- Resolution failure propagates ---
    const failHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    failHandlers.resolveJiraIssueId = async () => { throw new Error('Could not resolve numeric ID for Jira issue "QA-404"'); };
    try {
      await failHandlers.createTestCycleIssueLink({ test_run_key: 'QA-R1', issue_key: 'QA-404' });
      throw new Error('Expected McpError when issue resolution fails');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError, got: ${e.message}`);
    }

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'create_test_cycle_issue_link'")) throw new Error("'create_test_cycle_issue_link' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'create_test_cycle_issue_link':`)) throw new Error("build/index.js does not dispatch 'create_test_cycle_issue_link'");
    if (!indexContent.includes('createTestCycleIssueLink(args')) throw new Error('build/index.js does not call toolHandlers.createTestCycleIssueLink(...)');
  }
```

Register it in `runAllTests()`, after `create_test_cycle_web_link Unit Tests`:

```javascript
    await this.runTest('create_test_cycle_issue_link Unit Tests', () => this.testCreateTestCycleIssueLinkUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_cycle_issue_link Unit Tests - FAILED`. Tasks 1-7 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `createTestCycleWebLink()`:

```typescript
  async createTestCycleIssueLink(args: CreateTestCycleIssueLinkArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'create_test_cycle_issue_link is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /links/issues endpoint.'
      );
    }

    const { test_run_key, issue_key } = args;

    try {
      const issueId = await this.resolveJiraIssueId(issue_key);
      const response = await this.axiosInstance.post(
        `${this.jiraConfig.apiEndpoints.testrun}/${test_run_key}/links/issues`, { issueId }
      );
      return {
        content: [{
          type: 'text',
          text: `✅ Issue link created on ${test_run_key} → ${issue_key}: ${JSON.stringify({ id: response.data.id, self: response.data.self }, null, 2)}`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to create test cycle issue link: ${this.formatError(error)}`);
    }
  }
```

Add `CreateTestCycleIssueLinkArgs` to the import block, after `CreateTestCycleWebLinkArgs,`:

```typescript
  CreateTestCycleWebLinkArgs,
  CreateTestCycleIssueLinkArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `create_test_cycle_web_link`:

```typescript
          case 'create_test_cycle_issue_link':
            return await this.toolHandlers.createTestCycleIssueLink(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_cycle_issue_link Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`:

```markdown
- `create_test_cycle_issue_link`: Create a Jira issue link that associates a test cycle with a Jira issue. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`:

```markdown
- `create_test_cycle_issue_link` — Cloud only; resolves `issue_key` → numeric `issueId`, then `POST /testcycles/{key}/links/issues`
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add create_test_cycle_issue_link tool (Cloud only)"
```

---

### Task 9: `get_test_cycles_linked_to_issue`

**Files:**
- Modify: `src/types.ts` (append `GetTestCyclesLinkedToIssueArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after `create_test_cycle_issue_link`)
- Modify: `src/tool-handlers.ts` (add `getTestCyclesLinkedToIssue()` method after `createTestCycleIssueLink()`)
- Modify: `src/index.ts` (insert dispatch case, right after `create_test_cycle_issue_link`)
- Modify: `test/zephyr-server.test.cjs` (add `testGetTestCyclesLinkedToIssueUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`)

**Interfaces:**
- Produces: `GetTestCyclesLinkedToIssueArgs { issue_key: string }`.
- Produces: `ZephyrToolHandlers.getTestCyclesLinkedToIssue(args: GetTestCyclesLinkedToIssueArgs)` — Cloud only. Note: unlike `get_test_cases_linked_to_issue`, this returns numeric IDs only (no key) — a genuine API asymmetry (`TestCycleId` schema has no `key` field), not a bug.

- [ ] **Step 1: Add the `GetTestCyclesLinkedToIssueArgs` type**

In `src/types.ts`, append after `CreateTestCycleIssueLinkArgs`:

```typescript
export interface GetTestCyclesLinkedToIssueArgs {
  issue_key: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `create_test_cycle_issue_link`:

```typescript
  {
    name: 'get_test_cycles_linked_to_issue',
    description: 'Get test cycle IDs linked to a given Jira issue. Returns numeric IDs only, not keys — pass the ID to get_test_run to fetch full details. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        issue_key: {
          type: 'string',
          description: 'Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issue_key'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testCreateTestCycleIssueLinkUnit()`:

```javascript
  async testGetTestCyclesLinkedToIssueUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestCyclesLinkedToIssue({ issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: bare array of IDs, self dropped ---
    const cloudConfig = { type: 'cloud', apiEndpoints: {} };
    const requests = [];
    const mockAxios = {
      get: async (url) => {
        requests.push(url);
        return { data: [{ id: 1, self: 'https://x/testcycles/1' }] };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    const result = await cloudHandlers.getTestCyclesLinkedToIssue({ issue_key: 'PROJ-123' });
    if (requests[0] !== '/issuelinks/PROJ-123/testcycles') throw new Error(`Expected GET /issuelinks/PROJ-123/testcycles, got ${requests[0]}`);
    const payload = JSON.parse(result.content[0].text);
    if (payload.testCycles.length !== 1) throw new Error(`Expected 1 test cycle, got ${payload.testCycles.length}`);
    if (payload.testCycles[0].id !== 1) throw new Error('Expected id 1');
    if ('self' in payload.testCycles[0]) throw new Error('self should be dropped from reverse-lookup response');
    if ('key' in payload.testCycles[0]) throw new Error('key should not appear — API does not return one for test cycles');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_test_cycles_linked_to_issue'")) throw new Error("'get_test_cycles_linked_to_issue' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_test_cycles_linked_to_issue':`)) throw new Error("build/index.js does not dispatch 'get_test_cycles_linked_to_issue'");
    if (!indexContent.includes('getTestCyclesLinkedToIssue(args')) throw new Error('build/index.js does not call toolHandlers.getTestCyclesLinkedToIssue(...)');
  }
```

Register it in `runAllTests()`, after `create_test_cycle_issue_link Unit Tests`:

```javascript
    await this.runTest('get_test_cycles_linked_to_issue Unit Tests', () => this.testGetTestCyclesLinkedToIssueUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_cycles_linked_to_issue Unit Tests - FAILED`. Tasks 1-8 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `createTestCycleIssueLink()`:

```typescript
  async getTestCyclesLinkedToIssue(args: GetTestCyclesLinkedToIssueArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_test_cycles_linked_to_issue is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose an /issuelinks endpoint.'
      );
    }

    const { issue_key } = args;

    try {
      const response = await this.axiosInstance.get(`/issuelinks/${issue_key}/testcycles`);
      const data: any[] = Array.isArray(response.data) ? response.data : [];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ testCycles: data.map((tc: any) => ({ id: tc.id })) }, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to get test cycles linked to issue: ${this.formatError(error)}`);
    }
  }
```

Add `GetTestCyclesLinkedToIssueArgs` to the import block, after `CreateTestCycleIssueLinkArgs,`:

```typescript
  CreateTestCycleIssueLinkArgs,
  GetTestCyclesLinkedToIssueArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `create_test_cycle_issue_link`:

```typescript
          case 'get_test_cycles_linked_to_issue':
            return await this.toolHandlers.getTestCyclesLinkedToIssue(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_cycles_linked_to_issue Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`:

```markdown
- `get_test_cycles_linked_to_issue`: Get test cycle IDs linked to a given Jira issue. Returns numeric IDs only, not keys. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`:

```markdown
- `get_test_cycles_linked_to_issue` — Cloud only; `GET /issuelinks/{issueKey}/testcycles`, returns `{ id }` only (no `key` — API asymmetry vs. test cases)
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_test_cycles_linked_to_issue tool (Cloud only)"
```

---

### Task 10: `get_test_execution_links`

**Files:**
- Modify: `src/types.ts` (append `GetTestExecutionLinksArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after `get_test_cycles_linked_to_issue`)
- Modify: `src/tool-handlers.ts` (add `getTestExecutionLinks()` method after `getTestCyclesLinkedToIssue()`)
- Modify: `src/index.ts` (insert dispatch case, right after `get_test_cycles_linked_to_issue`)
- Modify: `test/zephyr-server.test.cjs` (add `testGetTestExecutionLinksUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`)

**Interfaces:**
- Produces: `GetTestExecutionLinksArgs { execution_id: string }`.
- Produces: `ZephyrToolHandlers.getTestExecutionLinks(args: GetTestExecutionLinksArgs)` — Cloud only. Hardcodes `/testexecutions/` prefix (no `apiEndpoints` key for it), matching `getTestExecution()`.

- [ ] **Step 1: Add the `GetTestExecutionLinksArgs` type**

In `src/types.ts`, append after `GetTestCyclesLinkedToIssueArgs`:

```typescript
export interface GetTestExecutionLinksArgs {
  execution_id: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `get_test_cycles_linked_to_issue`:

```typescript
  {
    name: 'get_test_execution_links',
    description: 'Get Jira issue links associated with a test execution. Test executions do not support web links. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        execution_id: {
          type: 'string',
          description: 'Test execution ID or key (e.g., 5805255 or PROJ-E123)',
        },
      },
      required: ['execution_id'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testGetTestCyclesLinkedToIssueUnit()`:

```javascript
  async testGetTestExecutionLinksUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestExecutionLinks({ execution_id: '5805255' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: only issues, no webLinks key ---
    const cloudConfig = { type: 'cloud', apiEndpoints: {} };
    const requests = [];
    const mockAxios = {
      get: async (url) => {
        requests.push(url);
        return {
          data: {
            issues: [{ id: 1, issueId: 10100, type: 'COVERAGE', target: 'https://x/rest/api/2/issue/10100', self: 'https://x/links/1' }],
          },
        };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    const result = await cloudHandlers.getTestExecutionLinks({ execution_id: 'PROJ-E123' });
    if (requests[0] !== '/testexecutions/PROJ-E123/links') throw new Error(`Expected GET /testexecutions/PROJ-E123/links, got ${requests[0]}`);
    const payload = JSON.parse(result.content[0].text);
    if (payload.issues[0].issueId !== 10100) throw new Error('Expected issueId 10100');
    if ('webLinks' in payload) throw new Error('webLinks key should not appear — test executions do not support web links');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_test_execution_links'")) throw new Error("'get_test_execution_links' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_test_execution_links':`)) throw new Error("build/index.js does not dispatch 'get_test_execution_links'");
    if (!indexContent.includes('getTestExecutionLinks(args')) throw new Error('build/index.js does not call toolHandlers.getTestExecutionLinks(...)');
  }
```

Register it in `runAllTests()`, after `get_test_cycles_linked_to_issue Unit Tests`:

```javascript
    await this.runTest('get_test_execution_links Unit Tests', () => this.testGetTestExecutionLinksUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_execution_links Unit Tests - FAILED`. Tasks 1-9 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `getTestCyclesLinkedToIssue()`:

```typescript
  async getTestExecutionLinks(args: GetTestExecutionLinksArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_test_execution_links is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /links endpoint.'
      );
    }

    const { execution_id } = args;

    try {
      const response = await this.axiosInstance.get(`/testexecutions/${execution_id}/links`);
      const data = response.data;
      const issues: any[] = Array.isArray(data?.issues) ? data.issues : [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            issues: issues.map((i: any) => ({
              id: i.id, issueId: i.issueId, type: i.type, target: i.target, self: i.self,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to get test execution links: ${this.formatError(error)}`);
    }
  }
```

Add `GetTestExecutionLinksArgs` to the import block, after `GetTestCyclesLinkedToIssueArgs,`:

```typescript
  GetTestCyclesLinkedToIssueArgs,
  GetTestExecutionLinksArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `get_test_cycles_linked_to_issue`:

```typescript
          case 'get_test_execution_links':
            return await this.toolHandlers.getTestExecutionLinks(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_execution_links Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`:

```markdown
- `get_test_execution_links`: Get Jira issue links associated with a test execution. Test executions do not support web links. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`:

```markdown
- `get_test_execution_links` — Cloud only; `GET /testexecutions/{id}/links` (hardcoded prefix, no `apiEndpoints` key); response has `issues` only, no `webLinks`
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_test_execution_links tool (Cloud only)"
```

---

### Task 11: `create_test_execution_issue_link`

**Files:**
- Modify: `src/types.ts` (append `CreateTestExecutionIssueLinkArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after `get_test_execution_links`)
- Modify: `src/tool-handlers.ts` (add `createTestExecutionIssueLink()` method after `getTestExecutionLinks()`)
- Modify: `src/index.ts` (insert dispatch case, right after `get_test_execution_links`)
- Modify: `test/zephyr-server.test.cjs` (add `testCreateTestExecutionIssueLinkUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`)

**Interfaces:**
- Consumes: the existing private `resolveJiraIssueId()`, same as Tasks 4 and 8.
- Produces: `CreateTestExecutionIssueLinkArgs { execution_id: string; issue_key: string }`.
- Produces: `ZephyrToolHandlers.createTestExecutionIssueLink(args: CreateTestExecutionIssueLinkArgs)` — Cloud only. Hardcodes `/testexecutions/` prefix.

- [ ] **Step 1: Add the `CreateTestExecutionIssueLinkArgs` type**

In `src/types.ts`, append after `GetTestExecutionLinksArgs`:

```typescript
export interface CreateTestExecutionIssueLinkArgs {
  execution_id: string;
  issue_key: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `get_test_execution_links`:

```typescript
  {
    name: 'create_test_execution_issue_link',
    description: 'Create a Jira issue link that associates a test execution with a Jira issue — for example to link a failed execution to the bug it found. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        execution_id: {
          type: 'string',
          description: 'Test execution ID or key (e.g., 5805255 or PROJ-E123)',
        },
        issue_key: {
          type: 'string',
          description: 'Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['execution_id', 'issue_key'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testGetTestExecutionLinksUnit()`:

```javascript
  async testCreateTestExecutionIssueLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestExecutionIssueLink({ execution_id: '5805255', issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: issue key resolved, then POSTed to hardcoded /testexecutions/ prefix ---
    const cloudConfig = { type: 'cloud', apiEndpoints: {} };
    const posted = [];
    const mockAxios = {
      post: async (url, body) => {
        posted.push({ url, body });
        return { data: { id: 13, self: 'https://x/links/13' } };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    cloudHandlers.resolveJiraIssueId = async (issueKey) => {
      if (issueKey !== 'QA-1') throw new Error(`Unexpected issue key ${issueKey}`);
      return 10100;
    };

    const result = await cloudHandlers.createTestExecutionIssueLink({ execution_id: 'PROJ-E123', issue_key: 'QA-1' });
    if (posted[0].url !== '/testexecutions/PROJ-E123/links/issues') throw new Error(`Expected POST to issues endpoint, got ${posted[0].url}`);
    if (posted[0].body.issueId !== 10100) throw new Error(`Expected issueId=10100, got ${posted[0].body.issueId}`);
    if (!result.content[0].text.includes('PROJ-E123')) throw new Error('Expected execution id in success message');
    if (!result.content[0].text.includes('QA-1')) throw new Error('Expected issue key in success message');

    // --- Resolution failure propagates ---
    const failHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    failHandlers.resolveJiraIssueId = async () => { throw new Error('Could not resolve numeric ID for Jira issue "QA-404"'); };
    try {
      await failHandlers.createTestExecutionIssueLink({ execution_id: 'PROJ-E123', issue_key: 'QA-404' });
      throw new Error('Expected McpError when issue resolution fails');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError, got: ${e.message}`);
    }

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'create_test_execution_issue_link'")) throw new Error("'create_test_execution_issue_link' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'create_test_execution_issue_link':`)) throw new Error("build/index.js does not dispatch 'create_test_execution_issue_link'");
    if (!indexContent.includes('createTestExecutionIssueLink(args')) throw new Error('build/index.js does not call toolHandlers.createTestExecutionIssueLink(...)');
  }
```

Register it in `runAllTests()`, after `get_test_execution_links Unit Tests`:

```javascript
    await this.runTest('create_test_execution_issue_link Unit Tests', () => this.testCreateTestExecutionIssueLinkUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_execution_issue_link Unit Tests - FAILED`. Tasks 1-10 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `getTestExecutionLinks()`:

```typescript
  async createTestExecutionIssueLink(args: CreateTestExecutionIssueLinkArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'create_test_execution_issue_link is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /links/issues endpoint.'
      );
    }

    const { execution_id, issue_key } = args;

    try {
      const issueId = await this.resolveJiraIssueId(issue_key);
      const response = await this.axiosInstance.post(`/testexecutions/${execution_id}/links/issues`, { issueId });
      return {
        content: [{
          type: 'text',
          text: `✅ Issue link created on execution ${execution_id} → ${issue_key}: ${JSON.stringify({ id: response.data.id, self: response.data.self }, null, 2)}`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to create test execution issue link: ${this.formatError(error)}`);
    }
  }
```

Add `CreateTestExecutionIssueLinkArgs` to the import block, after `GetTestExecutionLinksArgs,`:

```typescript
  GetTestExecutionLinksArgs,
  CreateTestExecutionIssueLinkArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `get_test_execution_links`:

```typescript
          case 'create_test_execution_issue_link':
            return await this.toolHandlers.createTestExecutionIssueLink(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `create_test_execution_issue_link Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`:

```markdown
- `create_test_execution_issue_link`: Create a Jira issue link that associates a test execution with a Jira issue. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`:

```markdown
- `create_test_execution_issue_link` — Cloud only; resolves `issue_key` → numeric `issueId`, then `POST /testexecutions/{id}/links/issues` (hardcoded prefix)
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add create_test_execution_issue_link tool (Cloud only)"
```

---

### Task 12: `get_test_executions_linked_to_issue`

**Files:**
- Modify: `src/types.ts` (append `GetTestExecutionsLinkedToIssueArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry, after `create_test_execution_issue_link`)
- Modify: `src/tool-handlers.ts` (add `getTestExecutionsLinkedToIssue()` method after `createTestExecutionIssueLink()`)
- Modify: `src/index.ts` (insert dispatch case, right after `create_test_execution_issue_link`)
- Modify: `test/zephyr-server.test.cjs` (add `testGetTestExecutionsLinkedToIssueUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Jira Links`, completing the section)
- Modify: `CLAUDE.md` (append bullet to `### Jira Links`, completing the section)

**Interfaces:**
- Produces: `GetTestExecutionsLinkedToIssueArgs { issue_key: string }`.
- Produces: `ZephyrToolHandlers.getTestExecutionsLinkedToIssue(args: GetTestExecutionsLinkedToIssueArgs)` — Cloud only. Path segment is `/issuelinks/{issueKey}/executions` (**not** `/testexecutions` — verified against the spec, this is the API's own naming, not a typo). Same ID-only asymmetry as Task 9.

- [ ] **Step 1: Add the `GetTestExecutionsLinkedToIssueArgs` type**

In `src/types.ts`, append after `CreateTestExecutionIssueLinkArgs`:

```typescript
export interface GetTestExecutionsLinkedToIssueArgs {
  issue_key: string;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after `create_test_execution_issue_link`:

```typescript
  {
    name: 'get_test_executions_linked_to_issue',
    description: 'Get test execution IDs linked to a given Jira issue. Returns numeric IDs only, not keys. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        issue_key: {
          type: 'string',
          description: 'Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issue_key'],
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testCreateTestExecutionIssueLinkUnit()`:

```javascript
  async testGetTestExecutionsLinkedToIssueUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestExecutionsLinkedToIssue({ issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: path uses /executions, not /testexecutions ---
    const cloudConfig = { type: 'cloud', apiEndpoints: {} };
    const requests = [];
    const mockAxios = {
      get: async (url) => {
        requests.push(url);
        return { data: [{ id: 1, self: 'https://x/testexecutions/1' }] };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);
    const result = await cloudHandlers.getTestExecutionsLinkedToIssue({ issue_key: 'PROJ-123' });
    if (requests[0] !== '/issuelinks/PROJ-123/executions') throw new Error(`Expected GET /issuelinks/PROJ-123/executions, got ${requests[0]}`);
    const payload = JSON.parse(result.content[0].text);
    if (payload.testExecutions.length !== 1) throw new Error(`Expected 1 test execution, got ${payload.testExecutions.length}`);
    if (payload.testExecutions[0].id !== 1) throw new Error('Expected id 1');
    if ('self' in payload.testExecutions[0]) throw new Error('self should be dropped from reverse-lookup response');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_test_executions_linked_to_issue'")) throw new Error("'get_test_executions_linked_to_issue' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_test_executions_linked_to_issue':`)) throw new Error("build/index.js does not dispatch 'get_test_executions_linked_to_issue'");
    if (!indexContent.includes('getTestExecutionsLinkedToIssue(args')) throw new Error('build/index.js does not call toolHandlers.getTestExecutionsLinkedToIssue(...)');
  }
```

Register it in `runAllTests()`, after `create_test_execution_issue_link Unit Tests`:

```javascript
    await this.runTest('get_test_executions_linked_to_issue Unit Tests', () => this.testGetTestExecutionsLinkedToIssueUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_test_executions_linked_to_issue Unit Tests - FAILED`. Tasks 1-11 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `createTestExecutionIssueLink()`:

```typescript
  async getTestExecutionsLinkedToIssue(args: GetTestExecutionsLinkedToIssueArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_test_executions_linked_to_issue is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose an /issuelinks endpoint.'
      );
    }

    const { issue_key } = args;

    try {
      const response = await this.axiosInstance.get(`/issuelinks/${issue_key}/executions`);
      const data: any[] = Array.isArray(response.data) ? response.data : [];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ testExecutions: data.map((te: any) => ({ id: te.id })) }, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to get test executions linked to issue: ${this.formatError(error)}`);
    }
  }
```

Add `GetTestExecutionsLinkedToIssueArgs` to the import block, after `CreateTestExecutionIssueLinkArgs,`:

```typescript
  CreateTestExecutionIssueLinkArgs,
  GetTestExecutionsLinkedToIssueArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before `case 'list_executions_by_cycle':`, right after `create_test_execution_issue_link`:

```typescript
          case 'get_test_executions_linked_to_issue':
            return await this.toolHandlers.getTestExecutionsLinkedToIssue(args as any);
```

- [ ] **Step 7: Rebuild and run the full test suite, confirm everything passes**

Run:
```bash
npm run build && npm run test:unit
```
Expected: all tests pass, including all 12 new tool unit tests from Tasks 1-12, alongside every pre-existing test.

- [ ] **Step 8: Update README.md**

Append to `### Jira Links`, completing the section:

```markdown
- `get_test_executions_linked_to_issue`: Get test execution IDs linked to a given Jira issue. Returns numeric IDs only, not keys. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

Append to `### Jira Links`, completing the section:

```markdown
- `get_test_executions_linked_to_issue` — Cloud only; `GET /issuelinks/{issueKey}/executions` (note: `executions`, not `testexecutions` — verified API path), returns `{ id }` only
```

- [ ] **Step 10: Final verification and commit**

Confirm both docs now list all 11 Jira Links tools plus the 1 Test Scripts tool:
```bash
grep -A2 "### Test Scripts" README.md
grep -A12 "### Jira Links" README.md
grep -A2 "### Test Scripts" CLAUDE.md
grep -A12 "### Jira Links" CLAUDE.md
```
Expected: `### Test Scripts` shows 1 bullet (`get_test_script`) in each file; `### Jira Links` shows 11 bullets in each file.

Confirm the full tool count in the schema file (`build/tool-schemas.js` is an ES module — `require()` would throw "require() of ES Module not supported", so count via a plain text grep instead, same as the schema-wiring assertions in each task's unit test):
```bash
grep -c "^    name: '" src/tool-schemas.ts
```
Expected: `35` (23 tools present before this plan + 12 new tools).

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_test_executions_linked_to_issue tool (Cloud only)"
```
