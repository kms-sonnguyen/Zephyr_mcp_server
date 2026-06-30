import { readFile } from 'fs/promises';
import { extname } from 'path';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createJiraConfig } from './utils.js';
let axiosInstance = null;
let jiraConfig = null;
export function setAxiosInstance(instance) {
    axiosInstance = instance;
    // Configuration will be created on-demand when making requests
}
export const resourceList = [
    {
        uri: 'file://',
        name: 'File System Access',
        description: 'Read user-provided files containing test case examples, payloads, or templates. Use file:// followed by absolute path (e.g., file:///Users/username/examples/test-payload.json)',
        mimeType: 'application/octet-stream',
    },
    {
        uri: 'zephyr://testcase/',
        name: 'Live Test Case Data',
        description: 'Fetch real test case data from Zephyr Scale to use as templates. Use zephyr://testcase/TEST-KEY (e.g., zephyr://testcase/PROJ-T123). The fetched data shows the exact structure including customFields, folder paths, and other project-specific configurations that you can copy when creating new test cases.',
        mimeType: 'application/json',
    },
    {
        uri: 'zephyr://examples/step-by-step-payload',
        name: 'Step-by-Step Test Case - Request Payload Example',
        description: 'Example payload for creating a step-by-step test case',
        mimeType: 'application/json',
    },
    {
        uri: 'zephyr://examples/gherkin-conversion',
        name: 'BDD Content Conversion Example',
        description: 'Shows how BDD content is converted from markdown to Gherkin format',
        mimeType: 'text/plain',
    },
];
export async function readResource(uri) {
    // Handle file:// URIs for reading user-provided files
    if (uri.startsWith('file://')) {
        try {
            const filePath = uri.replace('file://', '');
            const fileContent = await readFile(filePath, 'utf-8');
            // Determine MIME type based on file extension
            const ext = extname(filePath).toLowerCase();
            let mimeType = 'text/plain';
            switch (ext) {
                case '.json':
                    mimeType = 'application/json';
                    break;
                case '.yaml':
                case '.yml':
                    mimeType = 'application/yaml';
                    break;
                case '.xml':
                    mimeType = 'application/xml';
                    break;
                case '.html':
                    mimeType = 'text/html';
                    break;
                case '.md':
                    mimeType = 'text/markdown';
                    break;
                case '.js':
                    mimeType = 'application/javascript';
                    break;
                case '.ts':
                    mimeType = 'application/typescript';
                    break;
                default:
                    mimeType = 'text/plain';
            }
            return {
                contents: [{
                        uri: uri,
                        mimeType: mimeType,
                        text: fileContent
                    }]
            };
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // Handle live test case data from Zephyr Scale
    if (uri.startsWith('zephyr://testcase/')) {
        if (!axiosInstance) {
            throw new McpError(ErrorCode.InternalError, 'Axios instance not initialized. Cannot fetch live test case data.');
        }
        if (!jiraConfig) {
            try {
                jiraConfig = createJiraConfig();
            }
            catch (error) {
                throw new McpError(ErrorCode.InternalError, `Jira configuration error: ${error instanceof Error ? error.message : String(error)}. Please ensure environment variables are properly configured.`);
            }
        }
        try {
            const testCaseKey = uri.replace('zephyr://testcase/', '');
            if (!testCaseKey) {
                throw new McpError(ErrorCode.InvalidRequest, 'Test case key is required. Use format: zephyr://testcase/TEST-KEY');
            }
            const response = await axiosInstance.get(`${jiraConfig.apiEndpoints.testcase}/${testCaseKey}`);
            return {
                contents: [{
                        uri: uri,
                        mimeType: 'application/json',
                        text: JSON.stringify({
                            description: `Live test case data for ${testCaseKey} retrieved from Zephyr Scale (${jiraConfig.type})`,
                            testCaseKey: testCaseKey,
                            jiraType: jiraConfig.type,
                            retrievedAt: new Date().toISOString(),
                            data: response.data
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            let errorMessage = 'Unknown error';
            if (error instanceof Error && 'response' in error) {
                const axiosError = error;
                if (axiosError.response?.status === 404) {
                    errorMessage = `Test case not found: ${uri.replace('zephyr://testcase/', '')}`;
                }
                else {
                    errorMessage = `Status: ${axiosError.response?.status}, Data: ${JSON.stringify(axiosError.response?.data)}`;
                }
            }
            else if (error instanceof Error) {
                errorMessage = error.message;
            }
            else {
                errorMessage = String(error);
            }
            throw new McpError(ErrorCode.InternalError, `Failed to fetch test case: ${errorMessage}`);
        }
    }
    switch (uri) {
        case 'zephyr://examples/bdd-test-case-payload':
            return {
                contents: [{
                        uri: uri,
                        mimeType: 'application/json',
                        text: JSON.stringify({
                            description: "Example payload sent to Zephyr Scale API for BDD test case creation",
                            endpoint: "POST /testcases (Cloud) or /rest/atm/1.0/testcase (Data Center)",
                            payload: {
                                projectKey: "PROJ",
                                name: "User Authentication with Privacy Policy",
                                status: "Draft",
                                priority: "High",
                                folder: "/ProjectName/Authentication/Login Features",
                                precondition: "User has not accepted privacy policy and application is available",
                                objective: "Verify that new users see and can accept privacy policy before proceeding",
                                issueLinks: ["PROJ-123"],
                                customFields: {
                                    "Type": "Functional",
                                    "Priority": "P0",
                                    "Regression": false,
                                    "Execution Type": "Manual",
                                    "Risk Control": false
                                },
                                testScript: {
                                    type: "BDD",
                                    text: "    Given I am a new user who has not accepted the privacy policy\\n    And I navigate to the application\\n    When I attempt to access the main features\\n    Then I should see the Privacy Policy modal\\n    And the modal should contain the privacy policy text\\n    And the modal should have an 'Accept' button\\n    And the modal should have a 'Decline' button\\n    When I click the 'Accept' button\\n    Then the Privacy Policy modal should close\\n    And I should be able to access the application features\\n    And my acceptance should be recorded in the system"
                                }
                            }
                        }, null, 2)
                    }]
            };
        case 'zephyr://examples/step-by-step-payload':
            return {
                contents: [{
                        uri: uri,
                        mimeType: 'application/json',
                        text: JSON.stringify({
                            description: "Example payload for creating a step-by-step test case",
                            endpoint: "POST /testcases (Cloud) or /rest/atm/1.0/testcase (Data Center)",
                            payload: {
                                projectKey: "PROJ",
                                name: "User Login Test",
                                status: "Draft",
                                priority: "High",
                                folder: "/ProjectName/Authentication",
                                customFields: {
                                    "Type": "Functional",
                                    "Priority": "P0"
                                },
                                testScript: {
                                    type: "STEP_BY_STEP",
                                    steps: [
                                        {
                                            description: "Navigate to login page",
                                            testData: "URL: https://example.com/login",
                                            expectedResult: "Login page is displayed with username and password fields"
                                        },
                                        {
                                            description: "Enter valid credentials",
                                            testData: "Username: testuser@example.com, Password: validpassword123",
                                            expectedResult: "Credentials are entered successfully"
                                        },
                                        {
                                            description: "Click login button",
                                            testData: "",
                                            expectedResult: "User is logged in and redirected to dashboard"
                                        }
                                    ]
                                }
                            }
                        }, null, 2)
                    }]
            };
        case 'zephyr://examples/gherkin-conversion':
            return {
                contents: [{
                        uri: uri,
                        mimeType: 'text/plain',
                        text: `BDD Content Conversion Example

The MCP server automatically converts markdown-style BDD content to proper Gherkin format.

INPUT (Markdown style):
**Given** a user with valid credentials
**When** the user attempts to log in
**Then** the user should be authenticated successfully

OUTPUT (Gherkin format with indentation):
    Given a user with valid credentials
    When the user attempts to log in
    Then the user should be authenticated successfully

SUPPORTED KEYWORDS:
- **Given** → Given
- **When** → When  
- **Then** → Then
- **And** → And

The converter:
1. Removes markdown formatting (**bold**)
2. Adds proper Gherkin keywords
3. Adds 4-space indentation to all lines
4. Filters out empty lines and separators (---)

This ensures the BDD content is properly formatted for Zephyr Scale's BDD test script requirements.`
                    }]
            };
        default:
            throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }
}
