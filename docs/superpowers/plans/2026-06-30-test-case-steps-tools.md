# Test Case Steps Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `get_test_case_steps` and `update_test_case_steps` MCP tools that expose the Zephyr Scale Cloud API v2 `/teststeps` endpoint, enabling AI assistants to read and write STEP_BY_STEP test steps without converting them to BDD.

**Architecture:** Two new methods on the existing `ZephyrToolHandlers` class in `tool-handlers.ts`. Both are Cloud-only and guard with the same `datacenter` check pattern already used by `addTestCasesToRun`. Step validation runs in the handler before any API call. Step-to-items mapping duplicates the logic already in `upsertTestScriptCloud` — no abstraction yet (two callers, not three).

**Tech Stack:** TypeScript (ES2022, Node16 modules), Axios, `@modelcontextprotocol/sdk`, CommonJS test runner (`test/zephyr-server.test.cjs`), Node.js dynamic `import()` for testing ES module handlers from CJS test files.

## Global Constraints

- All `src/` edits require `npm run build` before tests can run — tests run against `build/`, not source.
- Test files must stay `.cjs` (CommonJS). Use `await import('...js')` for ES module imports inside async test methods.
- Cloud-only tools throw `McpError(ErrorCode.InvalidRequest, ...)` for `datacenter` — not `InternalError`.
- Validation errors throw `McpError(ErrorCode.InvalidParams, ...)` — not `InternalError`.
- API call errors throw `McpError(ErrorCode.InternalError, `Failed to ...: ${this.formatError(error)}`)`.
- `testData` and `expectedResult` map to `null` (not `undefined`) when absent — matches existing `upsertTestScriptCloud` behavior so OVERWRITE mode clears old values.

---

### Task 1: Types, schemas, and schema registration test

**Files:**
- Modify: `src/types.ts` (append two interfaces after line 103)
- Modify: `src/tool-schemas.ts` (append two entries before the closing `]`)
- Modify: `test/zephyr-server.test.cjs` (add `testSchemaContainsNewTools` method)

**Interfaces:**
- Produces: `GetTestCaseStepsArgs`, `UpdateTestCaseStepsArgs` (consumed by Tasks 2 & 3)
- Produces: schema entries with names `'get_test_case_steps'` and `'update_test_case_steps'` (consumed by Tasks 2 & 3 switch wiring)

- [ ] **Step 1: Write the failing schema test**

Add this method to the `ZephyrServerTest` class in `test/zephyr-server.test.cjs`, before `runAllTests`:

```javascript
async testSchemaContainsNewTools() {
  const fs = require('fs');
  const content = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
  const tools = ['get_test_case_steps', 'update_test_case_steps'];
  for (const tool of tools) {
    if (!content.includes(tool)) {
      throw new Error(`'${tool}' not found in built tool-schemas.js`);
    }
  }
}
```

Register it in `runAllTests` after the existing `await this.runTest('Tools List', ...)` line:

```javascript
await this.runTest('Schema Contains New Tools', () => this.testSchemaContainsNewTools());
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/sontnguyen/Downloads/Zephyr_mcp_server && npm run test:unit
```

Expected: FAIL — `'get_test_case_steps' not found in built tool-schemas.js`

- [ ] **Step 3: Add interfaces to `src/types.ts`**

Append after the last interface (after line 103, before the closing of the file):

```typescript
export interface GetTestCaseStepsArgs {
  test_case_key: string;
  start_at?: number;
  max_results?: number;
}

export interface UpdateTestCaseStepsArgs {
  test_case_key: string;
  steps: Array<{
    description?: string;
    testData?: string;
    expectedResult?: string;
    testCaseKey?: string;
  }>;
  mode?: 'APPEND' | 'OVERWRITE';
}
```

- [ ] **Step 4: Add schemas to `src/tool-schemas.ts`**

Append these two entries inside the `toolSchemas` array, after the last entry (after the closing `},` of `add_test_cases_to_run`):

```typescript
  {
    name: 'get_test_case_steps',
    description: 'Get the test steps for a specific test case (Cloud only). Returns the raw paginated API response including values, total, startAt, and maxResults fields.',
    inputSchema: {
      type: 'object',
      properties: {
        test_case_key: {
          type: 'string',
          description: 'Test case key (e.g., QA-T123)',
        },
        start_at: {
          type: 'integer',
          description: 'Zero-based page offset (default 0)',
          minimum: 0,
          default: 0,
        },
        max_results: {
          type: 'integer',
          description: 'Page size between 1 and 100 (default 100)',
          minimum: 1,
          maximum: 100,
          default: 100,
        },
      },
      required: ['test_case_key'],
    },
  },
  {
    name: 'update_test_case_steps',
    description: 'Write STEP_BY_STEP test steps to an existing test case (Cloud only). Use mode APPEND to add steps without destroying existing ones, or OVERWRITE to replace all steps.',
    inputSchema: {
      type: 'object',
      properties: {
        test_case_key: {
          type: 'string',
          description: 'Test case key to update (e.g., QA-T123)',
        },
        steps: {
          type: 'array',
          description: 'Steps to write. Each step is either an inline step (description required; testData and expectedResult optional) or a call-to-test reference (testCaseKey only — mutually exclusive with inline fields).',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Step action text (required for inline steps)' },
              testData: { type: 'string', description: 'Input data for the step (optional, inline only)' },
              expectedResult: { type: 'string', description: 'Expected outcome (optional, inline only)' },
              testCaseKey: { type: 'string', description: 'Key of another test case to call — mutually exclusive with inline fields' },
            },
          },
        },
        mode: {
          type: 'string',
          enum: ['APPEND', 'OVERWRITE'],
          description: 'Write mode. APPEND (default) adds to existing steps. OVERWRITE replaces all existing steps.',
          default: 'APPEND',
        },
      },
      required: ['test_case_key', 'steps'],
    },
  },
```

- [ ] **Step 5: Build**

```bash
cd /Users/sontnguyen/Downloads/Zephyr_mcp_server && npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Run test to verify it passes**

```bash
npm run test:unit
```

Expected: `Schema Contains New Tools` — PASSED. All other tests still PASSED.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/tool-schemas.ts test/zephyr-server.test.cjs build/tool-schemas.js build/types.js
git commit -m "feat: add types and schemas for get_test_case_steps and update_test_case_steps"
```

---

### Task 2: `get_test_case_steps` handler

**Files:**
- Modify: `src/tool-handlers.ts` (add `getTestCaseSteps` method before `formatError`)
- Modify: `src/index.ts` (add case in switch)
- Modify: `test/zephyr-server.test.cjs` (add `testGetTestCaseStepsUnit` method)

**Interfaces:**
- Consumes: `GetTestCaseStepsArgs` from `src/types.ts` (Task 1)
- Produces: `ZephyrToolHandlers.getTestCaseSteps(args: GetTestCaseStepsArgs)` — called by `index.ts` switch

- [ ] **Step 1: Write the failing unit tests**

Add this method to `ZephyrServerTest` in `test/zephyr-server.test.cjs`, before `runAllTests`:

```javascript
async testGetTestCaseStepsUnit() {
  const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
  const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

  // --- DC rejection ---
  const dcConfig = {
    type: 'datacenter',
    apiEndpoints: { testcase: 'http://dc.example.com/rest/atm/1.0/testcase' }
  };
  const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
  try {
    await dcHandlers.getTestCaseSteps({ test_case_key: 'QA-T1' });
    throw new Error('Expected McpError for datacenter');
  } catch (e) {
    if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
  }

  // --- Param validation ---
  const cloudConfig = {
    type: 'cloud',
    apiEndpoints: { testcase: 'https://api.zephyrscale.smartbear.com/v2/testcases' }
  };
  const requests = [];
  const mockAxios = {
    get: async (url, config) => {
      requests.push({ url, params: config && config.params });
      return { data: { values: [], total: 0, startAt: 0, maxResults: 100 } };
    }
  };
  const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);

  // start_at < 0 rejected
  try {
    await cloudHandlers.getTestCaseSteps({ test_case_key: 'QA-T1', start_at: -1 });
    throw new Error('Expected McpError for start_at < 0');
  } catch (e) {
    if (!(e instanceof McpError)) throw new Error(`Expected McpError for start_at=-1, got: ${e.message}`);
  }

  // max_results = 0 rejected
  try {
    await cloudHandlers.getTestCaseSteps({ test_case_key: 'QA-T1', max_results: 0 });
    throw new Error('Expected McpError for max_results=0');
  } catch (e) {
    if (!(e instanceof McpError)) throw new Error(`Expected McpError for max_results=0, got: ${e.message}`);
  }

  // max_results = 101 rejected
  try {
    await cloudHandlers.getTestCaseSteps({ test_case_key: 'QA-T1', max_results: 101 });
    throw new Error('Expected McpError for max_results=101');
  } catch (e) {
    if (!(e instanceof McpError)) throw new Error(`Expected McpError for max_results=101, got: ${e.message}`);
  }

  // --- Successful call with defaults ---
  requests.length = 0;
  const result = await cloudHandlers.getTestCaseSteps({ test_case_key: 'QA-T1' });
  if (!result.content || !result.content[0] || !result.content[0].text.includes('"total"')) {
    throw new Error('Expected JSON response containing "total"');
  }
  if (requests[0].params.startAt !== 0) throw new Error(`Expected startAt=0, got ${requests[0].params.startAt}`);
  if (requests[0].params.maxResults !== 100) throw new Error(`Expected maxResults=100, got ${requests[0].params.maxResults}`);
  if (!requests[0].url.includes('QA-T1/teststeps')) throw new Error(`Expected URL containing QA-T1/teststeps, got ${requests[0].url}`);

  // --- Custom pagination params ---
  requests.length = 0;
  await cloudHandlers.getTestCaseSteps({ test_case_key: 'QA-T1', start_at: 10, max_results: 50 });
  if (requests[0].params.startAt !== 10) throw new Error(`Expected startAt=10, got ${requests[0].params.startAt}`);
  if (requests[0].params.maxResults !== 50) throw new Error(`Expected maxResults=50, got ${requests[0].params.maxResults}`);
}
```

Register in `runAllTests`:

```javascript
await this.runTest('get_test_case_steps Unit Tests', () => this.testGetTestCaseStepsUnit());
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit
```

Expected: FAIL — `dcHandlers.getTestCaseSteps is not a function` (method doesn't exist yet).

- [ ] **Step 3: Add `getTestCaseSteps` to `src/tool-handlers.ts`**

Add the import for the new types at the top of the imports block (the import from `./types.js` already exists — extend it):

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

Add this method to the `ZephyrToolHandlers` class. Place it after `updateTestCaseBdd` (after line ~418) and before `createFolder`:

```typescript
  async getTestCaseSteps(args: GetTestCaseStepsArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'get_test_case_steps is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not provide a dedicated /teststeps endpoint.'
      );
    }

    const { test_case_key, start_at = 0, max_results = 100 } = args;

    if (start_at < 0) {
      throw new McpError(ErrorCode.InvalidParams, `start_at must be >= 0, got ${start_at}`);
    }
    if (max_results < 1 || max_results > 100) {
      throw new McpError(ErrorCode.InvalidParams, `max_results must be between 1 and 100, got ${max_results}`);
    }

    try {
      const response = await this.axiosInstance.get(
        `${this.jiraConfig.apiEndpoints.testcase}/${test_case_key}/teststeps`,
        { params: { startAt: start_at, maxResults: max_results } }
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get test case steps: ${this.formatError(error)}`);
    }
  }
```

- [ ] **Step 4: Wire up the switch case in `src/index.ts`**

Add after the `case 'add_test_cases_to_run':` block (before `case 'list_executions_by_cycle':`):

```typescript
          case 'get_test_case_steps':
            return await this.toolHandlers.getTestCaseSteps(args as any);
```

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test:unit
```

Expected: `get_test_case_steps Unit Tests` — PASSED. All other tests still PASSED.

- [ ] **Step 7: Commit**

```bash
git add src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs build/tool-handlers.js build/index.js
git commit -m "feat: add get_test_case_steps tool (Cloud only)"
```

---

### Task 3: `update_test_case_steps` handler

**Files:**
- Modify: `src/tool-handlers.ts` (add `updateTestCaseSteps` method after `getTestCaseSteps`)
- Modify: `src/index.ts` (add case in switch)
- Modify: `test/zephyr-server.test.cjs` (add `testUpdateTestCaseStepsUnit` method)

**Interfaces:**
- Consumes: `UpdateTestCaseStepsArgs` from `src/types.ts` (Task 1)
- Consumes: `GetTestCaseStepsArgs` import already added in Task 2 — `UpdateTestCaseStepsArgs` is already in that import
- Produces: `ZephyrToolHandlers.updateTestCaseSteps(args: UpdateTestCaseStepsArgs)` — called by `index.ts` switch

- [ ] **Step 1: Write the failing unit tests**

Add this method to `ZephyrServerTest` in `test/zephyr-server.test.cjs`, before `runAllTests`:

```javascript
async testUpdateTestCaseStepsUnit() {
  const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
  const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

  // --- DC rejection ---
  const dcConfig = {
    type: 'datacenter',
    apiEndpoints: { testcase: 'http://dc.example.com/rest/atm/1.0/testcase' }
  };
  const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
  try {
    await dcHandlers.updateTestCaseSteps({ test_case_key: 'QA-T1', steps: [{ description: 'step' }] });
    throw new Error('Expected McpError for datacenter');
  } catch (e) {
    if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
  }

  // --- Cloud handler setup ---
  const cloudConfig = {
    type: 'cloud',
    apiEndpoints: { testcase: 'https://api.zephyrscale.smartbear.com/v2/testcases' }
  };
  const postedBodies = [];
  const mockAxios = {
    post: async (url, body) => {
      postedBodies.push({ url, body });
      return { data: {} };
    }
  };
  const cloudHandlers = new ZephyrToolHandlers(mockAxios, cloudConfig);

  // --- Step validation: empty step ---
  try {
    await cloudHandlers.updateTestCaseSteps({ test_case_key: 'QA-T1', steps: [{}] });
    throw new Error('Expected McpError for empty step');
  } catch (e) {
    if (!(e instanceof McpError)) throw new Error(`Expected McpError for empty step, got: ${e.message}`);
  }

  // --- Step validation: testCaseKey + inline fields mutually exclusive ---
  try {
    await cloudHandlers.updateTestCaseSteps({
      test_case_key: 'QA-T1',
      steps: [{ testCaseKey: 'QA-T99', description: 'step' }]
    });
    throw new Error('Expected McpError for testCaseKey + description');
  } catch (e) {
    if (!(e instanceof McpError)) throw new Error(`Expected McpError for mutual exclusion, got: ${e.message}`);
  }

  // testCaseKey + testData also rejected
  try {
    await cloudHandlers.updateTestCaseSteps({
      test_case_key: 'QA-T1',
      steps: [{ testCaseKey: 'QA-T99', testData: 'data' }]
    });
    throw new Error('Expected McpError for testCaseKey + testData');
  } catch (e) {
    if (!(e instanceof McpError)) throw new Error(`Expected McpError for testCaseKey + testData, got: ${e.message}`);
  }

  // --- Step validation: inline step without description ---
  try {
    await cloudHandlers.updateTestCaseSteps({
      test_case_key: 'QA-T1',
      steps: [{ testData: 'some data' }]
    });
    throw new Error('Expected McpError for inline step without description');
  } catch (e) {
    if (!(e instanceof McpError)) throw new Error(`Expected McpError for missing description, got: ${e.message}`);
  }

  // --- Mode defaults to APPEND ---
  postedBodies.length = 0;
  const result = await cloudHandlers.updateTestCaseSteps({
    test_case_key: 'QA-T1',
    steps: [{ description: 'Navigate to page', expectedResult: 'Page loads' }]
  });
  if (postedBodies[0].body.mode !== 'APPEND') {
    throw new Error(`Expected default mode APPEND, got ${postedBodies[0].body.mode}`);
  }
  if (!result.content[0].text.includes('APPEND')) {
    throw new Error('Expected APPEND in success message');
  }
  if (!result.content[0].text.includes('QA-T1')) {
    throw new Error('Expected test case key in success message');
  }

  // --- Inline step mapping: null for absent testData and expectedResult ---
  postedBodies.length = 0;
  await cloudHandlers.updateTestCaseSteps({
    test_case_key: 'QA-T1',
    steps: [{ description: 'Step with no data' }]
  });
  const inlineItem = postedBodies[0].body.items[0];
  if (!inlineItem.inline) throw new Error('Expected inline item');
  if (inlineItem.inline.description !== 'Step with no data') throw new Error('Wrong description');
  if (inlineItem.inline.testData !== null) throw new Error(`Expected testData=null, got ${inlineItem.inline.testData}`);
  if (inlineItem.inline.expectedResult !== null) throw new Error(`Expected expectedResult=null, got ${inlineItem.inline.expectedResult}`);

  // --- Inline step with all fields ---
  postedBodies.length = 0;
  await cloudHandlers.updateTestCaseSteps({
    test_case_key: 'QA-T1',
    steps: [{ description: 'Enter credentials', testData: 'user@example.com', expectedResult: 'Logged in' }]
  });
  const fullItem = postedBodies[0].body.items[0];
  if (!fullItem.inline) throw new Error('Expected inline item for full step');
  if (fullItem.inline.testData !== 'user@example.com') throw new Error('Wrong testData');
  if (fullItem.inline.expectedResult !== 'Logged in') throw new Error('Wrong expectedResult');

  // --- Call-to-test step mapping ---
  postedBodies.length = 0;
  await cloudHandlers.updateTestCaseSteps({
    test_case_key: 'QA-T1',
    steps: [{ testCaseKey: 'QA-T99' }]
  });
  const ctItem = postedBodies[0].body.items[0];
  if (!ctItem.testCase) throw new Error('Expected testCase item for call-to-test step');
  if (ctItem.testCase.testCaseKey !== 'QA-T99') throw new Error(`Expected testCaseKey=QA-T99, got ${ctItem.testCase.testCaseKey}`);
  if (ctItem.inline) throw new Error('call-to-test item should not have inline field');

  // --- Mixed step array (inline + call-to-test) ---
  postedBodies.length = 0;
  await cloudHandlers.updateTestCaseSteps({
    test_case_key: 'QA-T1',
    steps: [
      { description: 'First inline step' },
      { testCaseKey: 'QA-T99' },
      { description: 'Last inline step', expectedResult: 'Done' }
    ]
  });
  const items = postedBodies[0].body.items;
  if (items.length !== 3) throw new Error(`Expected 3 items, got ${items.length}`);
  if (!items[0].inline) throw new Error('Item 0 should be inline');
  if (!items[1].testCase) throw new Error('Item 1 should be testCase');
  if (!items[2].inline) throw new Error('Item 2 should be inline');

  // --- OVERWRITE mode ---
  postedBodies.length = 0;
  await cloudHandlers.updateTestCaseSteps({
    test_case_key: 'QA-T1',
    steps: [{ description: 'Replace all' }],
    mode: 'OVERWRITE'
  });
  if (postedBodies[0].body.mode !== 'OVERWRITE') {
    throw new Error(`Expected mode=OVERWRITE, got ${postedBodies[0].body.mode}`);
  }

  // --- URL correctness ---
  postedBodies.length = 0;
  await cloudHandlers.updateTestCaseSteps({
    test_case_key: 'QA-T123',
    steps: [{ description: 'step' }]
  });
  if (!postedBodies[0].url.includes('QA-T123/teststeps')) {
    throw new Error(`Expected URL containing QA-T123/teststeps, got ${postedBodies[0].url}`);
  }

  // --- Step count in success message ---
  postedBodies.length = 0;
  const r2 = await cloudHandlers.updateTestCaseSteps({
    test_case_key: 'QA-T1',
    steps: [{ description: 'a' }, { description: 'b' }, { description: 'c' }]
  });
  if (!r2.content[0].text.includes('3')) {
    throw new Error(`Expected step count 3 in message: ${r2.content[0].text}`);
  }
}
```

Register in `runAllTests`:

```javascript
await this.runTest('update_test_case_steps Unit Tests', () => this.testUpdateTestCaseStepsUnit());
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit
```

Expected: FAIL — `dcHandlers.updateTestCaseSteps is not a function`

- [ ] **Step 3: Add `updateTestCaseSteps` to `src/tool-handlers.ts`**

Add immediately after the `getTestCaseSteps` method added in Task 2:

```typescript
  async updateTestCaseSteps(args: UpdateTestCaseStepsArgs) {
    if (this.jiraConfig.type === 'datacenter') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'update_test_case_steps is only supported on Zephyr Scale Cloud. The Data Center API (v1) does not provide a dedicated /teststeps endpoint.'
      );
    }

    const { test_case_key, steps, mode = 'APPEND' } = args;

    // Validate all steps before touching the API
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const hasInlineFields = step.description !== undefined || step.testData !== undefined || step.expectedResult !== undefined;
      const hasCallToTest = step.testCaseKey !== undefined;

      if (!hasInlineFields && !hasCallToTest) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Step at index ${i}: at least one of description or testCaseKey is required`
        );
      }
      if (hasCallToTest && hasInlineFields) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Step at index ${i}: testCaseKey and inline fields (description/testData/expectedResult) are mutually exclusive`
        );
      }
      if (!hasCallToTest && step.description === undefined) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Step at index ${i}: description is required for inline steps`
        );
      }
    }

    const items = steps.map((step) => {
      if (step.testCaseKey) {
        return { testCase: { testCaseKey: step.testCaseKey } };
      }
      return {
        inline: {
          description: step.description || '',
          testData: step.testData ?? null,
          expectedResult: step.expectedResult ?? null,
        },
      };
    });

    try {
      await this.axiosInstance.post(
        `${this.jiraConfig.apiEndpoints.testcase}/${test_case_key}/teststeps`,
        { mode, items }
      );
      return {
        content: [{
          type: 'text',
          text: `✅ Updated ${test_case_key} test steps successfully (mode: ${mode}, ${steps.length} step${steps.length === 1 ? '' : 's'} sent)`,
        }],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to update test case steps: ${this.formatError(error)}`);
    }
  }
```

- [ ] **Step 4: Wire up the switch case in `src/index.ts`**

Add after the `case 'get_test_case_steps':` line added in Task 2:

```typescript
          case 'update_test_case_steps':
            return await this.toolHandlers.updateTestCaseSteps(args as any);
```

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test:unit
```

Expected: `update_test_case_steps Unit Tests` — PASSED. All prior tests still PASSED.

- [ ] **Step 7: Commit**

```bash
git add src/tool-handlers.ts src/index.ts test/zephyr-server.test.cjs build/tool-handlers.js build/index.js
git commit -m "feat: add update_test_case_steps tool (Cloud only)"
```

---

### Task 4: README

**Files:**
- Modify: `README.md` (add two entries under Test Case Management)

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Add two tools to the README**

In `README.md`, find the `### Test Case Management` section. It currently ends with `update_test_case_bdd`. Add the two new entries after it:

```markdown
- `get_test_case_steps`: Get the STEP_BY_STEP test steps for a test case, with pagination. *(Cloud only)*
- `update_test_case_steps`: Append or overwrite STEP_BY_STEP test steps on an existing test case. Supports inline steps and call-to-test references. *(Cloud only)*
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add get_test_case_steps and update_test_case_steps to README"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `get_test_case_steps` Cloud only, DC throws InvalidRequest | Task 2 Step 3 handler + Task 2 Step 1 test |
| `start_at` min 0, default 0 | Task 1 Step 4 schema + Task 2 Step 3 handler |
| `max_results` min 1, max 100, default 100 | Task 1 Step 4 schema + Task 2 Step 3 handler |
| Out-of-range params rejected (not clamped) | Task 2 Step 3 handler + Task 2 Step 1 tests |
| Raw API response returned | Task 2 Step 3 handler |
| `update_test_case_steps` Cloud only, DC throws InvalidRequest | Task 3 Step 3 handler + Task 3 Step 1 test |
| Steps array required, `mode` defaults APPEND | Task 1 Step 4 schema + Task 3 Step 3 handler |
| Empty step rejected | Task 3 Step 3 validation + Task 3 Step 1 test |
| `testCaseKey` + inline fields mutually exclusive | Task 3 Step 3 validation + Task 3 Step 1 test |
| `description` required when `testCaseKey` absent | Task 3 Step 3 validation + Task 3 Step 1 test |
| `testCaseKey` maps to `{ testCase: { testCaseKey } }` | Task 3 Step 3 handler + Task 3 Step 1 test |
| Inline maps to `{ inline: { description, testData: null, expectedResult: null } }` | Task 3 Step 3 handler + Task 3 Step 1 test |
| README updated | Task 4 |

**Placeholder scan:** None found.

**Type consistency:** `GetTestCaseStepsArgs` and `UpdateTestCaseStepsArgs` defined in Task 1, imported in Task 2 handler alongside other args types. Method names `getTestCaseSteps`/`updateTestCaseSteps` consistent across handler, switch, and tests throughout.
