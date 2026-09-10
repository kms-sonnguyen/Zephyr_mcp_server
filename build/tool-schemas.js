export const toolSchemas = [
    {
        name: 'get_test_case',
        description: 'Get detailed information about a specific test case',
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
    {
        name: 'create_test_case',
        description: 'Create a new test case with STEP_BY_STEP, PLAIN_TEXT, or BDD content. To match your project\'s structure, use the zephyr://testcase/EXISTING-KEY resource to fetch a real test case and use its structure as a template, especially for custom_fields.',
        inputSchema: {
            type: 'object',
            properties: {
                project_key: {
                    type: 'string',
                    description: 'Project key (required)',
                },
                name: {
                    type: 'string',
                    description: 'Test case name (required)',
                },
                test_script: {
                    type: 'object',
                    description: 'Test script object containing type and content',
                    properties: {
                        type: {
                            type: 'string',
                            description: 'Type of test script',
                            enum: ['STEP_BY_STEP', 'PLAIN_TEXT', 'BDD'],
                        },
                        steps: {
                            type: 'array',
                            description: 'Test steps for STEP_BY_STEP type',
                            items: {
                                type: 'object',
                                properties: {
                                    description: {
                                        type: 'string',
                                        description: 'Step description'
                                    },
                                    testData: {
                                        type: 'string',
                                        description: 'Test data for the step (optional)'
                                    },
                                    expectedResult: {
                                        type: 'string',
                                        description: 'Expected result for the step (optional)'
                                    },
                                    testCaseKey: {
                                        type: 'string',
                                        description: 'Test case key reference for calling other tests (optional)'
                                    }
                                }
                            }
                        },
                        text: {
                            type: 'string',
                            description: 'Text content for PLAIN_TEXT or BDD types. For BDD, use Gherkin syntax with Given/When/Then steps.',
                        }
                    },
                    required: ['type']
                },
                folder: {
                    type: 'string',
                    description: 'Folder path (optional, e.g., "/Orbiter/Cargo Bay")',
                },
                status: {
                    type: 'string',
                    description: 'Test case status (optional, default: "Draft"). Value must match a status name configured in your Zephyr project (e.g. "Draft", "Approved", "Deprecated"). Note: always overridden to "Draft" on creation.',
                    default: 'Draft',
                },
                priority: {
                    type: 'string',
                    description: 'Test case priority (optional). Value must match a priority name configured in your Zephyr project (e.g. "High", "Normal", "Low", "Critical"). Use zephyr://testcase/EXISTING-KEY to check your project\'s valid values.',
                },
                precondition: {
                    type: 'string',
                    description: 'Test precondition (optional)',
                },
                objective: {
                    type: 'string',
                    description: 'Test objective (optional)',
                },
                component_id: {
                    type: 'integer',
                    description: 'Jira component ID (optional, Cloud only — use the numeric component ID, not the name)',
                },
                owner_id: {
                    type: 'string',
                    description: 'Test case owner Jira Account ID (optional, Cloud only — e.g. "5b10a2844c20165700ede21g")',
                },
                estimated_time: {
                    type: 'number',
                    description: 'Estimated time in milliseconds (optional)',
                },
                labels: {
                    type: 'array',
                    description: 'Array of labels (optional)',
                    items: { type: 'string' }
                },
                issue_links: {
                    type: 'array',
                    description: 'Array of Jira issue keys to link to this test case (e.g. ["PROJ-123", "PROJ-456"]). On Cloud, each key is resolved to a numeric Jira issue ID via the Jira REST API, then linked via POST /testcases/{key}/links/issues — failures are reported as warnings but do not fail the tool call. On Data Center, sent directly in the create payload.',
                    items: { type: 'string' }
                },
                custom_fields: {
                    type: 'object',
                    description: 'Custom fields object (optional). Use the zephyr://testcase/EXISTING-KEY resource to fetch a real test case and copy its customFields structure. Common examples: {"Type": "Functional", "Priority": "P2", "Regression": false, "Execution Type": "Manual - To Be Automated", "Risk Control": false}',
                    additionalProperties: true
                },
                parameters: {
                    type: 'object',
                    description: 'Test parameters for data-driven testing (optional)',
                    properties: {
                        variables: {
                            type: 'array',
                            description: 'Array of parameter variables',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    type: {
                                        type: 'string',
                                        enum: ['FREE_TEXT', 'DATA_SET']
                                    },
                                    dataSet: { type: 'string' }
                                },
                                required: ['name', 'type']
                            }
                        },
                        entries: {
                            type: 'array',
                            description: 'Array of parameter value entries',
                            items: {
                                type: 'object',
                                additionalProperties: true
                            }
                        }
                    }
                }
            },
            required: ['project_key', 'name'],
        },
    },
    {
        name: 'update_test_case_bdd',
        description: 'Update an existing test case with BDD content. Optionally update the test case name. Unspecified fields are preserved.',
        inputSchema: {
            type: 'object',
            properties: {
                test_case_key: {
                    type: 'string',
                    description: 'Test case key to update',
                },
                name: {
                    type: 'string',
                    description: 'New test case name (optional)',
                },
                bdd_content: {
                    type: 'string',
                    description: 'BDD content in markdown format (will be converted to Gherkin when possible)',
                },
            },
            required: ['test_case_key', 'bdd_content'],
        },
    },
    {
        name: 'update_test_case_custom_fields',
        description: 'Update one or more custom field values on an existing test case. Merges the given fields into the existing customFields object — fields not mentioned are left untouched. Use the zephyr://testcase/EXISTING-KEY resource to see current custom field names/values.',
        inputSchema: {
            type: 'object',
            properties: {
                test_case_key: {
                    type: 'string',
                    description: 'Test case key to update',
                },
                custom_fields: {
                    type: 'object',
                    description: 'Custom field name/value pairs to set. Only the keys provided are changed; existing custom fields not mentioned here are preserved. Example: {"Risk Control": true, "Execution Type": "Manual - To Be Automated"}',
                },
            },
            required: ['test_case_key', 'custom_fields'],
        },
    },
    {
        name: 'move_test_case_folder',
        description: 'Move an existing test case to a different folder. The destination folder must already exist (use create_folder first if needed). All other fields on the test case are preserved.',
        inputSchema: {
            type: 'object',
            properties: {
                test_case_key: {
                    type: 'string',
                    description: 'Test case key to move',
                },
                folder: {
                    type: 'string',
                    description: 'Full destination folder path (e.g., "/Parent/Child"). Must already exist.',
                },
            },
            required: ['test_case_key', 'folder'],
        },
    },
    {
        name: 'update_test_case_name',
        description: 'Rename an existing test case. All other fields on the test case are preserved.',
        inputSchema: {
            type: 'object',
            properties: {
                test_case_key: {
                    type: 'string',
                    description: 'Test case key to rename',
                },
                name: {
                    type: 'string',
                    description: 'New test case name',
                },
            },
            required: ['test_case_key', 'name'],
        },
    },
    {
        name: 'update_test_case_precondition_objective',
        description: 'Update the precondition and/or objective on an existing test case. Provide at least one of precondition/objective; the other is preserved if omitted. All other fields on the test case are preserved.',
        inputSchema: {
            type: 'object',
            properties: {
                test_case_key: {
                    type: 'string',
                    description: 'Test case key to update',
                },
                precondition: {
                    type: 'string',
                    description: 'New precondition text (optional)',
                },
                objective: {
                    type: 'string',
                    description: 'New objective text (optional)',
                },
            },
            required: ['test_case_key'],
        },
    },
    {
        name: 'create_folder',
        description: 'Create a new folder in Zephyr Scale. On Cloud: provide a path like "/Parent/Child" — the server resolves parent segments and creates the leaf folder. On Data Center: the full path is sent directly.',
        inputSchema: {
            type: 'object',
            properties: {
                project_key: {
                    type: 'string',
                    description: 'Project key (required)',
                },
                name: {
                    type: 'string',
                    description: 'Full folder path including parent folders (required). Examples: "/MyFolder" for root folder, "/Parent/Child" for nested folder. On Cloud, individual segment names must not contain "/" or "\\".',
                },
                folder_type: {
                    type: 'string',
                    description: 'Type of folder',
                    enum: ['TEST_CASE', 'TEST_PLAN', 'TEST_CYCLE'],
                    default: 'TEST_CASE',
                },
            },
            required: ['project_key', 'name'],
        },
    },
    {
        name: 'get_folders',
        description: 'Get folders from Zephyr Scale. All parameters are optional. If folder_path is provided, returns the full subtree (the folder and all its descendants at every depth) under that path. Otherwise returns all folders matching the filters.',
        inputSchema: {
            type: 'object',
            properties: {
                project_key: {
                    type: 'string',
                    description: 'Jira project key filter (e.g., "PROJ"). Optional.',
                },
                folder_type: {
                    type: 'string',
                    description: 'Folder type filter (optional)',
                    enum: ['TEST_CASE', 'TEST_PLAN', 'TEST_CYCLE'],
                },
                folder_path: {
                    type: 'string',
                    description: 'Folder path to filter by (e.g., "/CRM on Wechat"). Returns the matching folder and all folders nested beneath it at any depth. Requires project_key and folder_type to resolve the path.',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum total number of folders to return (optional). Defaults to all folders.',
                },
            },
        },
    },
    {
        name: 'get_test_run_cases',
        description: 'Get test case keys from a test run',
        inputSchema: {
            type: 'object',
            properties: {
                test_run_key: {
                    type: 'string',
                    description: 'Test run key (e.g., PROJ-R123)',
                },
            },
            required: ['test_run_key'],
        },
    },
    {
        name: 'delete_test_case',
        description: 'Delete a specific test case (Data Center only — not supported on Cloud v2)',
        inputSchema: {
            type: 'object',
            properties: {
                test_case_key: {
                    type: 'string',
                    description: 'Test case key to delete (e.g., PROJ-T123)',
                },
            },
            required: ['test_case_key'],
        },
    },
    {
        name: 'create_test_run',
        description: 'Create a new test run',
        inputSchema: {
            type: 'object',
            properties: {
                project_key: {
                    type: 'string',
                    description: 'Project key (required)',
                },
                name: {
                    type: 'string',
                    description: 'Test run name (required)',
                },
                test_case_keys: {
                    type: 'array',
                    description: 'Array of test case keys to include in the test run',
                    items: { type: 'string' }
                },
                test_plan_key: {
                    type: 'string',
                    description: 'Test plan key to link this test run to (optional)',
                },
                folder: {
                    type: 'string',
                    description: 'Folder path (optional)',
                },
                planned_start_date: {
                    type: 'string',
                    description: 'Planned start date in ISO format (optional)',
                },
                planned_end_date: {
                    type: 'string',
                    description: 'Planned end date in ISO format (optional)',
                },
                description: {
                    type: 'string',
                    description: 'Test run description (optional)',
                },
                owner: {
                    type: 'string',
                    description: 'Test run owner (optional)',
                },
                environment: {
                    type: 'string',
                    description: 'Test environment name (optional). On Cloud, applied to each test execution (environmentName). On Data Center, set at cycle level.',
                },
                issue_key: {
                    type: 'string',
                    description: 'Single Jira issue key to link to the test cycle (e.g. "PROJ-123"). On Cloud, resolved to a numeric ID via Jira REST API — requires JIRA_USERNAME + JIRA_API_TOKEN env vars.',
                },
                issue_links: {
                    type: 'array',
                    description: 'Array of Jira issue keys to link to the test cycle (e.g. ["PROJ-123", "PROJ-456"]). On Cloud, each key is resolved to a numeric ID via Jira REST API — requires JIRA_USERNAME + JIRA_API_TOKEN env vars. Failures are reported as warnings and do not fail the tool call.',
                    items: { type: 'string' },
                },
                jira_project_version: {
                    type: 'integer',
                    description: 'Jira project version/release ID to link this test cycle to (optional, Cloud only — use the numeric version ID).',
                },
                custom_fields: {
                    type: 'object',
                    description: 'Custom fields object (optional)',
                },
            },
            required: ['project_key', 'name'],
        },
    },
    {
        name: 'get_test_run',
        description: 'Get detailed information about a specific test run',
        inputSchema: {
            type: 'object',
            properties: {
                test_run_key: {
                    type: 'string',
                    description: 'Test run key (e.g., PROJ-R123)',
                },
            },
            required: ['test_run_key'],
        },
    },
    {
        name: 'get_test_execution',
        description: 'Get detailed information about a specific test execution by ID or key. On Cloud, provide the execution ID or key (e.g., PROJ-E123) directly. On Data Center, also provide test_run_keys to search within.',
        inputSchema: {
            type: 'object',
            properties: {
                execution_id: {
                    type: 'string',
                    description: 'Test execution ID or key (e.g., 5805255 or PROJ-E123)',
                },
                test_run_keys: {
                    type: 'array',
                    description: 'Array of test run keys to search in (required for Data Center, optional for Cloud — e.g., ["PROJ-R152", "PROJ-R161"])',
                    items: { type: 'string' },
                    minItems: 1
                },
            },
            required: ['execution_id'],
        },
    },
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
    {
        name: 'search_test_runs',
        description: 'Search for test runs using a query. Supports filtering by projectKey and/or folder path. On Cloud, only returns cycles in the exact folder (not sub-folders). Use folder_id for direct numeric ID lookup (skips path resolution).',
        inputSchema: {
            type: 'object',
            properties: {
                project_key: {
                    type: 'string',
                    description: 'Project key to filter by (e.g., "PROJ"). Can be a single key or omitted if using folder only.',
                },
                folder: {
                    type: 'string',
                    description: 'Folder path to filter test runs by (e.g., "/MyFolder/SubFolder"). Resolved to a numeric folderId on Cloud.',
                },
                folder_id: {
                    type: 'number',
                    description: 'Numeric folder ID to filter test runs by (optional). If provided, takes precedence over folder path and skips path resolution. Use this when you already know the folder ID.',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of results to return (optional, default 200)',
                    default: 200,
                },
                fields: {
                    type: 'string',
                    description: 'Comma-separated list of fields to include in the response (optional, e.g., "key,name,status,folder"). If not set, all fields are returned.',
                },
            },
        },
    },
    {
        name: 'list_executions_by_cycle',
        description: 'List all test executions for a specific test cycle. Returns execution status, executedBy, actualEndDate for each test case in the cycle. Cloud only.',
        inputSchema: {
            type: 'object',
            properties: {
                test_cycle_key: {
                    type: 'string',
                    description: 'Test cycle key (e.g., DDCN-R371)',
                },
                project_key: {
                    type: 'string',
                    description: 'Project key (required for Cloud)',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of results to return (optional, default 100)',
                    default: 100,
                },
            },
            required: ['test_cycle_key', 'project_key'],
        },
    },
    {
        name: 'update_test_run',
        description: 'Update an existing test cycle — set owner, name, description, dates, or status. Unspecified fields are preserved. Cloud only.',
        inputSchema: {
            type: 'object',
            properties: {
                test_run_key: {
                    type: 'string',
                    description: 'Test cycle key to update (e.g., PROJ-R123)',
                },
                owner: {
                    type: 'string',
                    description: 'Jira Account ID of the new owner (e.g., "6269ee89494f17007056d8f0")',
                },
                name: {
                    type: 'string',
                    description: 'New name for the test cycle (optional)',
                },
                description: {
                    type: 'string',
                    description: 'New description (optional)',
                },
                planned_start_date: {
                    type: 'string',
                    description: 'Planned start date in ISO format (optional)',
                },
                planned_end_date: {
                    type: 'string',
                    description: 'Planned end date in ISO format (optional)',
                },
                status_id: {
                    type: 'number',
                    description: 'Numeric status ID to set (optional)',
                },
            },
            required: ['test_run_key'],
        },
    },
    {
        name: 'update_test_execution',
        description: 'Update a test case execution\'s status within a test cycle, and optionally attach bug(s) as Jira issue links. Identify the execution either by execution_id directly, or by test_cycle_key + test_case_key (the latest execution is used). Cloud only.',
        inputSchema: {
            type: 'object',
            properties: {
                execution_id: {
                    type: 'string',
                    description: 'Test execution key or ID (e.g. "PROJ-E123" or 5805255). Takes precedence over test_cycle_key/test_case_key.',
                },
                test_cycle_key: {
                    type: 'string',
                    description: 'Test cycle key (e.g. "PROJ-R123"). Used together with test_case_key to locate the execution when execution_id is not given.',
                },
                test_case_key: {
                    type: 'string',
                    description: 'Test case key (e.g. "PROJ-T456"). Used together with test_cycle_key to locate the execution.',
                },
                project_key: {
                    type: 'string',
                    description: 'Project key for the cycle lookup (optional — derived from test_cycle_key when omitted).',
                },
                status: {
                    type: 'string',
                    description: 'New execution status name. Common values: "Pass", "Fail", "In Progress", "Blocked", "Not Executed". Must match a status configured in your Zephyr project.',
                },
                comment: {
                    type: 'string',
                    description: 'Comment against the overall execution (e.g. failure details).',
                },
                environment: {
                    type: 'string',
                    description: 'Environment name assigned to the execution (e.g. "Chrome Latest Version").',
                },
                execution_time: {
                    type: 'number',
                    description: 'Actual execution time in milliseconds (optional).',
                },
                actual_end_date: {
                    type: 'string',
                    description: 'Actual end date in ISO format, e.g. "2024-05-20T13:15:13Z" (optional).',
                },
                executed_by_id: {
                    type: 'string',
                    description: 'Jira Account ID of the user who executed the test (optional).',
                },
                assigned_to_id: {
                    type: 'string',
                    description: 'Jira Account ID of the user the execution is assigned to (optional).',
                },
                bug_keys: {
                    type: 'array',
                    description: 'Jira issue keys to attach to the execution as bugs (e.g. ["PROJ-789"]). Each key is resolved to a numeric ID via the Jira REST API (requires JIRA_USERNAME + JIRA_API_TOKEN) and linked via POST /testexecutions/{key}/links/issues. Failures are reported as warnings and do not fail the call.',
                    items: { type: 'string' },
                },
            },
        },
    },
    {
        name: 'get_test_cycles_for_issue',
        description: 'Get the Zephyr test cycles linked to a Jira issue (e.g. a story or epic). Calls GET /issuelinks/{issueKey}/testcycles and, by default, resolves each numeric cycle ID to its key (e.g. "PROJ-R123") and name. Use this to discover the test cycle referenced by a Jira ticket, then feed the key into list_executions_by_cycle / update_test_execution. Cloud only.',
        inputSchema: {
            type: 'object',
            properties: {
                issue_key: {
                    type: 'string',
                    description: 'Jira issue key whose linked test cycles to fetch (e.g. "PROJ-123").',
                },
                resolve_keys: {
                    type: 'boolean',
                    description: 'When true (default), resolve each cycle ID to its key + name via GET /testcycles/{id}. Set false to return raw numeric IDs only (faster, no extra calls).',
                    default: true,
                },
            },
            required: ['issue_key'],
        },
    },
    {
        name: 'delete_test_run',
        description: 'Delete a specific test run (Data Center only — not supported on Cloud v2)',
        inputSchema: {
            type: 'object',
            properties: {
                test_run_key: {
                    type: 'string',
                    description: 'Test run key to delete (e.g., PROJ-R123)',
                },
            },
            required: ['test_run_key'],
        },
    },
    {
        name: 'add_test_cases_to_run',
        description: 'Add test cases to an existing test run (Cloud only — not supported on Data Center)',
        inputSchema: {
            type: 'object',
            properties: {
                test_run_key: {
                    type: 'string',
                    description: 'Test run key (e.g., PROJ-R161)',
                },
                test_case_keys: {
                    type: 'array',
                    description: 'Array of test case keys to add to the test run',
                    items: { type: 'string' }
                },
            },
            required: ['test_run_key', 'test_case_keys'],
        },
    },
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
                    minItems: 1,
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
    {
        name: 'get_test_script',
        description: 'Get the test script (PLAIN_TEXT or BDD content) for a specific test case. Zephyr stores BDD/plain-text test content under the test script resource, separate from STEP_BY_STEP steps — use get_test_case_steps instead for STEP_BY_STEP test cases (Cloud only).',
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
];
// MCP tool annotations (behavioral hints, protocol revision 2025-03-26+).
// Advisory only — clients use them for UX and safety, e.g. auto-approving
// read-only calls or confirming before a destructive delete. Every tool talks
// to the remote Zephyr/Jira API, so openWorldHint is true across the board.
const READ_ONLY = { readOnlyHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
const TOOL_ANNOTATIONS = {
    // Reads
    get_test_case: READ_ONLY,
    get_folders: READ_ONLY,
    get_test_run_cases: READ_ONLY,
    get_test_run: READ_ONLY,
    get_test_execution: READ_ONLY,
    search_test_cases_by_folder: READ_ONLY,
    search_test_runs: READ_ONLY,
    list_executions_by_cycle: READ_ONLY,
    get_test_cycles_for_issue: READ_ONLY,
    get_test_case_steps: READ_ONLY,
    get_projects: READ_ONLY,
    get_statuses: READ_ONLY,
    get_priorities: READ_ONLY,
    get_environments: READ_ONLY,
    get_test_script: READ_ONLY,
    get_test_case_links: READ_ONLY,
    get_test_cases_linked_to_issue: READ_ONLY,
    get_test_cycle_links: READ_ONLY,
    get_test_execution_links: READ_ONLY,
    get_test_executions_linked_to_issue: READ_ONLY,
    search_test_cases: READ_ONLY,
    // Non-destructive writes (create / update / append)
    create_test_case: WRITE,
    update_test_case_bdd: WRITE,
    create_folder: WRITE,
    create_test_run: WRITE,
    update_test_run: WRITE,
    add_test_cases_to_run: WRITE,
    update_test_execution: WRITE,
    update_test_case_steps: WRITE,
    update_test_case_custom_fields: WRITE,
    update_test_case_name: WRITE,
    update_test_case_precondition_objective: WRITE,
    move_test_case_folder: WRITE,
    create_test_case_web_link: WRITE,
    create_test_case_issue_link: WRITE,
    create_test_cycle_web_link: WRITE,
    create_test_cycle_issue_link: WRITE,
    create_test_execution_issue_link: WRITE,
    // Destructive
    delete_test_case: DESTRUCTIVE,
    delete_test_run: DESTRUCTIVE,
};
for (const tool of toolSchemas) {
    const annotations = TOOL_ANNOTATIONS[tool.name];
    if (annotations)
        tool.annotations = annotations;
}
