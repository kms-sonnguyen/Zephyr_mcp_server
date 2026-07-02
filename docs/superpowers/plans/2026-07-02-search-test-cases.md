# search_test_cases Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `search_test_cases` MCP tool that finds test cases by a case-insensitive name substring within a project, optionally scoped to a folder, on both Zephyr Scale Cloud and Data Center.

**Architecture:** Neither platform's API supports server-side name filtering with a confirmed operator (Cloud has no filter at all beyond `projectKey`/`folderId`; Data Center's TQL only documents `=, >, >=, <, <=, IN`, no `~`/contains). So both platforms fetch a bounded set of test cases (paginated on Cloud, single scoped query on Data Center) and filter by name client-side in the new `searchTestCases()` handler method, following the existing `searchTestCasesByFolder` code shape in `src/tool-handlers.ts`.

**Tech Stack:** TypeScript (ES2022/Node16 modules), `@modelcontextprotocol/sdk`, axios. Tests are plain Node `.cjs` files run against compiled `build/` output (no test framework).

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-02-search-test-cases-design.md` — every task here implements a piece of it; consult it for the "why" behind any decision below.
- `project_key` and `name_contains` are required; `folder_path` and `max_results` (default `100`) are optional.
- `name_contains` matching is case-insensitive substring: `tc.name.toLowerCase().includes(name_contains.trim().toLowerCase())`.
- Both platforms share one scan cap constant, `5000`, capping how many test cases are fetched/scanned before filtering (not how many matches are returned). When the cap is hit before exhausting the source, the response includes `"truncated": true`.
- `max_results` caps **matches after filtering**, never the raw fetch — the fetch loop must not stop early at `max_results` (see design's "Pagination divergence" note). This is a deliberate difference from `searchTestCasesByFolder`.
- `folder_path`, when given, scopes to the *exact* folder only — no subfolder recursion, consistent with the rest of this codebase.
- Every handler catches axios errors and rethrows via `McpError(ErrorCode.InternalError, `Failed to search test cases: ${this.formatError(error)}`)`, matching every other method in `tool-handlers.ts`.
- After every `src/` edit, run `npm run build` before running unit tests — `test/zephyr-server.test.cjs` imports from `build/`, not `src/`.
- Run unit tests with `npm run test:unit` (no environment variables required for these tests — they use mocked axios instances).

---

### Task 1: Add type definition and register the tool schema

**Files:**
- Modify: `src/types.ts` (add `SearchTestCasesByNameArgs` after the existing `SearchTestCasesArgs` interface, currently at lines 74-78)
- Modify: `src/tool-schemas.ts` (insert new schema entry after `search_test_cases_by_folder`, currently ending at line 377, before `search_test_runs` at line 378)
- Test: `test/zephyr-server.test.cjs` (extend `testSchemaContainsNewTools`'s `tools` array)

**Interfaces:**
- Produces: `SearchTestCasesByNameArgs` type — `{ project_key: string; name_contains: string; folder_path?: string; max_results?: number }` — consumed by Task 2's `searchTestCases()` method signature.
- Produces: a `search_test_cases` entry in the exported `toolSchemas` array from `src/tool-schemas.ts`, consumed by Task 4's `index.ts` dispatch.

- [ ] **Step 1: Write the failing test**

Open `test/zephyr-server.test.cjs` and find:

```javascript
  async testSchemaContainsNewTools() {
    const fs = require('fs');
    const content = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    const tools = ['get_test_case_steps', 'update_test_case_steps'];
```

Change the `tools` array to:

```javascript
    const tools = ['get_test_case_steps', 'update_test_case_steps', 'search_test_cases'];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npm run test:unit`
Expected: `❌ Schema Contains New Tools - FAILED: 'search_test_cases' not found in built tool-schemas.js`

- [ ] **Step 3: Add the type to `src/types.ts`**

Find the existing `SearchTestCasesArgs` interface:

```typescript
export interface SearchTestCasesArgs {
  project_key: string;
  folder_path: string;
  max_results?: number;
}
```

Add immediately after it:

```typescript
export interface SearchTestCasesByNameArgs {
  project_key: string;
  name_contains: string;
  folder_path?: string;
  max_results?: number;
}
```

- [ ] **Step 4: Add the schema entry to `src/tool-schemas.ts`**

Find the end of the `search_test_cases_by_folder` entry:

```typescript
  {
    name: 'search_test_cases_by_folder',
    description: 'Search for test cases in a specific folder',
    inputSchema: {
      type: 'object',
      properties: {
        project_key: {
          type: 'string',
          description: 'Project key (e.g., PROJ)',
        },
        folder_path: {
          type: 'string',
          description: 'Folder path to search in (e.g., /ProjectName/SubFolder)',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (optional, default 100)',
          default: 100,
        },
      },
      required: ['project_key', 'folder_path'],
    },
  },
```

Insert immediately after it (before the `search_test_runs` entry):

```typescript
  {
    name: 'search_test_cases',
    description: 'Search for test cases by name (case-insensitive substring match) within a project, optionally scoped to an exact folder. Neither Cloud nor Data Center support server-side name search, so this paginates/queries then filters client-side, capped at 5000 scanned test cases per call — check "truncated" in the response if you need exhaustive results on a very large project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_key: {
          type: 'string',
          description: 'Project key (e.g., PROJ)',
        },
        name_contains: {
          type: 'string',
          description: 'Case-insensitive substring to match against test case names (e.g., "login")',
          minLength: 1,
        },
        folder_path: {
          type: 'string',
          description: 'Optional exact folder path to scope the search to (e.g., /ProjectName/SubFolder). Does not include subfolders.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of matching test cases to return (optional, default 100)',
          default: 100,
        },
      },
      required: ['project_key', 'name_contains'],
    },
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && npm run test:unit`
Expected: `✅ Schema Contains New Tools - PASSED`

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/tool-schemas.ts test/zephyr-server.test.cjs
git commit -m "feat: add search_test_cases type and tool schema"
```

---

### Task 2: Implement the Cloud path of `searchTestCases()`

**Files:**
- Modify: `src/tool-handlers.ts` (add `searchTestCases()` method to `ZephyrToolHandlers`, placed after `searchTestCasesByFolder` — currently ends at line 1164)
- Test: `test/zephyr-server.test.cjs` (add `testSearchTestCasesCloudUnit` method + register it in `runAllTests`)

**Interfaces:**
- Consumes: `SearchTestCasesByNameArgs` (Task 1), `resolveFolderIdByPath(axiosInstance, projectKey, folderPath, folderType): Promise<number | null>` (existing, `src/utils.ts:3`), `this.formatError(error)` (existing private method on `ZephyrToolHandlers`).
- Produces: `ZephyrToolHandlers.prototype.searchTestCases(args: SearchTestCasesByNameArgs): Promise<{ content: [{ type: 'text'; text: string }] }>` — the Cloud branch is complete after this task; the Data Center branch is a placeholder that throws, replaced in Task 3. Consumed by Task 4's `index.ts` dispatch.

- [ ] **Step 1: Write the failing tests**

Open `test/zephyr-server.test.cjs`. Find the end of `testUpdateTestCaseStepsUnit` (ends with the closing brace before the `/** Run all tests */` comment, currently around line 489). Add a new method immediately after it:

```javascript
  async testSearchTestCasesCloudUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    const cloudConfig = {
      type: 'cloud',
      apiEndpoints: {
        testcase: '/testcases',
        folder: '/folders',
        search: '/testcases/search',
      },
    };

    // --- name_contains validation ---
    const noopAxios = { get: async () => { throw new Error('should not be called'); } };
    const validationHandlers = new ZephyrToolHandlers(noopAxios, cloudConfig);
    try {
      await validationHandlers.searchTestCases({ project_key: 'PROJ', name_contains: '   ' });
      throw new Error('Expected McpError for blank name_contains');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for blank name_contains, got: ${e.message}`);
    }

    // --- Basic search: case-insensitive substring, no folder ---
    const requests = [];
    const basicAxios = {
      get: async (url, config) => {
        requests.push({ url, params: config && config.params });
        return {
          data: {
            values: [
              { key: 'PROJ-T1', name: 'User Login Flow' },
              { key: 'PROJ-T2', name: 'Password Reset' },
              { key: 'PROJ-T3', name: 'Admin LOGIN Page' },
            ],
          },
        };
      },
    };
    const basicHandlers = new ZephyrToolHandlers(basicAxios, cloudConfig);
    const basicResult = await basicHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'login' });
    const basicPayload = JSON.parse(basicResult.content[0].text.split('\n').slice(1).join('\n'));
    if (JSON.stringify(basicPayload.testCaseKeys) !== JSON.stringify(['PROJ-T1', 'PROJ-T3'])) {
      throw new Error(`Expected matches PROJ-T1,PROJ-T3, got ${JSON.stringify(basicPayload.testCaseKeys)}`);
    }
    if (basicPayload.totalCount !== 2) throw new Error(`Expected totalCount=2, got ${basicPayload.totalCount}`);
    if (basicPayload.totalScanned !== 3) throw new Error(`Expected totalScanned=3, got ${basicPayload.totalScanned}`);
    if (basicPayload.truncated !== false) throw new Error(`Expected truncated=false, got ${basicPayload.truncated}`);
    if (basicPayload.folder !== null) throw new Error(`Expected folder=null, got ${basicPayload.folder}`);
    if (requests[0].url !== '/testcases') throw new Error(`Expected GET /testcases, got ${requests[0].url}`);
    if (requests[0].params.projectKey !== 'PROJ') throw new Error(`Expected projectKey=PROJ, got ${requests[0].params.projectKey}`);
    if ('folderId' in requests[0].params) throw new Error('Expected no folderId param when folder_path omitted');

    // --- max_results limits matches, not raw fetch ---
    const limitedResult = await basicHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'login', max_results: 1 });
    const limitedPayload = JSON.parse(limitedResult.content[0].text.split('\n').slice(1).join('\n'));
    if (limitedPayload.totalCount !== 1) throw new Error(`Expected totalCount=1 with max_results=1, got ${limitedPayload.totalCount}`);
    if (limitedPayload.totalScanned !== 3) throw new Error(`Expected totalScanned still 3 with max_results=1, got ${limitedPayload.totalScanned}`);

    // --- Folder scoping resolves folderId and passes it through ---
    const folderRequests = [];
    const folderAxios = {
      get: async (url, config) => {
        folderRequests.push({ url, params: config && config.params });
        if (url === '/folders') {
          return { data: { values: [{ id: 42, parentId: null, name: 'Auth' }] } };
        }
        return { data: { values: [{ key: 'PROJ-T9', name: 'Login inside Auth folder' }] } };
      },
    };
    const folderHandlers = new ZephyrToolHandlers(folderAxios, cloudConfig);
    const folderResult = await folderHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'login', folder_path: '/Auth' });
    const folderPayload = JSON.parse(folderResult.content[0].text.split('\n').slice(1).join('\n'));
    if (folderPayload.folder !== '/Auth') throw new Error(`Expected folder=/Auth, got ${folderPayload.folder}`);
    if (folderPayload.testCaseKeys[0] !== 'PROJ-T9') throw new Error('Expected PROJ-T9 in folder-scoped results');
    const testcaseCall = folderRequests.find(r => r.url === '/testcases');
    if (!testcaseCall || testcaseCall.params.folderId !== 42) {
      throw new Error(`Expected /testcases call with folderId=42, got ${JSON.stringify(testcaseCall)}`);
    }

    // --- Folder not found: soft warning, no /testcases call made ---
    const notFoundRequests = [];
    const notFoundAxios = {
      get: async (url, config) => {
        notFoundRequests.push({ url, params: config && config.params });
        return { data: { values: [] } };
      },
    };
    const notFoundHandlers = new ZephyrToolHandlers(notFoundAxios, cloudConfig);
    const notFoundResult = await notFoundHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'login', folder_path: '/Missing' });
    if (!notFoundResult.content[0].text.includes('Folder not found')) {
      throw new Error(`Expected folder-not-found warning, got: ${notFoundResult.content[0].text}`);
    }
    if (notFoundRequests.some(r => r.url === '/testcases')) {
      throw new Error('Expected no /testcases call when folder not found');
    }

    // --- Scan cap: stops at 5000 scanned, marks truncated ---
    const capRequests = [];
    const capAxios = {
      get: async (url, config) => {
        capRequests.push({ url, params: config && config.params });
        const startAt = config.params.startAt;
        const page = [];
        for (let i = 0; i < 1000; i++) {
          page.push({ key: `PROJ-T${startAt + i}`, name: `Never Matches ${startAt + i}` });
        }
        return { data: { values: page, isLast: false } };
      },
    };
    const capHandlers = new ZephyrToolHandlers(capAxios, cloudConfig);
    const capResult = await capHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'nonexistent-needle' });
    const capPayload = JSON.parse(capResult.content[0].text.split('\n').slice(1).join('\n'));
    if (capPayload.truncated !== true) throw new Error(`Expected truncated=true at scan cap, got ${capPayload.truncated}`);
    if (capPayload.totalScanned !== 5000) throw new Error(`Expected totalScanned=5000 at cap, got ${capPayload.totalScanned}`);
    if (capRequests.length !== 5) throw new Error(`Expected exactly 5 page requests (5000/1000), got ${capRequests.length}`);
  }
```

Now find the `runAllTests` method and add a new line after the `update_test_case_steps Unit Tests` line:

```javascript
    await this.runTest('update_test_case_steps Unit Tests', () => this.testUpdateTestCaseStepsUnit());
    await this.runTest('search_test_cases Cloud Unit Tests', () => this.testSearchTestCasesCloudUnit());
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npm run test:unit`
Expected: `❌ search_test_cases Cloud Unit Tests - FAILED: validationHandlers.searchTestCases is not a function`

- [ ] **Step 3: Implement the Cloud path in `src/tool-handlers.ts`**

Find the end of `searchTestCasesByFolder` (the closing brace of the method, currently at line 1164, right before `async searchTestRuns(args: SearchTestRunsArgs) {`). Insert the new method immediately after it:

```typescript
  async searchTestCases(args: SearchTestCasesByNameArgs) {
    const { project_key, name_contains, folder_path, max_results = 100 } = args;

    if (typeof name_contains !== 'string' || name_contains.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'name_contains must be a non-empty string');
    }
    const needle = name_contains.trim().toLowerCase();

    if (this.jiraConfig.type !== 'cloud') {
      throw new McpError(ErrorCode.InvalidRequest, 'Data Center support for search_test_cases is not yet implemented');
    }

    try {
      let folderId: number | null = null;
      if (folder_path) {
        folderId = await resolveFolderIdByPath(
          this.axiosInstance, project_key, folder_path, 'TEST_CASE'
        );
        if (folderId === null) {
          return {
            content: [{
              type: 'text',
              text: `⚠️ Folder not found: "${folder_path}" in project ${project_key}. No test cases returned.`,
            }],
          };
        }
      }

      const SCAN_CAP = 5000;
      const pageSize = 1000;
      const allTestCases: any[] = [];
      let startAt = 0;
      let isLast = false;
      let truncated = false;

      while (!isLast) {
        const response = await this.axiosInstance.get(this.jiraConfig.apiEndpoints.testcase, {
          params: {
            projectKey: project_key,
            ...(folderId !== null ? { folderId } : {}),
            maxResults: pageSize,
            startAt,
          },
        });

        const page = Array.isArray(response.data)
          ? response.data
          : response.data?.values ?? [];

        allTestCases.push(...page);

        isLast = response.data?.isLast === true || page.length < pageSize;
        startAt += page.length;

        if (!isLast && allTestCases.length >= SCAN_CAP) {
          truncated = true;
          break;
        }
      }

      const matches = allTestCases.filter(
        (tc: any) => typeof tc.name === 'string' && tc.name.toLowerCase().includes(needle)
      );
      const limited = matches.slice(0, max_results);

      return {
        content: [{
          type: 'text',
          text: `✅ Found ${limited.length} test case(s) matching "${name_contains}" in project ${project_key}:\n${JSON.stringify({
            project_key,
            name_contains,
            folder: folder_path ?? null,
            testCaseKeys: limited.map((tc: any) => tc.key),
            totalCount: limited.length,
            totalScanned: allTestCases.length,
            truncated,
          }, null, 2)}`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to search test cases: ${this.formatError(error)}`);
    }
  }

```

Add `SearchTestCasesByNameArgs` to the type imports at the top of `src/tool-handlers.ts`. Find:

```typescript
import {
  TestCaseArgs,
  UpdateBddArgs,
  FolderArgs,
  TestRunArgs,
  SearchTestCasesArgs,
  AddTestCasesToRunArgs,
  SearchTestRunsArgs,
  GetTestExecutionArgs,
  ListExecutionsByCycleArgs,
  GetTestCaseStepsArgs,
  UpdateTestCaseStepsArgs,
  JiraConfig
} from './types.js';
```

Replace with:

```typescript
import {
  TestCaseArgs,
  UpdateBddArgs,
  FolderArgs,
  TestRunArgs,
  SearchTestCasesArgs,
  SearchTestCasesByNameArgs,
  AddTestCasesToRunArgs,
  SearchTestRunsArgs,
  GetTestExecutionArgs,
  ListExecutionsByCycleArgs,
  GetTestCaseStepsArgs,
  UpdateTestCaseStepsArgs,
  JiraConfig
} from './types.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npm run test:unit`
Expected: `✅ search_test_cases Cloud Unit Tests - PASSED`

- [ ] **Step 5: Commit**

```bash
git add src/tool-handlers.ts test/zephyr-server.test.cjs
git commit -m "feat: implement Cloud path of search_test_cases"
```

---

### Task 3: Implement the Data Center path of `searchTestCases()`

**Files:**
- Modify: `src/tool-handlers.ts` (replace the Data Center placeholder inside `searchTestCases()` from Task 2 with a real implementation)
- Test: `test/zephyr-server.test.cjs` (add `testSearchTestCasesDataCenterUnit` method + register it in `runAllTests`)

**Interfaces:**
- Consumes: same `searchTestCases()` method from Task 2 — this task only replaces its Data Center branch.
- Produces: full dual-platform `searchTestCases()`, ready for Task 4's dispatch wiring.

- [ ] **Step 1: Write the failing tests**

Add a new method in `test/zephyr-server.test.cjs`, immediately after `testSearchTestCasesCloudUnit`:

```javascript
  async testSearchTestCasesDataCenterUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');

    const dcConfig = {
      type: 'datacenter',
      apiEndpoints: {
        testcase: '/rest/atm/1.0/testcase',
        folder: '/rest/atm/1.0/folder',
        search: '/rest/atm/1.0/testcase/search',
      },
    };

    // --- Query building: projectKey only ---
    const requests = [];
    const basicAxios = {
      get: async (url, config) => {
        requests.push({ url, params: config && config.params });
        return {
          data: {
            results: [
              { key: 'PROJ-T1', name: 'User Login Flow' },
              { key: 'PROJ-T2', name: 'Password Reset' },
              { key: 'PROJ-T3', name: 'Admin LOGIN Page' },
            ],
          },
        };
      },
    };
    const basicHandlers = new ZephyrToolHandlers(basicAxios, dcConfig);
    const basicResult = await basicHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'login' });
    const basicPayload = JSON.parse(basicResult.content[0].text.split('\n').slice(1).join('\n'));
    if (JSON.stringify(basicPayload.testCaseKeys) !== JSON.stringify(['PROJ-T1', 'PROJ-T3'])) {
      throw new Error(`Expected matches PROJ-T1,PROJ-T3, got ${JSON.stringify(basicPayload.testCaseKeys)}`);
    }
    if (basicPayload.totalScanned !== 3) throw new Error(`Expected totalScanned=3, got ${basicPayload.totalScanned}`);
    if (requests[0].url !== '/rest/atm/1.0/testcase/search') throw new Error(`Expected DC search endpoint, got ${requests[0].url}`);
    if (requests[0].params.query !== 'projectKey = "PROJ"') {
      throw new Error(`Expected query 'projectKey = "PROJ"' with no name/folder clause, got: ${requests[0].params.query}`);
    }

    // --- Query building: projectKey + folder, with quote escaping ---
    const folderRequests = [];
    const folderAxios = {
      get: async (url, config) => {
        folderRequests.push({ url, params: config && config.params });
        return { data: { results: [] } };
      },
    };
    const folderHandlers = new ZephyrToolHandlers(folderAxios, dcConfig);
    await folderHandlers.searchTestCases({ project_key: 'PROJ"X', name_contains: 'login', folder_path: '/Auth"Sub' });
    const expectedQuery = 'projectKey = "PROJ\\"X" AND folder = "/Auth\\"Sub"';
    if (folderRequests[0].params.query !== expectedQuery) {
      throw new Error(`Expected escaped query '${expectedQuery}', got: ${folderRequests[0].params.query}`);
    }

    // --- Response shape: plain array ---
    const arrayAxios = {
      get: async () => ({ data: [{ key: 'PROJ-T5', name: 'Login via array shape' }] }),
    };
    const arrayHandlers = new ZephyrToolHandlers(arrayAxios, dcConfig);
    const arrayResult = await arrayHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'login' });
    const arrayPayload = JSON.parse(arrayResult.content[0].text.split('\n').slice(1).join('\n'));
    if (arrayPayload.testCaseKeys[0] !== 'PROJ-T5') throw new Error('Expected PROJ-T5 from plain-array response shape');

    // --- Truncated when result count hits the scan cap ---
    const cappedResults = [];
    for (let i = 0; i < 5000; i++) {
      cappedResults.push({ key: `PROJ-T${i}`, name: `Item ${i}` });
    }
    const cappedAxios = { get: async () => ({ data: { results: cappedResults } }) };
    const cappedHandlers = new ZephyrToolHandlers(cappedAxios, dcConfig);
    const cappedResult = await cappedHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'item' });
    const cappedPayload = JSON.parse(cappedResult.content[0].text.split('\n').slice(1).join('\n'));
    if (cappedPayload.truncated !== true) throw new Error(`Expected truncated=true at 5000 results, got ${cappedPayload.truncated}`);

    // --- Not truncated below the cap ---
    const smallAxios = { get: async () => ({ data: { results: [{ key: 'PROJ-T1', name: 'Item 1' }] } }) };
    const smallHandlers = new ZephyrToolHandlers(smallAxios, dcConfig);
    const smallResult = await smallHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'item' });
    const smallPayload = JSON.parse(smallResult.content[0].text.split('\n').slice(1).join('\n'));
    if (smallPayload.truncated !== false) throw new Error(`Expected truncated=false below cap, got ${smallPayload.truncated}`);

    // --- max_results limits matches ---
    const limitedResult = await basicHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'login', max_results: 1 });
    const limitedPayload = JSON.parse(limitedResult.content[0].text.split('\n').slice(1).join('\n'));
    if (limitedPayload.totalCount !== 1) throw new Error(`Expected totalCount=1 with max_results=1, got ${limitedPayload.totalCount}`);
  }
```

Register it in `runAllTests`, immediately after the Cloud test registration added in Task 2:

```javascript
    await this.runTest('search_test_cases Cloud Unit Tests', () => this.testSearchTestCasesCloudUnit());
    await this.runTest('search_test_cases Data Center Unit Tests', () => this.testSearchTestCasesDataCenterUnit());
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npm run test:unit`
Expected: `❌ search_test_cases Data Center Unit Tests - FAILED: Failed to search test cases: Data Center support for search_test_cases is not yet implemented` (the McpError thrown by Task 2's placeholder gets wrapped as a generic `Error` by the test's `catch`, or surfaces directly — either way, the test fails because no DC results come back).

- [ ] **Step 3: Replace the Data Center placeholder in `src/tool-handlers.ts`**

Find this block inside `searchTestCases()` (added in Task 2):

```typescript
    if (this.jiraConfig.type !== 'cloud') {
      throw new McpError(ErrorCode.InvalidRequest, 'Data Center support for search_test_cases is not yet implemented');
    }
```

Replace it with:

```typescript
    if (this.jiraConfig.type !== 'cloud') {
      try {
        const SCAN_CAP = 5000;
        const escapedProjectKey = project_key.replace(/"/g, '\\"');
        const queryParts: string[] = [`projectKey = "${escapedProjectKey}"`];
        if (folder_path) {
          const escapedFolderPath = folder_path.replace(/"/g, '\\"');
          queryParts.push(`folder = "${escapedFolderPath}"`);
        }
        const query = queryParts.join(' AND ');

        const response = await this.axiosInstance.get(this.jiraConfig.apiEndpoints.search, {
          params: { query, maxResults: SCAN_CAP },
        });

        let testCases: any[] = [];
        if (Array.isArray(response.data)) {
          testCases = response.data;
        } else if (response.data?.values && Array.isArray(response.data.values)) {
          testCases = response.data.values;
        } else if (response.data?.results && Array.isArray(response.data.results)) {
          testCases = response.data.results;
        }

        const truncated = testCases.length >= SCAN_CAP;
        const matches = testCases.filter(
          (tc: any) => typeof tc.name === 'string' && tc.name.toLowerCase().includes(needle)
        );
        const limited = matches.slice(0, max_results);

        return {
          content: [{
            type: 'text',
            text: `✅ Found ${limited.length} test case(s) matching "${name_contains}" in project ${project_key}:\n${JSON.stringify({
              project_key,
              name_contains,
              folder: folder_path ?? null,
              testCaseKeys: limited.map((tc: any) => tc.key),
              totalCount: limited.length,
              totalScanned: testCases.length,
              truncated,
            }, null, 2)}`,
          }],
        };
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, `Failed to search test cases: ${this.formatError(error)}`);
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npm run test:unit`
Expected: `✅ search_test_cases Data Center Unit Tests - PASSED`

- [ ] **Step 5: Commit**

```bash
git add src/tool-handlers.ts test/zephyr-server.test.cjs
git commit -m "feat: implement Data Center path of search_test_cases"
```

---

### Task 4: Wire up dispatch in `index.ts`

**Files:**
- Modify: `src/index.ts` (add `case 'search_test_cases'` to the tool-dispatch switch, currently at lines 90-93 alongside `search_test_cases_by_folder`)
- Test: `test/zephyr-server.test.cjs` (new `testIndexDispatchesSearchTestCases` method + register it)

**Interfaces:**
- Consumes: `toolSchemas` (Task 1), `ZephyrToolHandlers.prototype.searchTestCases` (Tasks 2-3).
- Produces: end-to-end tool availability — `search_test_cases` is now listed by `tools/list` and dispatchable via `tools/call`, same as every other tool in this file.

- [ ] **Step 1: Write the failing test**

Add a new method in `test/zephyr-server.test.cjs`, immediately after `testSearchTestCasesDataCenterUnit`:

```javascript
  async testIndexDispatchesSearchTestCases() {
    const fs = require('fs');
    const content = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!content.includes(`case 'search_test_cases':`)) {
      throw new Error("build/index.js does not dispatch 'search_test_cases'");
    }
    if (!content.includes('searchTestCases(args')) {
      throw new Error('build/index.js does not call toolHandlers.searchTestCases(...)');
    }
  }
```

Register it in `runAllTests`, immediately after the Data Center test registration added in Task 3:

```javascript
    await this.runTest('search_test_cases Data Center Unit Tests', () => this.testSearchTestCasesDataCenterUnit());
    await this.runTest('search_test_cases Index Dispatch', () => this.testIndexDispatchesSearchTestCases());
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npm run test:unit`
Expected: `❌ search_test_cases Index Dispatch - FAILED: build/index.js does not dispatch 'search_test_cases'`

- [ ] **Step 3: Add the dispatch case in `src/index.ts`**

Find:

```typescript
          case 'search_test_cases_by_folder':
            return await this.toolHandlers.searchTestCasesByFolder(args as any);
```

Insert immediately after it:

```typescript
          case 'search_test_cases':
            return await this.toolHandlers.searchTestCases(args as any);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npm run test:unit`
Expected: `✅ search_test_cases Index Dispatch - PASSED`

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/zephyr-server.test.cjs
git commit -m "feat: wire up search_test_cases dispatch in index.ts"
```

---

### Task 5: Document the tool and run full verification

**Files:**
- Modify: `README.md` (add `search_test_cases` under the "Test Execution & Search" section, currently lines 134-138)

**Interfaces:**
- Consumes: nothing new — this is documentation plus a full-suite check of everything from Tasks 1-4.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Update `README.md`**

Find:

```markdown
### Test Execution & Search
- `get_test_execution`: Get detailed individual test execution results.
- `list_executions_by_cycle`: List all test executions for a specific test cycle with status, executor, and date. *(Cloud only)*
- `search_test_cases_by_folder`: Search for test cases in a specific folder. Automatically paginates through all results.
- `search_test_runs`: Search for test runs by project key and/or folder path.
```

Replace with:

```markdown
### Test Execution & Search
- `get_test_execution`: Get detailed individual test execution results.
- `list_executions_by_cycle`: List all test executions for a specific test cycle with status, executor, and date. *(Cloud only)*
- `search_test_cases_by_folder`: Search for test cases in a specific folder. Automatically paginates through all results.
- `search_test_cases`: Search for test cases by a case-insensitive name substring within a project, optionally scoped to an exact folder. Filters client-side (neither platform offers server-side name search); capped at 5000 scanned test cases per call — check the `truncated` field in the response.
- `search_test_runs`: Search for test runs by project key and/or folder path.
```

- [ ] **Step 2: Commit the documentation change**

```bash
git add README.md
git commit -m "docs: document search_test_cases tool in README"
```

- [ ] **Step 3: Run the full test suite**

Run: `npm run build && npm run test:unit`
Expected: all tests pass, including all seven `search_test_cases`-related assertions added across Tasks 2-4 (`Schema Contains New Tools`, `search_test_cases Cloud Unit Tests`, `search_test_cases Data Center Unit Tests`, `search_test_cases Index Dispatch`).

- [ ] **Step 4: Manual smoke check against your live Zephyr Scale Cloud instance**

The unit tests above use mocked axios and never hit a real API. Since you (the primary user) only run Cloud, do one live check before considering this done:

```bash
npm run inspector
```

In the MCP Inspector UI, call `search_test_cases` with a `project_key` you have access to and a `name_contains` value you know matches at least one real test case (and, separately, a folder-scoped call with `folder_path`). Confirm the returned `testCaseKeys` are correct and `totalScanned`/`truncated` look sane for your project size. The Data Center path has no live verification available in this environment — its correctness rests on the unit tests from Task 3 and the documented API behavior in the design spec.
