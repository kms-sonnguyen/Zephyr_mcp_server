const { spawn } = require('child_process');
const path = require('path');

/**
 * Test suite for Zephyr Scale MCP Server
 * Tests the MCP server functionality including tool execution and API integration
 */

class ZephyrServerTest {
  constructor() {
    this.serverPath = path.join(__dirname, '../build/index.js');
    this.testResults = [];
  }

  /**
   * Run a single test and capture result
   */
  async runTest(testName, testFunction) {
    console.log(`\n🧪 Running test: ${testName}`);
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      console.log(`✅ ${testName} - PASSED (${duration}ms)`);
      this.testResults.push({ name: testName, status: 'PASSED', duration });
    } catch (error) {
      console.log(`❌ ${testName} - FAILED: ${error.message}`);
      this.testResults.push({ name: testName, status: 'FAILED', error: error.message });
    }
  }

  /**
   * Test server startup and basic MCP protocol
   */
  async testServerStartup() {
    return new Promise((resolve, reject) => {
      // Check if we have the required environment variables for server startup
      const hasEnvVars = process.env.ZEPHYR_BASE_URL &&
                         (process.env.ZEPHYR_API_KEY || (process.env.JIRA_USERNAME && process.env.JIRA_API_TOKEN));

      if (!hasEnvVars) {
        console.log('Skipping server startup test - no environment variables configured');
        resolve(); // Skip this test if no env vars are set
        return;
      }

      const server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      server.stdout.on('data', (data) => {
        output += data.toString();
      });

      server.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Send MCP initialization request
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      };

      server.stdin.write(JSON.stringify(initRequest) + '\n');

      setTimeout(() => {
        server.kill();
        if (output.includes('jsonrpc') || output.includes('capabilities')) {
          resolve();
        } else {
          reject(new Error(`Server startup failed. Output: ${output}, Error: ${errorOutput}`));
        }
      }, 2000);
    });
  }

  /**
   * Test tools list capability
   */
  async testToolsList() {
    return new Promise((resolve, reject) => {
      // Check if we have the required environment variables for server startup
      const hasEnvVars = process.env.ZEPHYR_BASE_URL &&
                         (process.env.ZEPHYR_API_KEY || (process.env.JIRA_USERNAME && process.env.JIRA_API_TOKEN));

      if (!hasEnvVars) {
        console.log('Skipping tools list test - no environment variables configured');
        resolve(); // Skip this test if no env vars are set
        return;
      }

      const server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';

      server.stdout.on('data', (data) => {
        output += data.toString();
      });

      // Send tools list request
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      server.stdin.write(JSON.stringify(toolsRequest) + '\n');

      setTimeout(() => {
        server.kill();
        if (output.includes('get_test_case') && output.includes('create_test_case')) {
          resolve();
        } else {
          reject(new Error(`Tools list test failed. Expected tools not found in output: ${output}`));
        }
      }, 2000);
    });
  }

  /**
   * Test environment variables and configuration
   */
  async testEnvironmentConfig() {
    // For testing purposes, we'll check if environment variables are set
    // In a real scenario, these would be required, but for CI/testing we can be more lenient
    const envVars = [
      'ZEPHYR_API_KEY',
      'ZEPHYR_BASE_URL',
      'JIRA_USERNAME',
      'JIRA_API_TOKEN'
    ];

    const setVars = envVars.filter(varName => process.env[varName]);

    if (setVars.length === 0) {
      console.log('No Jira environment variables set - this is expected for unit tests');
      return; // Skip detailed validation if no vars are set
    }

    // If some vars are set, validate them
    for (const varName of setVars) {
      const value = process.env[varName];
      if (!value || value.length < 3) {
        throw new Error(`${varName} appears to be invalid or too short`);
      }
    }

    // Additional validation for URL format if base URL is set
    if (process.env.ZEPHYR_BASE_URL) {
      const baseUrl = process.env.ZEPHYR_BASE_URL;
      if (!baseUrl.startsWith('http')) {
        throw new Error('ZEPHYR_BASE_URL must start with http:// or https://');
      }
    }
  }

  /**
   * Test build artifacts
   */
  async testBuildArtifacts() {
    const fs = require('fs');
    const requiredFiles = [
      'build/index.js',
      'build/tool-handlers.js',
      'build/tool-schemas.js',
      'build/types.js',
      'build/utils.js'
    ];

    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(__dirname, '..', file))) {
        throw new Error(`Required build file missing: ${file}`);
      }
    }

    // Check if main file is executable
    const mainFile = path.join(__dirname, '../build/index.js');
    const stats = fs.statSync(mainFile);
    if (!(stats.mode & parseInt('111', 8))) {
      throw new Error('Main build file is not executable');
    }
  }

  /**
   * Test package.json configuration
   */
  async testPackageConfig() {
    const fs = require('fs');
    const packagePath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    // Check required fields
    const requiredFields = ['name', 'version', 'main', 'bin'];
    for (const field of requiredFields) {
      if (!packageJson[field]) {
        throw new Error(`Missing required package.json field: ${field}`);
      }
    }

    // Check scripts
    if (!packageJson.scripts || !packageJson.scripts.build) {
      throw new Error('Missing build script in package.json');
    }

    // Check dependencies
    if (!packageJson.dependencies || !packageJson.dependencies['@modelcontextprotocol/sdk']) {
      throw new Error('Missing required MCP SDK dependency');
    }
  }

  /**
   * Test schema contains new tools
   */
  async testSchemaContainsNewTools() {
    const fs = require('fs');
    const content = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    const tools = [
      { name: 'get_test_case_steps', pattern: "name: 'get_test_case_steps'" },
      { name: 'update_test_case_steps', pattern: "name: 'update_test_case_steps'" },
      { name: 'search_test_cases', pattern: "name: 'search_test_cases'" }
    ];
    for (const tool of tools) {
      if (!content.includes(tool.pattern)) {
        throw new Error(`'${tool.name}' not found in built tool-schemas.js`);
      }
    }
  }

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

    // Validation: empty steps array
    try {
      await cloudHandlers.updateTestCaseSteps({ test_case_key: 'QA-T1', steps: [] });
      throw new Error('Expected McpError for empty steps array');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for empty steps array, got: ${e.message}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_projects: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_projects'");
    if (!indexContent.includes('getProjects(args')) throw new Error('build/dispatch.js does not call toolHandlers.getProjects(...)');
  }

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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_statuses: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_statuses'");
    if (!indexContent.includes('getStatuses(args')) throw new Error('build/dispatch.js does not call toolHandlers.getStatuses(...)');
  }

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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_priorities: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_priorities'");
    if (!indexContent.includes('getPriorities(args')) throw new Error('build/dispatch.js does not call toolHandlers.getPriorities(...)');
  }

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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_environments: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_environments'");
    if (!indexContent.includes('getEnvironments(args')) throw new Error('build/dispatch.js does not call toolHandlers.getEnvironments(...)');
  }

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

    // --- max_results limits matches, not raw fetch (multi-page scenario) ---
    // This verifies the loop continues pagination even when max_results is reached
    const multiPageRequests = [];
    const multiPageAxios = {
      get: async (url, config) => {
        multiPageRequests.push({ url, params: config && config.params });
        const startAt = config.params.startAt;
        const pageSize = config.params.maxResults;

        // Page 1: exactly 1000 items (matching pageSize), contains 2 matches for "login"
        if (startAt === 0) {
          const page = [];
          page.push({ key: 'PROJ-T1-0', name: 'First Login Case' });
          page.push({ key: 'PROJ-T1-1', name: 'Non-matching' });
          page.push({ key: 'PROJ-T1-2', name: 'Admin LOGIN Check' });
          for (let i = 3; i < 1000; i++) {
            page.push({ key: `PROJ-T1-${i}`, name: `Non-matching item ${i}` });
          }
          return { data: { values: page, isLast: false } };
        }

        // Page 2: 500 items, contains 1 more match for "login"
        if (startAt === 1000) {
          const page = [];
          page.push({ key: 'PROJ-T2-0', name: 'Login Reset Flow' });
          for (let i = 1; i < 500; i++) {
            page.push({ key: `PROJ-T2-${i}`, name: `Non-matching item ${i}` });
          }
          return { data: { values: page, isLast: true } };
        }

        throw new Error(`Unexpected startAt: ${startAt}`);
      },
    };

    const multiPageHandlers = new ZephyrToolHandlers(multiPageAxios, cloudConfig);
    const limitedResult = await multiPageHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'login', max_results: 1 });
    const limitedPayload = JSON.parse(limitedResult.content[0].text.split('\n').slice(1).join('\n'));
    if (limitedPayload.totalCount !== 1) throw new Error(`Expected totalCount=1 with max_results=1, got ${limitedPayload.totalCount}`);
    if (limitedPayload.totalScanned !== 1500) throw new Error(`Expected totalScanned=1500 (both pages), got ${limitedPayload.totalScanned}`);
    if (multiPageRequests.length !== 2) throw new Error(`Expected 2 page requests (proving loop continued despite max_results), got ${multiPageRequests.length}`);

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
    // Mix matching and non-matching items so testCases.length != matches.length
    // This catches regressions where implementation uses matches.length instead of testCases.length
    const cappedResults = [];
    for (let i = 0; i < 5000; i++) {
      // 3000 items match "item", 2000 items don't match
      cappedResults.push({
        key: `PROJ-T${i}`,
        name: i < 3000 ? `Item ${i}` : `Other ${i}`
      });
    }
    const cappedAxios = { get: async () => ({ data: { results: cappedResults } }) };
    const cappedHandlers = new ZephyrToolHandlers(cappedAxios, dcConfig);
    const cappedResult = await cappedHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'item', max_results: 5000 });
    const cappedPayload = JSON.parse(cappedResult.content[0].text.split('\n').slice(1).join('\n'));
    if (cappedPayload.truncated !== true) throw new Error(`Expected truncated=true at 5000 scanned, got ${cappedPayload.truncated}`);
    if (cappedPayload.totalScanned !== 5000) throw new Error(`Expected totalScanned=5000 (got ${cappedPayload.totalScanned}), truncated=${cappedPayload.truncated}, totalCount=${cappedPayload.totalCount}`);
    if (cappedPayload.totalCount !== 3000) throw new Error(`Expected totalCount=3000 (filtered matches), got ${cappedPayload.totalCount} (scanned=${cappedPayload.totalScanned}, truncated=${cappedPayload.truncated})`);

    // --- Not truncated below the cap ---
    // Mix matching and non-matching to ensure flag is based on scanned count, not match count
    const smallResults = [];
    for (let i = 0; i < 100; i++) {
      smallResults.push({
        key: `PROJ-T${i}`,
        name: i < 50 ? `Item ${i}` : `Other ${i}`
      });
    }
    const smallAxios = { get: async () => ({ data: { results: smallResults } }) };
    const smallHandlers = new ZephyrToolHandlers(smallAxios, dcConfig);
    const smallResult = await smallHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'item' });
    const smallPayload = JSON.parse(smallResult.content[0].text.split('\n').slice(1).join('\n'));
    if (smallPayload.truncated !== false) throw new Error(`Expected truncated=false below cap, got ${smallPayload.truncated}`);
    if (smallPayload.totalScanned !== 100) throw new Error(`Expected totalScanned=100, got ${smallPayload.totalScanned}`);
    if (smallPayload.totalCount !== 50) throw new Error(`Expected totalCount=50 (filtered matches), got ${smallPayload.totalCount}`);

    // --- max_results limits matches ---
    const limitedResult = await basicHandlers.searchTestCases({ project_key: 'PROJ', name_contains: 'login', max_results: 1 });
    const limitedPayload = JSON.parse(limitedResult.content[0].text.split('\n').slice(1).join('\n'));
    if (limitedPayload.totalCount !== 1) throw new Error(`Expected totalCount=1 with max_results=1, got ${limitedPayload.totalCount}`);
  }

  async testIndexDispatchesSearchTestCases() {
    const { createToolDispatch } = await import('../build/dispatch.js');
    const calls = [];
    const fakeHandlers = { searchTestCases: async (args) => { calls.push(args); return { content: [] }; } };
    const dispatch = createToolDispatch(fakeHandlers);
    await dispatch.search_test_cases({ project_key: 'QA' });
    if (calls.length !== 1 || calls[0].project_key !== 'QA') {
      throw new Error("dispatch 'search_test_cases' does not call handlers.searchTestCases(args)");
    }
    const fs = require('fs');
    const index = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!index.includes('createToolDispatch(')) throw new Error('build/index.js does not use createToolDispatch');
  }

  async testDispatchCoversAllSchemas() {
    const { createToolDispatch } = await import('../build/dispatch.js');
    const { toolSchemas } = await import('../build/tool-schemas.js');
    const dispatch = createToolDispatch({});
    const names = toolSchemas.map((t) => t.name);
    const missing = names.filter((n) => !dispatch[n]);
    const extra = Object.keys(dispatch).filter((n) => !names.includes(n));
    if (missing.length || extra.length) {
      throw new Error(`dispatch/schema mismatch — missing: ${missing.join(',') || 'none'}; extra: ${extra.join(',') || 'none'}`);
    }
  }

  /**
   * Runs the bundled skill CLI with a scrubbed env so no live API is ever hit.
   */
  /**
   * Copies the built skill to a temp dir and returns its root. Tests never run the
   * in-repo copy: a developer's real skills/zephyr-scale/.env would otherwise be
   * picked up (and could hit the live API), and env-file tests would clobber it.
   */
  makeSkillCopy() {
    const fs = require('fs');
    const os = require('os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zephyr-skill-'));
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(
      path.join(__dirname, '../skills/zephyr-scale/scripts/zephyr.mjs'),
      path.join(root, 'scripts', 'zephyr.mjs')
    );
    return root;
  }

  runCli(args, { env = {}, stdin, skillRoot } = {}) {
    const { spawnSync } = require('child_process');
    if (!skillRoot && !this.sharedSkillRoot) this.sharedSkillRoot = this.makeSkillCopy();
    const cli = path.join(skillRoot || this.sharedSkillRoot, 'scripts', 'zephyr.mjs');
    const cleanEnv = { PATH: process.env.PATH, ...env };
    return spawnSync(process.execPath, [cli, ...args], { env: cleanEnv, input: stdin ?? '', encoding: 'utf8' });
  }

  async testSkillCli() {
    const { toolSchemas } = await import('../build/tool-schemas.js');

    const list = this.runCli(['list']);
    if (list.status !== 0) throw new Error(`list exited ${list.status}: ${list.stderr}`);
    const listed = list.stdout.trim().split('\n').map((l) => l.split('\t')[0]);
    if (listed.length !== toolSchemas.length) {
      throw new Error(`list printed ${listed.length} tools, expected ${toolSchemas.length}`);
    }

    const help = this.runCli(['help', 'get_test_case']);
    if (help.status !== 0 || JSON.parse(help.stdout).name !== 'get_test_case') {
      throw new Error(`help get_test_case failed: ${help.stderr}`);
    }

    const unknown = this.runCli(['no_such_tool', '{}']);
    if (unknown.status !== 2 || !unknown.stderr.includes('Unknown tool')) {
      throw new Error(`unknown tool should exit 2, got ${unknown.status}: ${unknown.stderr}`);
    }

    const missingArg = this.runCli(['get_test_case', '{}']);
    if (missingArg.status !== 2 || !missingArg.stderr.includes('test_case_key')) {
      throw new Error(`missing required arg should exit 2, got ${missingArg.status}: ${missingArg.stderr}`);
    }

    const badJson = this.runCli(['get_test_case', '{not json']);
    if (badJson.status !== 2 || !badJson.stderr.includes('Invalid JSON')) {
      throw new Error(`invalid JSON should exit 2, got ${badJson.status}: ${badJson.stderr}`);
    }

    // Args on stdin pass validation; with no env the next failure is configuration.
    const noEnv = this.runCli(['get_test_case'], { stdin: '{"test_case_key":"QA-T1"}' });
    if (noEnv.status !== 2 || !noEnv.stderr.includes('ZEPHYR_BASE_URL')) {
      throw new Error(`missing env should exit 2 naming ZEPHYR_BASE_URL, got ${noEnv.status}: ${noEnv.stderr}`);
    }

    // Handler-level McpError surfaces as exit 1 without the "MCP error <code>:" prefix.
    const dcGated = this.runCli(['get_projects', '{}'], {
      env: { ZEPHYR_BASE_URL: 'https://jira.example.invalid', ZEPHYR_API_KEY: 'x' },
    });
    if (dcGated.status !== 1 || !dcGated.stderr.includes('only supported on Zephyr Scale Cloud') || dcGated.stderr.includes('MCP error')) {
      throw new Error(`DC-gated tool should exit 1 with clean message, got ${dcGated.status}: ${dcGated.stderr}`);
    }
  }

  async testSkillCliEnvFile() {
    const fs = require('fs');
    const os = require('os');
    const skill = this.makeSkillCopy();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zephyr-env-'));
    const run = (args, opts = {}) => this.runCli(args, { ...opts, skillRoot: skill });
    try {
      // Default location: .env in the skill folder (next to SKILL.md), Windows-Notepad
      // style — BOM, CRLF, inline comment, quoted value, blank value.
      fs.writeFileSync(
        path.join(skill, '.env'),
        '\uFEFF# comment\r\nZEPHYR_BASE_URL=https://jira.example.invalid   # DC\r\nexport ZEPHYR_API_KEY="abc123secretXYZ9"\r\nJIRA_TYPE=\r\n'
      );

      const config = run(['config']);
      if (config.status !== 0) throw new Error(`config exited ${config.status}: ${config.stderr}`);
      if (!config.stdout.includes(`${path.join(skill, '.env')} (found)`)) {
        throw new Error(`config did not find skill-folder .env:\n${config.stdout}`);
      }
      if (!config.stdout.includes('ZEPHYR_BASE_URL: https://jira.example.invalid [from env file]')) {
        throw new Error(`inline comment not stripped or source wrong:\n${config.stdout}`);
      }
      if (config.stdout.includes('abc123secret') || !config.stdout.includes('********XYZ9')) {
        throw new Error(`API key not masked:\n${config.stdout}`);
      }

      if (config.stdout.includes('PLACEHOLDER')) throw new Error(`real values flagged as placeholder:\n${config.stdout}`);
      const example = fs.readFileSync(path.join(__dirname, '../skills/zephyr-scale/.env.example'), 'utf8');
      const fromExample = path.join(tmp, 'example.env');
      fs.writeFileSync(fromExample, example.replace(/^# (JIRA_USERNAME|JIRA_API_TOKEN)=/gm, '$1='));
      const unedited = run(['config'], { env: { ZEPHYR_ENV_FILE: fromExample } });
      const flagged = unedited.stdout.split('\n').filter((l) => l.includes('PLACEHOLDER')).length;
      if (flagged !== 4) throw new Error(`expected 4 placeholder flags for unedited template, got ${flagged}:\n${unedited.stdout}`);

      // Values from the file reach the tool: DC URL => DC-gated error, not a config error.
      const fromFile = run(['get_projects', '{}']);
      if (fromFile.status !== 1 || !fromFile.stderr.includes('only supported on Zephyr Scale Cloud')) {
        throw new Error(`env file values not applied, got ${fromFile.status}: ${fromFile.stderr}`);
      }

      // Real environment wins over the file.
      const override = run(['config'], { env: { ZEPHYR_BASE_URL: 'https://x.atlassian.net' } });
      if (!override.stdout.includes('ZEPHYR_BASE_URL: https://x.atlassian.net [from environment]')) {
        throw new Error(`environment should override env file:\n${override.stdout}`);
      }

      // ZEPHYR_ENV_FILE selects another file; a missing one is a config error.
      const custom = path.join(tmp, 'custom.env');
      fs.writeFileSync(custom, "ZEPHYR_BASE_URL='https://custom.example.invalid'\nZEPHYR_API_KEY=k\n");
      const viaVar = run(['config'], { env: { ZEPHYR_ENV_FILE: custom } });
      if (!viaVar.stdout.includes('ZEPHYR_BASE_URL: https://custom.example.invalid [from env file]')) {
        throw new Error(`ZEPHYR_ENV_FILE not honoured:\n${viaVar.stdout}${viaVar.stderr}`);
      }
      const missing = run(['config'], { env: { ZEPHYR_ENV_FILE: path.join(tmp, 'nope.env') } });
      if (missing.status !== 2 || !missing.stderr.includes('does not exist')) {
        throw new Error(`missing ZEPHYR_ENV_FILE should exit 2, got ${missing.status}: ${missing.stderr}`);
      }

      // @file arguments (BOM tolerated) — the PowerShell-safe way to pass JSON.
      const argsFile = path.join(tmp, 'args.json');
      fs.writeFileSync(argsFile, '\uFEFF{"project_key_or_id":"QA"}');
      const atFile = run(['get_projects', `@${argsFile}`]);
      if (atFile.status !== 1 || !atFile.stderr.includes('only supported on Zephyr Scale Cloud')) {
        throw new Error(`@file args not accepted, got ${atFile.status}: ${atFile.stderr}`);
      }
      const atMissing = run(['get_projects', `@${path.join(tmp, 'nope.json')}`]);
      if (atMissing.status !== 2 || !atMissing.stderr.includes('Cannot read arguments file')) {
        throw new Error(`missing @file should exit 2, got ${atMissing.status}: ${atMissing.stderr}`);
      }

      // No .env at all: the config error names where the file should go.
      fs.rmSync(path.join(skill, '.env'));
      const none = run(['get_test_case', '{"test_case_key":"QA-T1"}']);
      if (none.status !== 2 || !none.stderr.includes(path.join(skill, '.env'))) {
        throw new Error(`missing config should name the skill .env path, got ${none.status}: ${none.stderr}`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(skill, { recursive: true, force: true });
    }
  }

  async testServerLoadsEnvFile() {
    const fs = require('fs');
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zephyr-srv-'));
    const envPath = path.join(tmp, 'zephyr.env');
    fs.writeFileSync(envPath, 'ZEPHYR_BASE_URL=https://jira.example.invalid\nZEPHYR_API_KEY=k\n');
    try {
      const out = await new Promise((resolve, reject) => {
        // Only ZEPHYR_ENV_FILE is set: without the .env fallback the server throws at startup.
        const child = spawn(process.execPath, [this.serverPath], {
          env: { PATH: process.env.PATH, ZEPHYR_ENV_FILE: envPath },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => { child.kill(); reject(new Error(`no tools/list reply; stderr: ${stderr}`)); }, 5000);
        child.stdout.on('data', (d) => {
          stdout += d;
          if (stdout.includes('"id":2')) { clearTimeout(timer); child.kill(); resolve({ stdout, stderr }); }
        });
        child.stderr.on('data', (d) => { stderr += d; });
        child.on('exit', (code) => { if (!stdout.includes('"id":2')) { clearTimeout(timer); reject(new Error(`server exited ${code}: ${stderr}`)); } });
        const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');
        send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      });
      const reply = out.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((m) => m.id === 2);
      if (!reply?.result?.tools?.length) throw new Error(`tools/list returned no tools: ${out.stdout}`);
      if (!out.stderr.includes(`loaded settings from ${envPath}`)) throw new Error(`env file not reported: ${out.stderr}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  async testSkillReferenceUpToDate() {
    const fs = require('fs');
    const { toolSchemas } = await import('../build/tool-schemas.js');
    const ref = fs.readFileSync(path.join(__dirname, '../skills/zephyr-scale/references/tools.md'), 'utf8');
    const missing = toolSchemas.map((t) => t.name).filter((n) => !ref.includes(`## ${n}\n`));
    if (missing.length) throw new Error(`references/tools.md is stale (run npm run build): ${missing.join(', ')}`);
  }

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
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'get_test_script'")) throw new Error("'get_test_script' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_test_script: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_test_script'");
    if (!indexContent.includes('getTestScript(args')) throw new Error('build/dispatch.js does not call toolHandlers.getTestScript(...)');
  }

  async testGetTestCaseLinksUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testcase: '/rest/atm/1.0/testcase' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestCaseLinks({ test_case_key: 'QA-T1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_test_case_links: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_test_case_links'");
    if (!indexContent.includes('getTestCaseLinks(args')) throw new Error('build/dispatch.js does not call toolHandlers.getTestCaseLinks(...)');
  }

  async testCreateTestCaseWebLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testcase: '/rest/atm/1.0/testcase' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestCaseWebLink({ test_case_key: 'QA-T1', url: 'https://example.com' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`create_test_case_web_link: (args)`)) throw new Error("build/dispatch.js does not dispatch 'create_test_case_web_link'");
    if (!indexContent.includes('createTestCaseWebLink(args')) throw new Error('build/dispatch.js does not call toolHandlers.createTestCaseWebLink(...)');
  }

  async testCreateTestCaseIssueLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testcase: '/rest/atm/1.0/testcase' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestCaseIssueLink({ test_case_key: 'QA-T1', issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`create_test_case_issue_link: (args)`)) throw new Error("build/dispatch.js does not dispatch 'create_test_case_issue_link'");
    if (!indexContent.includes('createTestCaseIssueLink(args')) throw new Error('build/dispatch.js does not call toolHandlers.createTestCaseIssueLink(...)');
  }

  async testGetTestCasesLinkedToIssueUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestCasesLinkedToIssue({ issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_test_cases_linked_to_issue: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_test_cases_linked_to_issue'");
    if (!indexContent.includes('getTestCasesLinkedToIssue(args')) throw new Error('build/dispatch.js does not call toolHandlers.getTestCasesLinkedToIssue(...)');
  }

  async testGetTestCycleLinksUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testrun: '/rest/atm/1.0/testrun' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestCycleLinks({ test_run_key: 'QA-R1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_test_cycle_links: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_test_cycle_links'");
    if (!indexContent.includes('getTestCycleLinks(args')) throw new Error('build/dispatch.js does not call toolHandlers.getTestCycleLinks(...)');
  }

  async testCreateTestCycleWebLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testrun: '/rest/atm/1.0/testrun' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestCycleWebLink({ test_run_key: 'QA-R1', url: 'https://example.com' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`create_test_cycle_web_link: (args)`)) throw new Error("build/dispatch.js does not dispatch 'create_test_cycle_web_link'");
    if (!indexContent.includes('createTestCycleWebLink(args')) throw new Error('build/dispatch.js does not call toolHandlers.createTestCycleWebLink(...)');
  }

  async testCreateTestCycleIssueLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: { testrun: '/rest/atm/1.0/testrun' } };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestCycleIssueLink({ test_run_key: 'QA-R1', issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`create_test_cycle_issue_link: (args)`)) throw new Error("build/dispatch.js does not dispatch 'create_test_cycle_issue_link'");
    if (!indexContent.includes('createTestCycleIssueLink(args')) throw new Error('build/dispatch.js does not call toolHandlers.createTestCycleIssueLink(...)');
  }

  async testGetTestExecutionLinksUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestExecutionLinks({ execution_id: '5805255' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_test_execution_links: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_test_execution_links'");
    if (!indexContent.includes('getTestExecutionLinks(args')) throw new Error('build/dispatch.js does not call toolHandlers.getTestExecutionLinks(...)');
  }

  async testCreateTestExecutionIssueLinkUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.createTestExecutionIssueLink({ execution_id: '5805255', issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`create_test_execution_issue_link: (args)`)) throw new Error("build/dispatch.js does not dispatch 'create_test_execution_issue_link'");
    if (!indexContent.includes('createTestExecutionIssueLink(args')) throw new Error('build/dispatch.js does not call toolHandlers.createTestExecutionIssueLink(...)');
  }

  async testGetTestExecutionsLinkedToIssueUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');

    // --- DC rejection ---
    const dcConfig = { type: 'datacenter', apiEndpoints: {} };
    const dcHandlers = new ZephyrToolHandlers({}, dcConfig);
    try {
      await dcHandlers.getTestExecutionsLinkedToIssue({ issue_key: 'QA-1' });
      throw new Error('Expected McpError for datacenter');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for DC rejection, got: ${e.message}`);
      if (e.code !== ErrorCode.InvalidRequest) throw new Error(`Expected ErrorCode.InvalidRequest for DC rejection, got: ${e.code}`);
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`get_test_executions_linked_to_issue: (args)`)) throw new Error("build/dispatch.js does not dispatch 'get_test_executions_linked_to_issue'");
    if (!indexContent.includes('getTestExecutionsLinkedToIssue(args')) throw new Error('build/dispatch.js does not call toolHandlers.getTestExecutionsLinkedToIssue(...)');
  }

  async testUpdateTestCaseCustomFieldsUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');

    // --- Cloud: merges given custom_fields into existing customFields, preserves the rest ---
    const cloudConfig = {
      type: 'cloud',
      apiEndpoints: { testcase: 'https://api.zephyrscale.smartbear.com/v2/testcases' }
    };
    const cloudPuts = [];
    const cloudMockAxios = {
      get: async (url) => {
        return {
          data: {
            id: 42,
            name: 'Existing test case',
            status: { id: 1, name: 'Draft' },
            priority: { id: 2, name: 'Normal' },
            project: { id: 100 },
            labels: ['smoke'],
            customFields: { Type: 'Functional', Regression: false, 'Risk Control': false },
          },
        };
      },
      put: async (url, body) => {
        cloudPuts.push({ url, body });
        return { data: {} };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(cloudMockAxios, cloudConfig);
    const cloudResult = await cloudHandlers.updateTestCaseCustomFields({
      test_case_key: 'PROJ-T1',
      custom_fields: { 'Risk Control': true },
    });
    if (cloudPuts.length !== 1) throw new Error(`Expected 1 PUT, got ${cloudPuts.length}`);
    if (cloudPuts[0].url !== 'https://api.zephyrscale.smartbear.com/v2/testcases/PROJ-T1') {
      throw new Error(`Unexpected PUT url: ${cloudPuts[0].url}`);
    }
    const cloudCustomFields = cloudPuts[0].body.customFields;
    if (cloudCustomFields['Risk Control'] !== true) throw new Error('Expected Risk Control to be updated to true');
    if (cloudCustomFields.Type !== 'Functional') throw new Error('Expected untouched Type field to be preserved');
    if (cloudCustomFields.Regression !== false) throw new Error('Expected untouched Regression field to be preserved');
    if (cloudPuts[0].body.name !== 'Existing test case') throw new Error('Expected name to be preserved in PUT payload');
    if (!Array.isArray(cloudPuts[0].body.labels) || cloudPuts[0].body.labels[0] !== 'smoke') {
      throw new Error('Expected labels to be preserved in PUT payload');
    }
    if (!cloudResult.content[0].text.includes('PROJ-T1')) throw new Error('Expected test case key in success message');

    // --- Data Center: merges custom_fields, preserves testScript to avoid wiping it via full-replace PUT ---
    const dcConfig = {
      type: 'datacenter',
      apiEndpoints: { testcase: 'http://dc.example.com/rest/atm/1.0/testcase' }
    };
    const dcPuts = [];
    const dcMockAxios = {
      get: async (url) => {
        return {
          data: {
            projectKey: 'PROJ',
            name: 'Existing DC test case',
            status: 'Draft',
            priority: 'Normal',
            labels: ['regression'],
            customFields: { Type: 'Functional', 'Risk Control': false },
            testScript: { type: 'PLAIN_TEXT', text: 'Do the thing' },
          },
        };
      },
      put: async (url, body) => {
        dcPuts.push({ url, body });
        return { status: 200, data: {} };
      },
    };
    const dcHandlers = new ZephyrToolHandlers(dcMockAxios, dcConfig);
    const dcResult = await dcHandlers.updateTestCaseCustomFields({
      test_case_key: 'PROJ-T2',
      custom_fields: { 'Risk Control': true },
    });
    if (dcPuts.length !== 1) throw new Error(`Expected 1 PUT, got ${dcPuts.length}`);
    const dcCustomFields = dcPuts[0].body.customFields;
    if (dcCustomFields['Risk Control'] !== true) throw new Error('Expected Risk Control to be updated to true');
    if (dcCustomFields.Type !== 'Functional') throw new Error('Expected untouched Type field to be preserved');
    if (!dcPuts[0].body.testScript || dcPuts[0].body.testScript.text !== 'Do the thing') {
      throw new Error('Expected existing testScript to be preserved on DC full-replace PUT');
    }
    if (dcPuts[0].body.projectKey !== 'PROJ') throw new Error('Expected projectKey in DC PUT payload');
    if (!dcResult.content[0].text.includes('PROJ-T2')) throw new Error('Expected test case key in success message');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'update_test_case_custom_fields'")) throw new Error("'update_test_case_custom_fields' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`update_test_case_custom_fields: (args)`)) throw new Error("build/dispatch.js does not dispatch 'update_test_case_custom_fields'");
    if (!indexContent.includes('updateTestCaseCustomFields(args')) throw new Error('build/dispatch.js does not call toolHandlers.updateTestCaseCustomFields(...)');
  }

  async testMoveTestCaseFolderUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- Cloud: resolves destination path to folderId, preserves other fields ---
    const cloudConfig = {
      type: 'cloud',
      apiEndpoints: { testcase: 'https://api.zephyrscale.smartbear.com/v2/testcases' }
    };
    const cloudPuts = [];
    const cloudMockAxios = {
      get: async (url, config) => {
        if (url === '/folders') {
          return { data: { values: [{ id: 55, parentId: null, name: 'Target' }], isLast: true } };
        }
        return {
          data: {
            id: 42,
            name: 'Existing test case',
            status: { id: 1, name: 'Draft' },
            priority: { id: 2, name: 'Normal' },
            project: { id: 100 },
            labels: ['smoke'],
            customFields: { Type: 'Functional' },
          },
        };
      },
      put: async (url, body) => {
        cloudPuts.push({ url, body });
        return { data: {} };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(cloudMockAxios, cloudConfig);
    const cloudResult = await cloudHandlers.moveTestCaseFolder({
      test_case_key: 'PROJ-T1',
      folder: '/Target',
    });
    if (cloudPuts.length !== 1) throw new Error(`Expected 1 PUT, got ${cloudPuts.length}`);
    if (cloudPuts[0].body.folderId !== 55) throw new Error(`Expected folderId 55 in PUT payload, got ${cloudPuts[0].body.folderId}`);
    if (cloudPuts[0].body.name !== 'Existing test case') throw new Error('Expected name to be preserved in PUT payload');
    if (!Array.isArray(cloudPuts[0].body.labels) || cloudPuts[0].body.labels[0] !== 'smoke') {
      throw new Error('Expected labels to be preserved in PUT payload');
    }
    if (cloudPuts[0].body.customFields.Type !== 'Functional') throw new Error('Expected customFields to be preserved in PUT payload');
    if (!cloudResult.content[0].text.includes('PROJ-T1')) throw new Error('Expected test case key in success message');
    if (!cloudResult.content[0].text.includes('/Target')) throw new Error('Expected destination folder in success message');

    // --- Cloud: destination folder not found raises McpError, no PUT issued ---
    const cloudMissingFolderAxios = {
      get: async (url) => {
        if (url === '/folders') return { data: { values: [], isLast: true } };
        return { data: { id: 42, name: 'Existing test case', status: {}, priority: {}, project: {} } };
      },
      put: async () => { throw new Error('PUT should not be called when folder is not found'); },
    };
    const cloudMissingFolderHandlers = new ZephyrToolHandlers(cloudMissingFolderAxios, cloudConfig);
    try {
      await cloudMissingFolderHandlers.moveTestCaseFolder({ test_case_key: 'PROJ-T1', folder: '/Nope' });
      throw new Error('Expected McpError for missing destination folder');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for missing folder, got: ${e.message}`);
    }

    // --- Data Center: sends full path string, preserves testScript on full-replace PUT ---
    const dcConfig = {
      type: 'datacenter',
      apiEndpoints: { testcase: 'http://dc.example.com/rest/atm/1.0/testcase' }
    };
    const dcPuts = [];
    const dcMockAxios = {
      get: async (url) => {
        return {
          data: {
            projectKey: 'PROJ',
            name: 'Existing DC test case',
            status: 'Draft',
            priority: 'Normal',
            labels: ['regression'],
            customFields: { Type: 'Functional' },
            testScript: { type: 'PLAIN_TEXT', text: 'Do the thing' },
          },
        };
      },
      put: async (url, body) => {
        dcPuts.push({ url, body });
        return { status: 200, data: {} };
      },
    };
    const dcHandlers = new ZephyrToolHandlers(dcMockAxios, dcConfig);
    const dcResult = await dcHandlers.moveTestCaseFolder({
      test_case_key: 'PROJ-T2',
      folder: '/Parent/Child',
    });
    if (dcPuts.length !== 1) throw new Error(`Expected 1 PUT, got ${dcPuts.length}`);
    if (dcPuts[0].body.folder !== '/Parent/Child') throw new Error(`Expected folder '/Parent/Child' in PUT payload, got ${dcPuts[0].body.folder}`);
    if (!dcPuts[0].body.testScript || dcPuts[0].body.testScript.text !== 'Do the thing') {
      throw new Error('Expected existing testScript to be preserved on DC full-replace PUT');
    }
    if (dcPuts[0].body.projectKey !== 'PROJ') throw new Error('Expected projectKey in DC PUT payload');
    if (!dcResult.content[0].text.includes('PROJ-T2')) throw new Error('Expected test case key in success message');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'move_test_case_folder'")) throw new Error("'move_test_case_folder' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`move_test_case_folder: (args)`)) throw new Error("build/dispatch.js does not dispatch 'move_test_case_folder'");
    if (!indexContent.includes('moveTestCaseFolder(args')) throw new Error('build/dispatch.js does not call toolHandlers.moveTestCaseFolder(...)');
  }

  async testUpdateTestCaseNameUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- Cloud: renames test case, preserves other fields ---
    const cloudConfig = {
      type: 'cloud',
      apiEndpoints: { testcase: 'https://api.zephyrscale.smartbear.com/v2/testcases' }
    };
    const cloudPuts = [];
    const cloudMockAxios = {
      get: async () => {
        return {
          data: {
            id: 42,
            name: 'Old name',
            status: { id: 1, name: 'Draft' },
            priority: { id: 2, name: 'Normal' },
            project: { id: 100 },
            folder: { id: 55, name: 'Target' },
            labels: ['smoke'],
            customFields: { Type: 'Functional' },
          },
        };
      },
      put: async (url, body) => {
        cloudPuts.push({ url, body });
        return { data: {} };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(cloudMockAxios, cloudConfig);
    const cloudResult = await cloudHandlers.updateTestCaseName({
      test_case_key: 'PROJ-T1',
      name: 'New name',
    });
    if (cloudPuts.length !== 1) throw new Error(`Expected 1 PUT, got ${cloudPuts.length}`);
    if (cloudPuts[0].body.name !== 'New name') throw new Error(`Expected name 'New name' in PUT payload, got ${cloudPuts[0].body.name}`);
    if (cloudPuts[0].body.folderId !== 55) throw new Error(`Expected folderId 55 to be preserved in PUT payload, got ${cloudPuts[0].body.folderId}`);
    if (!Array.isArray(cloudPuts[0].body.labels) || cloudPuts[0].body.labels[0] !== 'smoke') {
      throw new Error('Expected labels to be preserved in PUT payload');
    }
    if (cloudPuts[0].body.customFields.Type !== 'Functional') throw new Error('Expected customFields to be preserved in PUT payload');
    if (!cloudResult.content[0].text.includes('PROJ-T1')) throw new Error('Expected test case key in success message');
    if (!cloudResult.content[0].text.includes('New name')) throw new Error('Expected new name in success message');

    // --- Cloud: empty name raises McpError, no PUT issued ---
    const cloudEmptyNameHandlers = new ZephyrToolHandlers({
      get: async () => { throw new Error('GET should not be called when name is empty'); },
      put: async () => { throw new Error('PUT should not be called when name is empty'); },
    }, cloudConfig);
    try {
      await cloudEmptyNameHandlers.updateTestCaseName({ test_case_key: 'PROJ-T1', name: '   ' });
      throw new Error('Expected McpError for empty name');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for empty name, got: ${e.message}`);
    }

    // --- Data Center: renames test case, preserves testScript on full-replace PUT ---
    const dcConfig = {
      type: 'datacenter',
      apiEndpoints: { testcase: 'http://dc.example.com/rest/atm/1.0/testcase' }
    };
    const dcPuts = [];
    const dcMockAxios = {
      get: async () => {
        return {
          data: {
            projectKey: 'PROJ',
            name: 'Old DC name',
            status: 'Draft',
            priority: 'Normal',
            folder: '/Parent/Child',
            labels: ['regression'],
            customFields: { Type: 'Functional' },
            testScript: { type: 'PLAIN_TEXT', text: 'Do the thing' },
          },
        };
      },
      put: async (url, body) => {
        dcPuts.push({ url, body });
        return { status: 200, data: {} };
      },
    };
    const dcHandlers = new ZephyrToolHandlers(dcMockAxios, dcConfig);
    const dcResult = await dcHandlers.updateTestCaseName({
      test_case_key: 'PROJ-T2',
      name: 'New DC name',
    });
    if (dcPuts.length !== 1) throw new Error(`Expected 1 PUT, got ${dcPuts.length}`);
    if (dcPuts[0].body.name !== 'New DC name') throw new Error(`Expected name 'New DC name' in PUT payload, got ${dcPuts[0].body.name}`);
    if (dcPuts[0].body.folder !== '/Parent/Child') throw new Error('Expected folder to be preserved in PUT payload');
    if (!dcPuts[0].body.testScript || dcPuts[0].body.testScript.text !== 'Do the thing') {
      throw new Error('Expected existing testScript to be preserved on DC full-replace PUT');
    }
    if (dcPuts[0].body.projectKey !== 'PROJ') throw new Error('Expected projectKey in DC PUT payload');
    if (!dcResult.content[0].text.includes('PROJ-T2')) throw new Error('Expected test case key in success message');
    if (!dcResult.content[0].text.includes('New DC name')) throw new Error('Expected new name in success message');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'update_test_case_name'")) throw new Error("'update_test_case_name' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`update_test_case_name: (args)`)) throw new Error("build/dispatch.js does not dispatch 'update_test_case_name'");
    if (!indexContent.includes('updateTestCaseName(args')) throw new Error('build/dispatch.js does not call toolHandlers.updateTestCaseName(...)');
  }

  async testUpdateTestCasePreconditionObjectiveUnit() {
    const { ZephyrToolHandlers } = await import('../build/tool-handlers.js');
    const { McpError } = await import('@modelcontextprotocol/sdk/types.js');

    // --- Cloud: updates precondition and objective, preserves other fields ---
    const cloudConfig = {
      type: 'cloud',
      apiEndpoints: { testcase: 'https://api.zephyrscale.smartbear.com/v2/testcases' }
    };
    const cloudPuts = [];
    const cloudMockAxios = {
      get: async () => {
        return {
          data: {
            id: 42,
            name: 'Existing test case',
            status: { id: 1, name: 'Draft' },
            priority: { id: 2, name: 'Normal' },
            project: { id: 100 },
            folder: { id: 55, name: 'Target' },
            labels: ['smoke'],
            customFields: { Type: 'Functional' },
            precondition: 'Old precondition',
            objective: 'Old objective',
          },
        };
      },
      put: async (url, body) => {
        cloudPuts.push({ url, body });
        return { data: {} };
      },
    };
    const cloudHandlers = new ZephyrToolHandlers(cloudMockAxios, cloudConfig);
    const cloudResult = await cloudHandlers.updateTestCasePreconditionObjective({
      test_case_key: 'PROJ-T1',
      precondition: 'New precondition',
      objective: 'New objective',
    });
    if (cloudPuts.length !== 1) throw new Error(`Expected 1 PUT, got ${cloudPuts.length}`);
    if (cloudPuts[0].body.precondition !== 'New precondition') throw new Error(`Expected new precondition in PUT payload, got ${cloudPuts[0].body.precondition}`);
    if (cloudPuts[0].body.objective !== 'New objective') throw new Error(`Expected new objective in PUT payload, got ${cloudPuts[0].body.objective}`);
    if (cloudPuts[0].body.name !== 'Existing test case') throw new Error('Expected name to be preserved in PUT payload');
    if (cloudPuts[0].body.folderId !== 55) throw new Error('Expected folderId to be preserved in PUT payload');
    if (!Array.isArray(cloudPuts[0].body.labels) || cloudPuts[0].body.labels[0] !== 'smoke') {
      throw new Error('Expected labels to be preserved in PUT payload');
    }
    if (cloudPuts[0].body.customFields.Type !== 'Functional') throw new Error('Expected customFields to be preserved in PUT payload');
    if (!cloudResult.content[0].text.includes('PROJ-T1')) throw new Error('Expected test case key in success message');

    // --- Cloud: only objective given, existing precondition preserved unchanged ---
    const cloudPartialPuts = [];
    const cloudPartialMockAxios = {
      get: async () => {
        return {
          data: {
            id: 42,
            name: 'Existing test case',
            status: { id: 1, name: 'Draft' },
            priority: { id: 2, name: 'Normal' },
            project: { id: 100 },
            precondition: 'Untouched precondition',
            objective: 'Old objective',
          },
        };
      },
      put: async (url, body) => {
        cloudPartialPuts.push({ url, body });
        return { data: {} };
      },
    };
    const cloudPartialHandlers = new ZephyrToolHandlers(cloudPartialMockAxios, cloudConfig);
    await cloudPartialHandlers.updateTestCasePreconditionObjective({
      test_case_key: 'PROJ-T1',
      objective: 'New objective only',
    });
    if (cloudPartialPuts[0].body.precondition !== 'Untouched precondition') {
      throw new Error(`Expected existing precondition to be preserved, got ${cloudPartialPuts[0].body.precondition}`);
    }
    if (cloudPartialPuts[0].body.objective !== 'New objective only') {
      throw new Error(`Expected new objective in PUT payload, got ${cloudPartialPuts[0].body.objective}`);
    }

    // --- Cloud: neither field given raises McpError, no GET/PUT issued ---
    const cloudMissingFieldsHandlers = new ZephyrToolHandlers({
      get: async () => { throw new Error('GET should not be called when neither field is given'); },
      put: async () => { throw new Error('PUT should not be called when neither field is given'); },
    }, cloudConfig);
    try {
      await cloudMissingFieldsHandlers.updateTestCasePreconditionObjective({ test_case_key: 'PROJ-T1' });
      throw new Error('Expected McpError when neither precondition nor objective is given');
    } catch (e) {
      if (!(e instanceof McpError)) throw new Error(`Expected McpError for missing fields, got: ${e.message}`);
    }

    // --- Data Center: updates precondition/objective, preserves testScript on full-replace PUT ---
    const dcConfig = {
      type: 'datacenter',
      apiEndpoints: { testcase: 'http://dc.example.com/rest/atm/1.0/testcase' }
    };
    const dcPuts = [];
    const dcMockAxios = {
      get: async () => {
        return {
          data: {
            projectKey: 'PROJ',
            name: 'Existing DC test case',
            status: 'Draft',
            priority: 'Normal',
            folder: '/Parent/Child',
            labels: ['regression'],
            customFields: { Type: 'Functional' },
            precondition: 'Old precondition',
            objective: 'Old objective',
            testScript: { type: 'PLAIN_TEXT', text: 'Do the thing' },
          },
        };
      },
      put: async (url, body) => {
        dcPuts.push({ url, body });
        return { status: 200, data: {} };
      },
    };
    const dcHandlers = new ZephyrToolHandlers(dcMockAxios, dcConfig);
    const dcResult = await dcHandlers.updateTestCasePreconditionObjective({
      test_case_key: 'PROJ-T2',
      precondition: 'New DC precondition',
      objective: 'New DC objective',
    });
    if (dcPuts.length !== 1) throw new Error(`Expected 1 PUT, got ${dcPuts.length}`);
    if (dcPuts[0].body.precondition !== 'New DC precondition') throw new Error(`Expected new precondition in PUT payload, got ${dcPuts[0].body.precondition}`);
    if (dcPuts[0].body.objective !== 'New DC objective') throw new Error(`Expected new objective in PUT payload, got ${dcPuts[0].body.objective}`);
    if (dcPuts[0].body.folder !== '/Parent/Child') throw new Error('Expected folder to be preserved in PUT payload');
    if (!dcPuts[0].body.testScript || dcPuts[0].body.testScript.text !== 'Do the thing') {
      throw new Error('Expected existing testScript to be preserved on DC full-replace PUT');
    }
    if (dcPuts[0].body.projectKey !== 'PROJ') throw new Error('Expected projectKey in DC PUT payload');
    if (!dcResult.content[0].text.includes('PROJ-T2')) throw new Error('Expected test case key in success message');

    // --- Schema and dispatch wiring ---
    const fs = require('fs');
    const path = require('path');
    const schemaContent = fs.readFileSync(path.join(__dirname, '../build/tool-schemas.js'), 'utf8');
    if (!schemaContent.includes("name: 'update_test_case_precondition_objective'")) throw new Error("'update_test_case_precondition_objective' not found in built tool-schemas.js");
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/dispatch.js'), 'utf8');
    if (!indexContent.includes(`update_test_case_precondition_objective: (args)`)) throw new Error("build/dispatch.js does not dispatch 'update_test_case_precondition_objective'");
    if (!indexContent.includes('updateTestCasePreconditionObjective(args')) throw new Error('build/dispatch.js does not call toolHandlers.updateTestCasePreconditionObjective(...)');
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting Zephyr Scale MCP Server Test Suite\n');
    console.log('=' .repeat(60));

    await this.runTest('Package Configuration', () => this.testPackageConfig());
    await this.runTest('Build Artifacts', () => this.testBuildArtifacts());
    await this.runTest('Environment Configuration', () => this.testEnvironmentConfig());
    await this.runTest('Server Startup', () => this.testServerStartup());
    await this.runTest('Tools List', () => this.testToolsList());
    await this.runTest('Schema Contains New Tools', () => this.testSchemaContainsNewTools());
    await this.runTest('get_test_case_steps Unit Tests', () => this.testGetTestCaseStepsUnit());
    await this.runTest('update_test_case_steps Unit Tests', () => this.testUpdateTestCaseStepsUnit());
    await this.runTest('get_projects Unit Tests', () => this.testGetProjectsUnit());
    await this.runTest('get_statuses Unit Tests', () => this.testGetStatusesUnit());
    await this.runTest('get_priorities Unit Tests', () => this.testGetPrioritiesUnit());
    await this.runTest('get_environments Unit Tests', () => this.testGetEnvironmentsUnit());
    await this.runTest('search_test_cases Cloud Unit Tests', () => this.testSearchTestCasesCloudUnit());
    await this.runTest('search_test_cases Data Center Unit Tests', () => this.testSearchTestCasesDataCenterUnit());
    await this.runTest('search_test_cases Index Dispatch', () => this.testIndexDispatchesSearchTestCases());
    await this.runTest('Dispatch Covers All Schemas', () => this.testDispatchCoversAllSchemas());
    await this.runTest('Skill CLI', () => this.testSkillCli());
    await this.runTest('Skill CLI Env File', () => this.testSkillCliEnvFile());
    await this.runTest('Server Loads Env File', () => this.testServerLoadsEnvFile());
    await this.runTest('Skill Reference Up To Date', () => this.testSkillReferenceUpToDate());
    await this.runTest('get_test_script Unit Tests', () => this.testGetTestScriptUnit());
    await this.runTest('get_test_case_links Unit Tests', () => this.testGetTestCaseLinksUnit());
    await this.runTest('create_test_case_web_link Unit Tests', () => this.testCreateTestCaseWebLinkUnit());
    await this.runTest('create_test_case_issue_link Unit Tests', () => this.testCreateTestCaseIssueLinkUnit());
    await this.runTest('get_test_cases_linked_to_issue Unit Tests', () => this.testGetTestCasesLinkedToIssueUnit());
    await this.runTest('get_test_cycle_links Unit Tests', () => this.testGetTestCycleLinksUnit());
    await this.runTest('create_test_cycle_web_link Unit Tests', () => this.testCreateTestCycleWebLinkUnit());
    await this.runTest('create_test_cycle_issue_link Unit Tests', () => this.testCreateTestCycleIssueLinkUnit());
    await this.runTest('get_test_execution_links Unit Tests', () => this.testGetTestExecutionLinksUnit());
    await this.runTest('create_test_execution_issue_link Unit Tests', () => this.testCreateTestExecutionIssueLinkUnit());
    await this.runTest('get_test_executions_linked_to_issue Unit Tests', () => this.testGetTestExecutionsLinkedToIssueUnit());
    await this.runTest('update_test_case_custom_fields Unit Tests', () => this.testUpdateTestCaseCustomFieldsUnit());
    await this.runTest('move_test_case_folder Unit Tests', () => this.testMoveTestCaseFolderUnit());
    await this.runTest('update_test_case_name Unit Tests', () => this.testUpdateTestCaseNameUnit());
    await this.runTest('update_test_case_precondition_objective Unit Tests', () => this.testUpdateTestCasePreconditionObjectiveUnit());

    if (this.sharedSkillRoot) require('fs').rmSync(this.sharedSkillRoot, { recursive: true, force: true });

    // Print summary
    console.log('\n' + '=' .repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(60));

    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    const total = this.testResults.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);

    if (failed > 0) {
      console.log('\n🔍 Failed Tests:');
      this.testResults
        .filter(r => r.status === 'FAILED')
        .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    }

    console.log('\n' + '=' .repeat(60));
    return failed === 0;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const testSuite = new ZephyrServerTest();
  testSuite.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = ZephyrServerTest;
