# Lookup & Reference Data Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new Cloud-only MCP tools — `get_projects`, `get_statuses`, `get_priorities`, `get_environments` — so an assistant can discover valid `projectKey`/`statusName`/`priorityName`/`environmentName` values before calling this server's existing create/update tools.

**Architecture:** Each tool is a thin wrapper: DC guard → single `GET` call to the Zephyr Scale Cloud v2 API → explicit field-projection mapping → JSON-text response. No new abstractions — follows the exact class/method/dispatch pattern already used by `getFolders` and `getTestCaseSteps` in `tool-handlers.ts`.

**Tech Stack:** TypeScript (ES2022/Node16 modules), `@modelcontextprotocol/sdk`, `axios`. No new dependencies.

## Global Constraints

- **Cloud only.** All 4 handlers throw `McpError(ErrorCode.InvalidRequest, ...)` immediately when `this.jiraConfig.type === 'datacenter'`, before any network call.
- **Exact DC-guard messages** (verbatim, one per tool):
  - `get_projects`: `"get_projects is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /projects endpoint."`
  - `get_statuses`: `"get_statuses is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /statuses endpoint."`
  - `get_priorities`: `"get_priorities is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /priorities endpoint."`
  - `get_environments`: `"get_environments is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /environments endpoint."`
- **No auto-pagination.** Each list call passes `startAt`/`maxResults` straight through to the API in one request; `total`/`isLast`/`startAt`/`maxResults` from the API's `PagedList` envelope are surfaced in the response so a caller can page manually.
- **`max_results` default is 200**, with no client-side cap enforcement (the API itself caps at 1000 and may return fewer — pass whatever the caller sends).
- **The raw API wraps list results under a `values` key** (confirmed via the Zephyr Scale Cloud v2 OpenAPI spec's `ProjectList`/`StatusList`/`PriorityList`/`EnvironmentList` schemas — same shape as `/folders`). Each handler renames `response.data.values` to the resource-specific output key (`projects`/`statuses`/`priorities`/`environments`).
- **Explicit field projection only** — every output item is built via a `.map()` allow-list of named fields (matching `getFolders`' style), never a raw passthrough of the API object. `self` URLs (`ProjectLink.self`, `PagedList.next`) are never included, by construction — not stripped after the fact.
- **No client-side validation** of `status_type` enum values or `project_key` format — the API is the source of truth for those.
- Design spec: `docs/superpowers/specs/2026-07-24-lookup-tools-design.md` — full endpoint/schema verification detail lives there.

**Known pre-existing gap, not in scope:** `CLAUDE.md`'s `### Organization` section currently lists only `create_folder` — `get_folders` (a full public tool, present in `tool-schemas.ts` and `README.md`) is missing from it. This plan does not fix that; it only adds the new `### Lookup / Reference Data` section after `### Organization` as-is. Worth a separate follow-up commit to add the missing `get_folders` line, but bundling an unrelated fix into this feature would violate the "no unrelated changes" rule.

**`testSchemaContainsNewTools` is intentionally left untouched.** That existing test (`test/zephyr-server.test.cjs:230`) only checks for `get_test_case_steps`, `update_test_case_steps`, and `search_test_cases` — it will stay stale after this plan and won't mention any of the 4 new tools. This is not a coverage gap: each `testGetXUnit()` method added by Tasks 1-4 ends with its own schema-file and dispatch-file assertions (see each task's Step 3), which is equivalent coverage scoped to the tool being added. Do not "fix" `testSchemaContainsNewTools` to add the 4 new names — it's an older, narrower pattern that the newer per-tool tests have superseded, not a shared registry that must be kept in sync.

**Deviation from the design spec's Files Changed table:** the spec lists `test/integration.test.cjs` as a file to update. This plan does not touch it. On inspection, every existing method in that file is a simulated placeholder — it logs strings like "In a real test, we'd make an actual HTTP request here" and never calls the live API despite the file's name. The most recent comparable feature (`search_test_cases`, see git history) also did not add anything there. Adding 4 more methods in that same simulated style would be indistinguishable from the placeholder tests the writing-plans process forbids, so this plan relies on the unit tests in Tasks 1-4 (which cover DC-guard behavior, request-param construction, and response shaping against a mocked `axiosInstance`) as the real verification, and leaves `test/integration.test.cjs` for a future change if genuine live-API integration testing is ever added to this repo.

---

### Task 1: `get_projects`

**Files:**
- Modify: `src/types.ts` (append `GetProjectsArgs` interface)
- Modify: `src/tool-schemas.ts:590-591` (insert new schema entry before the closing `];`)
- Modify: `src/tool-handlers.ts` (add `getProjects()` method after `getFolders()`, which ends at line 987, before `private async resolveStatusName` at line 989)
- Modify: `src/index.ts` (insert dispatch case immediately before `case 'list_executions_by_cycle':`, currently line 102)
- Modify: `test/zephyr-server.test.cjs` (add `testGetProjectsUnit()` method + register it in `runAllTests()`)
- Modify: `README.md` (insert new `### Lookup & Reference Data` section after `### Organization`, before `## Usage Examples`)
- Modify: `CLAUDE.md` (insert new `### Lookup / Reference Data` section after `### Organization`, before the `---` at line 115)

**Interfaces:**
- Produces: `GetProjectsArgs { project_key_or_id?: string; start_at?: number; max_results?: number; }` (in `src/types.ts`) — consumed by Tasks 2-4 only as a reference pattern, not directly imported by them.
- Produces: `ZephyrToolHandlers.getProjects(args: GetProjectsArgs): Promise<{ content: [{ type: 'text', text: string }] }>` — dispatched from `index.ts`'s `case 'get_projects'`.

- [ ] **Step 1: Add the `GetProjectsArgs` type**

In `src/types.ts`, append after the existing `UpdateTestCaseStepsArgs` interface (end of file):

```typescript
export interface GetProjectsArgs {
  project_key_or_id?: string;
  start_at?: number;
  max_results?: number;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert this entry immediately before the final `];` (after the `update_test_case_steps` entry, which currently ends at line 590 with `  },`):

```typescript
  {
    name: 'get_projects',
    description: 'Get Zephyr projects. If project_key_or_id is provided, fetches that single project instead of listing all projects. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        project_key_or_id: {
          type: 'string',
          description: 'Zephyr project ID or Jira project key (e.g., "PROJ"). When given, returns a single project instead of a paginated list.',
        },
        start_at: {
          type: 'number',
          description: 'Zero-indexed starting position for pagination. Ignored when project_key_or_id is given. Default 0.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return, up to 1000. Ignored when project_key_or_id is given. Default 200.',
        },
      },
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add this method after `testUpdateTestCaseStepsUnit()` (before `testSearchTestCasesCloudUnit`):

```javascript
  async testGetProjectsUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getProjects({});
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: list mode with defaults ---
    const cloudConfig = { type: 'cloud', apiEndpoints: {} };
    const requests = [];
    const mockAxios = {
      get: async (url, config) => {
        requests.push({ url, params: config && config.params });
        if (url === '/projects') {
          return { data: { values: [{ id: 10005, key: 'PROJ', jiraProjectId: 10000, enabled: true }], total: 1, isLast: true, startAt: 0, maxResults: 200 } };
        }
        return { data: { id: 10005, key: 'PROJ', jiraProjectId: 10000, enabled: true } };
      }
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);

    requests.length = 0;
    const listResult = await cloudHandlers.getProjects({});
    if (requests[0].url !== '/projects') throw new Error(`Expected GET /projects, got ${requests[0].url}`);
    if (requests[0].params.startAt !== 0) throw new Error(`Expected startAt=0, got ${requests[0].params.startAt}`);
    if (requests[0].params.maxResults !== 200) throw new Error(`Expected maxResults=200, got ${requests[0].params.maxResults}`);
    const listText = listResult.content[0].text;
    if (!listText.includes('"projects"')) throw new Error('Expected "projects" key in list response');
    if (!listText.includes('"PROJ"')) throw new Error('Expected project key PROJ in response');
    if (listText.includes('"self"')) throw new Error('Response should not include raw "self" URLs');

    // --- Cloud: custom pagination params ---
    requests.length = 0;
    await cloudHandlers.getProjects({ start_at: 10, max_results: 50 });
    if (requests[0].params.startAt !== 10) throw new Error(`Expected startAt=10, got ${requests[0].params.startAt}`);
    if (requests[0].params.maxResults !== 50) throw new Error(`Expected maxResults=50, got ${requests[0].params.maxResults}`);

    // --- Cloud: single project lookup ---
    requests.length = 0;
    const singleResult = await cloudHandlers.getProjects({ project_key_or_id: 'PROJ' });
    if (requests[0].url !== '/projects/PROJ') throw new Error(`Expected GET /projects/PROJ, got ${requests[0].url}`);
    const singleText = singleResult.content[0].text;
    if (singleText.includes('"projects"')) throw new Error('Single lookup should not include "projects" wrapper key');
    if (!singleText.includes('"PROJ"')) throw new Error('Expected project key PROJ in single-lookup response');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_projects'")) throw new Error("'get_projects' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_projects':`)) throw new Error("build/index.js does not dispatch 'get_projects'");
    if (!indexContent.includes('getProjects(args')) throw new Error('build/index.js does not call toolHandlers.getProjects(...)');
  }
```

Then register it in `runAllTests()`, after the `update_test_case_steps Unit Tests` line (around line 780):

```javascript
    await this.runTest('get_projects Unit Tests', () => this.testGetProjectsUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_projects Unit Tests - FAILED` (the `getProjects` method doesn't exist yet on `ZephyrToolHandlers`, so calling it throws a `TypeError`, not an `McpError`). Other tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add this method immediately after `getFolders()` (which ends at line 987 with a closing `}`), before `private async resolveStatusName` (line 989):

```typescript
  async getProjects(args: GetProjectsArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_projects is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /projects endpoint.'
      );
    }

    const { project_key_or_id, start_at = 0, max_results = 200 } = args;

    try {
      if (project_key_or_id) {
        const response = await this.axiosInstance.get(`/projects/${project_key_or_id}`);
        const p = response.data;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: p.id,
              key: p.key,
              jiraProjectId: p.jiraProjectId,
              enabled: p.enabled,
            }, null, 2),
          }],
        };
      }

      const response = await this.axiosInstance.get('/projects', {
        params: { startAt: start_at, maxResults: max_results },
      });
      const data = response.data;
      const values: any[] = Array.isArray(data?.values) ? data.values : [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total: data?.total ?? values.length,
            isLast: data?.isLast ?? true,
            startAt: data?.startAt ?? start_at,
            maxResults: data?.maxResults ?? max_results,
            projects: values.map((p: any) => ({
              id: p.id,
              key: p.key,
              jiraProjectId: p.jiraProjectId,
              enabled: p.enabled,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get projects: ${this.formatError(error)}`);
    }
  }
```

Add `GetProjectsArgs` to the import block at the top of `src/tool-handlers.ts` (currently lines 4-18), e.g. right after `UpdateTestCaseStepsArgs,`:

```typescript
  UpdateTestCaseStepsArgs,
  GetProjectsArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before the `case 'list_executions_by_cycle':` line (currently line 102) — i.e. between `update_test_case_steps` and `list_executions_by_cycle`:

```typescript
          case 'get_projects':
            return await this.toolHandlers.getProjects(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_projects Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

In `README.md`, insert this new section after the `### Organization` section (after line 144, before `## Usage Examples`):

```markdown

### Lookup & Reference Data
- `get_projects`: Get Zephyr projects. If `project_key_or_id` is given, fetches that single project instead of listing all. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

In `CLAUDE.md`, insert this new section after the `### Organization` section (after line 113, before the `---` at line 115):

```markdown

### Lookup / Reference Data
- `get_projects` — Cloud only; `GET /projects` (list) or `GET /projects/{projectIdOrKey}` (single, when `project_key_or_id` given)
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_projects tool (Cloud only)"
```

---

### Task 2: `get_statuses`

**Files:**
- Modify: `src/types.ts` (append `GetStatusesArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry before the closing `];`, after the `get_projects` entry added in Task 1)
- Modify: `src/tool-handlers.ts` (add `getStatuses()` method after `getProjects()`)
- Modify: `src/index.ts` (insert dispatch case immediately before `case 'list_executions_by_cycle':`, right after the `get_projects` case)
- Modify: `test/zephyr-server.test.cjs` (add `testGetStatusesUnit()` method + register it)
- Modify: `README.md` (append bullet to the `### Lookup & Reference Data` section added in Task 1)
- Modify: `CLAUDE.md` (append bullet to the `### Lookup / Reference Data` section added in Task 1)

**Interfaces:**
- Consumes: none from Task 1 (independent tool; only shares the file-location convention).
- Produces: `GetStatusesArgs { project_key?: string; status_type?: 'TEST_CASE' | 'TEST_PLAN' | 'TEST_CYCLE' | 'TEST_EXECUTION'; start_at?: number; max_results?: number; }` and `ZephyrToolHandlers.getStatuses(args: GetStatusesArgs)`.

- [ ] **Step 1: Add the `GetStatusesArgs` type**

In `src/types.ts`, append after `GetProjectsArgs`:

```typescript
export interface GetStatusesArgs {
  project_key?: string;
  status_type?: 'TEST_CASE' | 'TEST_PLAN' | 'TEST_CYCLE' | 'TEST_EXECUTION';
  start_at?: number;
  max_results?: number;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after the `get_projects` entry:

```typescript
  {
    name: 'get_statuses',
    description: 'Get statuses for test cases, test plans, test cycles, or test executions from Zephyr Scale. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        project_key: {
          type: 'string',
          description: 'Jira project key filter (e.g., "PROJ"). Optional.',
        },
        status_type: {
          type: 'string',
          enum: ['TEST_CASE', 'TEST_PLAN', 'TEST_CYCLE', 'TEST_EXECUTION'],
          description: 'Filter statuses by the entity type they belong to. Optional.',
        },
        start_at: {
          type: 'number',
          description: 'Zero-indexed starting position for pagination. Default 0.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return, up to 1000. Default 200.',
        },
      },
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testGetProjectsUnit()`:

```javascript
  async testGetStatusesUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getStatuses({});
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: filters passed through, response shaped ---
    const cloudConfig = { type: 'cloud', apiEndpoints: {} };
    const requests = [];
    const mockAxios = {
      get: async (url, config) => {
        requests.push({ url, params: config && config.params });
        return {
          data: {
            values: [{ id: 10000, project: { id: 10005, self: 'https://x/projects/10005' }, name: 'Draft', description: 'An important status', index: 0, color: '#FFF', archived: false, default: true }],
            total: 1, isLast: true, startAt: 0, maxResults: 200,
          },
        };
      }
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);

    const result = await cloudHandlers.getStatuses({ project_key: 'PROJ', status_type: 'TEST_CASE' });
    if (requests[0].url !== '/statuses') throw new Error(`Expected GET /statuses, got ${requests[0].url}`);
    if (requests[0].params.projectKey !== 'PROJ') throw new Error(`Expected projectKey=PROJ, got ${requests[0].params.projectKey}`);
    if (requests[0].params.statusType !== 'TEST_CASE') throw new Error(`Expected statusType=TEST_CASE, got ${requests[0].params.statusType}`);
    const text = result.content[0].text;
    if (!text.includes('"statuses"')) throw new Error('Expected "statuses" key in response');
    if (!text.includes('"Draft"')) throw new Error('Expected status name Draft in response');
    if (text.includes('"self"')) throw new Error('Response should not include raw "self" URLs');

    // --- Defaults when no filters given ---
    requests.length = 0;
    await cloudHandlers.getStatuses({});
    if (requests[0].params.startAt !== 0) throw new Error(`Expected startAt=0, got ${requests[0].params.startAt}`);
    if (requests[0].params.maxResults !== 200) throw new Error(`Expected maxResults=200, got ${requests[0].params.maxResults}`);
    if ('projectKey' in requests[0].params) throw new Error('projectKey should be omitted when not provided');
    if ('statusType' in requests[0].params) throw new Error('statusType should be omitted when not provided');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_statuses'")) throw new Error("'get_statuses' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_statuses':`)) throw new Error("build/index.js does not dispatch 'get_statuses'");
    if (!indexContent.includes('getStatuses(args')) throw new Error('build/index.js does not call toolHandlers.getStatuses(...)');
  }
```

Register it in `runAllTests()`, after the `get_projects Unit Tests` line:

```javascript
    await this.runTest('get_statuses Unit Tests', () => this.testGetStatusesUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_statuses Unit Tests - FAILED` (`getStatuses` doesn't exist yet). All Task 1 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `getProjects()`:

```typescript
  async getStatuses(args: GetStatusesArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_statuses is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /statuses endpoint.'
      );
    }

    const { project_key, status_type, start_at = 0, max_results = 200 } = args;

    try {
      const params: Record<string, any> = { startAt: start_at, maxResults: max_results };
      if (project_key) params.projectKey = project_key;
      if (status_type) params.statusType = status_type;

      const response = await this.axiosInstance.get('/statuses', { params });
      const data = response.data;
      const values: any[] = Array.isArray(data?.values) ? data.values : [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total: data?.total ?? values.length,
            isLast: data?.isLast ?? true,
            startAt: data?.startAt ?? start_at,
            maxResults: data?.maxResults ?? max_results,
            statuses: values.map((s: any) => ({
              id: s.id,
              project: { id: s.project?.id },
              name: s.name,
              description: s.description ?? null,
              index: s.index,
              color: s.color ?? null,
              archived: s.archived ?? false,
              default: s.default ?? false,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get statuses: ${this.formatError(error)}`);
    }
  }
```

Add `GetStatusesArgs` to the import block in `src/tool-handlers.ts`, after `GetProjectsArgs,`:

```typescript
  GetProjectsArgs,
  GetStatusesArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before the `case 'list_executions_by_cycle':` line — i.e. right after the `get_projects` case added in Task 1:

```typescript
          case 'get_statuses':
            return await this.toolHandlers.getStatuses(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_statuses Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

In `README.md`, append this bullet to the `### Lookup & Reference Data` section added in Task 1:

```markdown
- `get_statuses`: Get statuses for test cases, test plans, test cycles, or test executions, optionally filtered by project and entity type. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

In `CLAUDE.md`, append this bullet to the `### Lookup / Reference Data` section added in Task 1:

```markdown
- `get_statuses` — Cloud only; `GET /statuses`, filterable by `projectKey`/`statusType`
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_statuses tool (Cloud only)"
```

---

### Task 3: `get_priorities`

**Files:**
- Modify: `src/types.ts` (append `GetPrioritiesArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry before the closing `];`, after the `get_statuses` entry)
- Modify: `src/tool-handlers.ts` (add `getPriorities()` method after `getStatuses()`)
- Modify: `src/index.ts` (insert dispatch case immediately before `case 'list_executions_by_cycle':`, right after the `get_statuses` case)
- Modify: `test/zephyr-server.test.cjs` (add `testGetPrioritiesUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Lookup & Reference Data`)
- Modify: `CLAUDE.md` (append bullet to `### Lookup / Reference Data`)

**Interfaces:**
- Consumes: none from Tasks 1-2 (independent tool).
- Produces: `GetPrioritiesArgs { project_key?: string; start_at?: number; max_results?: number; }` and `ZephyrToolHandlers.getPriorities(args: GetPrioritiesArgs)`.

- [ ] **Step 1: Add the `GetPrioritiesArgs` type**

In `src/types.ts`, append after `GetStatusesArgs`:

```typescript
export interface GetPrioritiesArgs {
  project_key?: string;
  start_at?: number;
  max_results?: number;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after the `get_statuses` entry:

```typescript
  {
    name: 'get_priorities',
    description: 'Get priorities for test cases from Zephyr Scale. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        project_key: {
          type: 'string',
          description: 'Jira project key filter (e.g., "PROJ"). Optional.',
        },
        start_at: {
          type: 'number',
          description: 'Zero-indexed starting position for pagination. Default 0.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return, up to 1000. Default 200.',
        },
      },
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testGetStatusesUnit()`:

```javascript
  async testGetPrioritiesUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getPriorities({});
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: filter passed through, response shaped ---
    const cloudConfig = { type: 'cloud', apiEndpoints: {} };
    const requests = [];
    const mockAxios = {
      get: async (url, config) => {
        requests.push({ url, params: config && config.params });
        return {
          data: {
            values: [{ id: 1, project: { id: 10005, self: 'https://x/projects/10005' }, name: 'Critical', description: 'Top level priority', index: 1, color: '#FFF', default: false }],
            total: 1, isLast: true, startAt: 0, maxResults: 200,
          },
        };
      }
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);

    const result = await cloudHandlers.getPriorities({ project_key: 'PROJ' });
    if (requests[0].url !== '/priorities') throw new Error(`Expected GET /priorities, got ${requests[0].url}`);
    if (requests[0].params.projectKey !== 'PROJ') throw new Error(`Expected projectKey=PROJ, got ${requests[0].params.projectKey}`);
    const text = result.content[0].text;
    if (!text.includes('"priorities"')) throw new Error('Expected "priorities" key in response');
    if (!text.includes('"Critical"')) throw new Error('Expected priority name Critical in response');
    if (text.includes('"self"')) throw new Error('Response should not include raw "self" URLs');

    // --- Defaults when no filter given ---
    requests.length = 0;
    await cloudHandlers.getPriorities({});
    if (requests[0].params.startAt !== 0) throw new Error(`Expected startAt=0, got ${requests[0].params.startAt}`);
    if (requests[0].params.maxResults !== 200) throw new Error(`Expected maxResults=200, got ${requests[0].params.maxResults}`);
    if ('projectKey' in requests[0].params) throw new Error('projectKey should be omitted when not provided');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_priorities'")) throw new Error("'get_priorities' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_priorities':`)) throw new Error("build/index.js does not dispatch 'get_priorities'");
    if (!indexContent.includes('getPriorities(args')) throw new Error('build/index.js does not call toolHandlers.getPriorities(...)');
  }
```

Register it in `runAllTests()`, after the `get_statuses Unit Tests` line:

```javascript
    await this.runTest('get_priorities Unit Tests', () => this.testGetPrioritiesUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_priorities Unit Tests - FAILED` (`getPriorities` doesn't exist yet). All Task 1-2 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `getStatuses()`:

```typescript
  async getPriorities(args: GetPrioritiesArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_priorities is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /priorities endpoint.'
      );
    }

    const { project_key, start_at = 0, max_results = 200 } = args;

    try {
      const params: Record<string, any> = { startAt: start_at, maxResults: max_results };
      if (project_key) params.projectKey = project_key;

      const response = await this.axiosInstance.get('/priorities', { params });
      const data = response.data;
      const values: any[] = Array.isArray(data?.values) ? data.values : [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total: data?.total ?? values.length,
            isLast: data?.isLast ?? true,
            startAt: data?.startAt ?? start_at,
            maxResults: data?.maxResults ?? max_results,
            priorities: values.map((p: any) => ({
              id: p.id,
              project: { id: p.project?.id },
              name: p.name,
              description: p.description ?? null,
              index: p.index,
              color: p.color ?? null,
              default: p.default ?? false,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get priorities: ${this.formatError(error)}`);
    }
  }
```

Add `GetPrioritiesArgs` to the import block in `src/tool-handlers.ts`, after `GetStatusesArgs,`:

```typescript
  GetStatusesArgs,
  GetPrioritiesArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before the `case 'list_executions_by_cycle':` line — i.e. right after the `get_statuses` case added in Task 2:

```typescript
          case 'get_priorities':
            return await this.toolHandlers.getPriorities(args as any);
```

- [ ] **Step 7: Rebuild and run tests, confirm they pass**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_priorities Unit Tests - PASSED`, all other tests still passing.

- [ ] **Step 8: Update README.md**

In `README.md`, append this bullet to the `### Lookup & Reference Data` section:

```markdown
- `get_priorities`: Get priorities for test cases, optionally filtered by project. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

In `CLAUDE.md`, append this bullet to the `### Lookup / Reference Data` section:

```markdown
- `get_priorities` — Cloud only; `GET /priorities`, filterable by `projectKey`
```

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_priorities tool (Cloud only)"
```

---

### Task 4: `get_environments`

**Files:**
- Modify: `src/types.ts` (append `GetEnvironmentsArgs` interface)
- Modify: `src/tool-schemas.ts` (insert new schema entry before the closing `];`, after the `get_priorities` entry)
- Modify: `src/tool-handlers.ts` (add `getEnvironments()` method after `getPriorities()`)
- Modify: `src/index.ts` (insert dispatch case immediately before `case 'list_executions_by_cycle':`, right after the `get_priorities` case)
- Modify: `test/zephyr-server.test.cjs` (add `testGetEnvironmentsUnit()` method + register it)
- Modify: `README.md` (append bullet to `### Lookup & Reference Data`)
- Modify: `CLAUDE.md` (append bullet to `### Lookup / Reference Data`)

**Interfaces:**
- Consumes: none from Tasks 1-3 (independent tool).
- Produces: `GetEnvironmentsArgs { project_key?: string; start_at?: number; max_results?: number; }` and `ZephyrToolHandlers.getEnvironments(args: GetEnvironmentsArgs)`.

- [ ] **Step 1: Add the `GetEnvironmentsArgs` type**

In `src/types.ts`, append after `GetPrioritiesArgs`:

```typescript
export interface GetEnvironmentsArgs {
  project_key?: string;
  start_at?: number;
  max_results?: number;
}
```

- [ ] **Step 2: Add the tool schema**

In `src/tool-schemas.ts`, insert immediately before the final `];`, after the `get_priorities` entry:

```typescript
  {
    name: 'get_environments',
    description: 'Get environments from Zephyr Scale. (Cloud only)',
    inputSchema: {
      type: 'object',
      properties: {
        project_key: {
          type: 'string',
          description: 'Jira project key filter (e.g., "PROJ"). Optional.',
        },
        start_at: {
          type: 'number',
          description: 'Zero-indexed starting position for pagination. Default 0.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return, up to 1000. Default 200.',
        },
      },
    },
  },
```

- [ ] **Step 3: Write the failing unit test**

In `test/zephyr-server.test.cjs`, add after `testGetPrioritiesUnit()`:

```javascript
  async testGetEnvironmentsUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getEnvironments({});
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
    }

    // --- Cloud: filter passed through, response shaped ---
    const cloudConfig = { type: 'cloud', apiEndpoints: {} };
    const requests = [];
    const mockAxios = {
      get: async (url, config) => {
        requests.push({ url, params: config && config.params });
        return {
          data: {
            values: [{ id: 1, project: { id: 10005, self: 'https://x/projects/10005' }, name: 'Development', description: 'New development environment', index: 0, archived: false }],
            total: 1, isLast: true, startAt: 0, maxResults: 200,
          },
        };
      }
    };
    const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);

    const result = await cloudHandlers.getEnvironments({ project_key: 'PROJ' });
    if (requests[0].url !== '/environments') throw new Error(`Expected GET /environments, got ${requests[0].url}`);
    if (requests[0].params.projectKey !== 'PROJ') throw new Error(`Expected projectKey=PROJ, got ${requests[0].params.projectKey}`);
    const text = result.content[0].text;
    if (!text.includes('"environments"')) throw new Error('Expected "environments" key in response');
    if (!text.includes('"Development"')) throw new Error('Expected environment name Development in response');
    if (text.includes('"self"')) throw new Error('Response should not include raw "self" URLs');

    // --- Defaults when no filter given ---
    requests.length = 0;
    await cloudHandlers.getEnvironments({});
    if (requests[0].params.startAt !== 0) throw new Error(`Expected startAt=0, got ${requests[0].params.startAt}`);
    if (requests[0].params.maxResults !== 200) throw new Error(`Expected maxResults=200, got ${requests[0].params.maxResults}`);
    if ('projectKey' in requests[0].params) throw new Error('projectKey should be omitted when not provided');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_environments'")) throw new Error("'get_environments' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_environments':`)) throw new Error("build/index.js does not dispatch 'get_environments'");
    if (!indexContent.includes('getEnvironments(args')) throw new Error('build/index.js does not call toolHandlers.getEnvironments(...)');
  }
```

Register it in `runAllTests()`, after the `get_priorities Unit Tests` line:

```javascript
    await this.runTest('get_environments Unit Tests', () => this.testGetEnvironmentsUnit());
```

- [ ] **Step 4: Run the build and test suite, confirm the new test fails**

Run:
```bash
npm run build && npm run test:unit
```
Expected: `get_environments Unit Tests - FAILED` (`getEnvironments` doesn't exist yet). All Task 1-3 tests still pass.

- [ ] **Step 5: Implement the handler**

In `src/tool-handlers.ts`, add after `getPriorities()`:

```typescript
  async getEnvironments(args: GetEnvironmentsArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_environments is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not expose a /environments endpoint.'
      );
    }

    const { project_key, start_at = 0, max_results = 200 } = args;

    try {
      const params: Record<string, any> = { startAt: start_at, maxResults: max_results };
      if (project_key) params.projectKey = project_key;

      const response = await this.axiosInstance.get('/environments', { params });
      const data = response.data;
      const values: any[] = Array.isArray(data?.values) ? data.values : [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total: data?.total ?? values.length,
            isLast: data?.isLast ?? true,
            startAt: data?.startAt ?? start_at,
            maxResults: data?.maxResults ?? max_results,
            environments: values.map((e: any) => ({
              id: e.id,
              project: { id: e.project?.id },
              name: e.name,
              description: e.description ?? null,
              index: e.index,
              archived: e.archived ?? false,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get environments: ${this.formatError(error)}`);
    }
  }
```

Add `GetEnvironmentsArgs` to the import block in `src/tool-handlers.ts`, after `GetPrioritiesArgs,`:

```typescript
  GetPrioritiesArgs,
  GetEnvironmentsArgs,
```

- [ ] **Step 6: Wire up the dispatch case**

In `src/index.ts`, insert immediately before the `case 'list_executions_by_cycle':` line — i.e. right after the `get_priorities` case added in Task 3:

```typescript
          case 'get_environments':
            return await this.toolHandlers.getEnvironments(args as any);
```

- [ ] **Step 7: Rebuild and run the full test suite, confirm everything passes**

Run:
```bash
npm run build && npm run test:unit
```
Expected: all tests pass, including `get_projects Unit Tests`, `get_statuses Unit Tests`, `get_priorities Unit Tests`, and `get_environments Unit Tests` — 4/4 new tools green alongside every pre-existing test.

- [ ] **Step 8: Update README.md**

In `README.md`, append this bullet to the `### Lookup & Reference Data` section, completing it:

```markdown
- `get_environments`: Get environments, optionally filtered by project. *(Cloud only)*
```

- [ ] **Step 9: Update CLAUDE.md**

In `CLAUDE.md`, append this bullet to the `### Lookup / Reference Data` section, completing it:

```markdown
- `get_environments` — Cloud only; `GET /environments`, filterable by `projectKey`
```

- [ ] **Step 10: Final verification and commit**

Confirm both docs now list all 4 tools:
```bash
grep -A5 "Lookup & Reference Data" README.md
grep -A5 "Lookup / Reference Data" CLAUDE.md
```
Expected: each shows exactly 4 bullets (`get_projects`, `get_statuses`, `get_priorities`, `get_environments`).

```bash
git add src/types.ts src/tool-schemas.ts src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs README.md CLAUDE.md
git commit -m "feat: add get_environments tool (Cloud only)"
```
