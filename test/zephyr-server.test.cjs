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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_projects':`)) throw new Error("build/index.js does not dispatch 'get_projects'");
    if (!indexContent.includes('getProjects(args')) throw new Error('build/index.js does not call toolHandlers.getProjects(...)');
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_statuses':`)) throw new Error("build/index.js does not dispatch 'get_statuses'");
    if (!indexContent.includes('getStatuses(args')) throw new Error('build/index.js does not call toolHandlers.getStatuses(...)');
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
    const indexContent = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!indexContent.includes(`case 'get_priorities':`)) throw new Error("build/index.js does not dispatch 'get_priorities'");
    if (!indexContent.includes('getPriorities(args')) throw new Error('build/index.js does not call toolHandlers.getPriorities(...)');
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
    const fs = require('fs');
    const content = fs.readFileSync(path.join(__dirname, '../build/index.js'), 'utf8');
    if (!content.includes(`case 'search_test_cases':`)) {
      throw new Error("build/index.js does not dispatch 'search_test_cases'");
    }
    if (!content.includes('searchTestCases(args')) {
      throw new Error('build/index.js does not call toolHandlers.searchTestCases(...)');
    }
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
    await this.runTest('search_test_cases Cloud Unit Tests', () => this.testSearchTestCasesCloudUnit());
    await this.runTest('search_test_cases Data Center Unit Tests', () => this.testSearchTestCasesDataCenterUnit());
    await this.runTest('search_test_cases Index Dispatch', () => this.testIndexDispatchesSearchTestCases());

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
