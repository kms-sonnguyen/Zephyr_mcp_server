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
    const tools = ['get_test_case_steps', 'update_test_case_steps'];
    for (const tool of tools) {
      if (!content.includes(tool)) {
        throw new Error(`'${tool}' not found in built tool-schemas.js`);
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
