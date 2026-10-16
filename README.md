# Zephyr Scale MCP Server

Model Context Protocol server for Zephyr Scale test management, supporting both **Jira Cloud and Data Center**. Create, read, and manage test cases through the Atlassian REST API with **official API-compliant schemas**. Access live test case data, example payloads, and file resources through a unified resource system.

**No MCP allowed in your org?** The same tools ship as an agent skill with a standalone CLI that works in Claude Code, GitHub Copilot, and other agents. See [Using Without MCP (Agent Skill)](#using-without-mcp-agent-skill).

## What's different from the original

This is a fork of [Milo0821/Zephyr_mcp_server](https://github.com/Milo0821/Zephyr_mcp_server) with additional tools that close gaps in STEP_BY_STEP test case management and test case search.

**The gap in the original:** `get_test_case` returns metadata but not step content. `update_test_case_bdd` is the only write path for test content, but it forces BDD/Gherkin format — silently converting STEP_BY_STEP test cases on write. There is no way to read or update existing step-by-step steps in place. Separately, the only search tool (`search_test_cases_by_folder`) requires an exact folder path — there's no way to find a test case by name.

**Added in this fork:**

| Tool | What it does |
|---|---|
| `get_test_case_steps` | Read existing STEP_BY_STEP steps for a test case, with `start_at`/`max_results` pagination. Returns the raw Zephyr API response. *(Cloud only)* |
| `update_test_case_steps` | Append or overwrite STEP_BY_STEP steps without touching metadata or converting format. Supports inline steps (`description`, `testData`, `expectedResult`) and call-to-test references (`testCaseKey`). Defaults to `APPEND` mode to avoid accidental data loss. *(Cloud only)* |
| `search_test_cases` | Search for test cases by a case-insensitive name substring within a project, optionally scoped to an exact folder. Neither Cloud nor Data Center offer server-side name search, so this fetches/queries then filters client-side, capped at 5000 scanned test cases per call. |

`get_test_case_steps` and `update_test_case_steps` are Cloud-only — the Zephyr Scale Data Center API v1 does not expose a dedicated `/teststeps` endpoint. `search_test_cases` works on both Cloud and Data Center.

**Also added in this fork.** The [Tools Reference](#tools-reference) has details on each one.

| Area | Tools |
|---|---|
| Targeted test case edits (Cloud + DC) | `update_test_case_name`, `update_test_case_precondition_objective`, `update_test_case_custom_fields`, `move_test_case_folder` |
| Test script content (Cloud + DC) | `get_test_script` |
| Project reference data *(Cloud only)* | `get_projects`, `get_statuses`, `get_priorities`, `get_environments` |
| Jira and web links *(Cloud only)* | `get_test_case_links`, `create_test_case_web_link`, `create_test_case_issue_link`, `get_test_cases_linked_to_issue`, `get_test_cycle_links`, `create_test_cycle_web_link`, `create_test_cycle_issue_link`, `get_test_execution_links`, `create_test_execution_issue_link`, `get_test_executions_linked_to_issue` |
| Non-MCP usage | An [agent skill and standalone CLI](#using-without-mcp-agent-skill) that expose every tool without an MCP client |

In total, this fork has 40 tools and upstream has 18.

---

## Features

- ✅ **Jira Cloud & Data Center Support**: Seamlessly connects to both Jira Cloud (using API v2) and self-hosted Data Center instances (using API v1) with automatic configuration detection.
- ✅ **Official API-Compliant Schemas**: Tools and data structures match the official Zephyr Scale REST API, ensuring compatibility and reliability.
- ✅ **Unified Test Case Creation**: A single `create_test_case` tool handles all script types (BDD, Step-by-Step, Plain Text) for a simplified workflow.
- ✅ **Full Test Lifecycle Management**: Comprehensive tools to create, read, delete test cases, and manage test runs, executions, and folders.
- ✅ **Execution Reporting & Jira Integration** *(Cloud)*: Report execution results (Pass/Fail/Blocked), attach bugs as Jira issue links, and discover the Zephyr test cycle linked to any Jira story or epic — bridging a Jira ticket straight to its executions.
- ✅ **Live Templating System**: Use real test cases from your Zephyr instance as templates (`zephyr://testcase/KEY`) to ensure consistency and correct project-specific fields.
- ✅ **Unified Resource System**: Access live Zephyr data, local files (`file://`), and built-in examples through a consistent URI-based system.
- ✅ **Works Without MCP**: An agent skill with a bundled CLI exposes every tool to Claude Code, GitHub Copilot, and any other agent that can run shell commands.

## Installation and Configuration

You can run the server using `npx` without installation, or install it globally from `npm`.

> **Note:** The `zephyr-scale-mcp-server` package on npm is published from the upstream repository, [Milo0821/Zephyr_mcp_server](https://github.com/Milo0821/Zephyr_mcp_server). Its tool set can differ from this fork's. To run exactly this fork, build it from source (`npm install && npm run build`) and point your MCP client at `node /path/to/Zephyr_mcp_server/build/index.js`. Alternatively, use the [agent skill](#using-without-mcp-agent-skill).

### Using npx (Recommended)
Configure your MCP client with the following structure.

**Jira Cloud:**
```json
{
  "mcpServers": {
    "zephyr-server": {
      "command": "npx",
      "args": ["zephyr-scale-mcp-server@latest"],
      "env": {
        "ZEPHYR_BASE_URL": "https://your-company.atlassian.net",
        "ZEPHYR_API_KEY": "your-zephyr-api-key",
        "JIRA_USERNAME": "your-email@company.com",
        "JIRA_API_TOKEN": "your-jira-api-token"
      }
    }
  }
}
```
> **Note**: `JIRA_USERNAME` and `JIRA_API_TOKEN` are optional. You need them for anything that links Jira issues on Cloud, such as `issue_links` and `bug_keys`, or the `create_*_issue_link` tools. Without them, issue linking will fail with a 401 warning (the test case is still created). Generate a Jira API token at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

**Jira Cloud (EU region):**
```json
{
  "mcpServers": {
    "zephyr-server": {
      "command": "npx",
      "args": ["zephyr-scale-mcp-server@latest"],
      "env": {
        "ZEPHYR_BASE_URL": "https://your-company.atlassian.net",
        "ZEPHYR_API_KEY": "your-zephyr-api-key",
        "JIRA_USERNAME": "your-email@company.com",
        "JIRA_API_TOKEN": "your-jira-api-token",
        "ZEPHYR_API_BASE_URL": "https://eu.api.zephyrscale.smartbear.com/v2"
      }
    }
  }
}
```

**Jira Data Center:**
```json
{
  "mcpServers": {
    "zephyr-server": {
      "command": "npx",
      "args": ["zephyr-scale-mcp-server@latest"],
      "env": {
        "ZEPHYR_BASE_URL": "https://your-jira-server.com",
        "ZEPHYR_API_KEY": "your-api-token"
      }
    }
  }
}
```

### Using global npm installation
First install the package globally:
```bash
npm install -g zephyr-scale-mcp-server
```
Then, update the `command` in your MCP configuration to `"command": "zephyr-scale-mcp"`.

## Using Without MCP (Agent Skill)

If your organization doesn't allow MCP servers, you can still use all 40 tools through an agent skill, in [`skills/zephyr-scale/`](skills/zephyr-scale/). The agent reads `SKILL.md` and runs the tools as ordinary shell commands. No MCP server or MCP client is involved.

| File | Purpose |
|---|---|
| `SKILL.md` | When to use the skill, how to call the tools, and the rules (platform limits, confirmation before deletes) |
| `scripts/zephyr.mjs` | Single-file bundled CLI. Needs Node 18 or later. No `npm install` |
| `references/tools.md` | Argument reference for every tool, generated from the tool schemas |
| `.env.example` | Credentials template. Copy it to `.env` in the same folder |
| `.gitignore` | Keeps `.env` out of git, even if the skill folder is committed to a repository |

The CLI works on its own too:

```bash
node skills/zephyr-scale/scripts/zephyr.mjs list                     # all tools
node skills/zephyr-scale/scripts/zephyr.mjs help create_test_case    # JSON schema for one tool
node skills/zephyr-scale/scripts/zephyr.mjs get_test_case '{"test_case_key":"PROJ-T123"}'
node skills/zephyr-scale/scripts/zephyr.mjs get_test_case @args.json       # JSON args from a file (best on Windows)
node skills/zephyr-scale/scripts/zephyr.mjs config                          # show which settings are set (secrets masked)
node skills/zephyr-scale/scripts/zephyr.mjs create_test_case <<'EOF'
{ "project_key": "PROJ", "name": "Login works", "test_script": { "type": "BDD", "text": "Given ...\nWhen ...\nThen ..." } }
EOF
```

Exit codes: `0` success, `1` Zephyr/Jira API error (message on stderr), `2` usage or configuration error.

### Credentials

The easiest way to configure credentials is a `.env` file inside the installed skill folder, next to `SKILL.md`. This works the same on Windows, macOS, and Linux, and for every agent.

1. Copy `.env.example` to `.env` in the installed skill folder:
   ```bash
   # macOS / Linux (Claude Code example; use your agent's skill path)
   cp ~/.claude/skills/zephyr-scale/.env.example ~/.claude/skills/zephyr-scale/.env
   ```
   ```powershell
   # Windows PowerShell (Copilot example)
   Copy-Item "$HOME\.copilot\skills\zephyr-scale\.env.example" "$HOME\.copilot\skills\zephyr-scale\.env"
   notepad "$HOME\.copilot\skills\zephyr-scale\.env"
   ```
2. Fill in at least `ZEPHYR_BASE_URL` and `ZEPHYR_API_KEY`. The template lists the optional settings. They're the same variables the MCP server uses, described under [Authentication](#authentication).
3. Check it with `node <skill folder>/scripts/zephyr.mjs config`. The command shows where each value came from and masks secrets.

How the CLI finds settings:

- **Environment variables win.** If `ZEPHYR_BASE_URL` and the other settings are already set in your shell, those values are used and the file only fills in what's missing. You can still use shell exports, Claude Code's `settings.json` `env` block, and the other usual methods instead.
- **`ZEPHYR_ENV_FILE`** points the CLI at a different file. Use it if you keep credentials elsewhere.
- **File format:** Plain `KEY=value` lines, with `#` comments, optional quotes, and an optional `export ` prefix. Windows Notepad's UTF-8 BOM and CRLF line endings are handled.

The skill folder's own `.gitignore` excludes `.env`, so it isn't committed even when the folder lives in a repository under `.github/skills/`. Each person creates their own `.env`. When you update the skill by copying a newer folder over the old one, your `.env` is kept, because the new folder doesn't contain one.

### Claude Code

Copy the folder to your personal skills directory:

```bash
cp -R skills/zephyr-scale ~/.claude/skills/zephyr-scale
```

To share it with one repository's team, put it in `.claude/skills/zephyr-scale/` in that repository instead. Claude loads the skill automatically when a request involves Zephyr test cases, cycles, or executions. You can also invoke it directly with `/zephyr-scale`.

### GitHub Copilot

Copilot supports the same `SKILL.md` format in agent mode in VS Code, the Copilot CLI, and the Copilot cloud agent. Copy the folder to one of these locations:

| Scope | Location |
|---|---|
| Personal (all your projects) | `~/.copilot/skills/zephyr-scale/` (`~/.agents/skills/` and `~/.claude/skills/` are also read) |
| One repository (shared with the team) | `.github/skills/zephyr-scale/` (`.agents/skills/` and `.claude/skills/` are also read) |

```bash
# personal
mkdir -p ~/.copilot/skills && cp -R skills/zephyr-scale ~/.copilot/skills/zephyr-scale
# or project-level, run from your test repository's root
mkdir -p .github/skills && cp -R /path/to/Zephyr_mcp_server/skills/zephyr-scale .github/skills/zephyr-scale
```

Notes for Copilot:

- **VS Code:** Use Copilot Chat in **Agent** mode, because Ask and Edit modes can't run terminal commands. Each `node .../zephyr.mjs` call goes through VS Code's terminal approval. You can auto-approve it with the terminal allow-list, but auto-approve read-only tools only. Confirm deletes yourself. The skill folder's `.env` works without restarting VS Code.
- **Copilot CLI:** Shell commands ask for approval unless you pre-approve them. Credentials come from the skill folder's `.env`, or from variables you export before you start `copilot`.
- **Cloud agent:** The cloud agent runs in a GitHub Actions sandbox. It doesn't have your local environment, and its firewall blocks most outbound hosts by default. Don't commit a `.env` for it. Provide the `ZEPHYR_*` values as secrets of the repository's `copilot` environment instead. You also need to allow your Jira host and `api.zephyrscale.smartbear.com` (or the EU host) in the cloud agent's firewall settings. Check GitHub's current Copilot cloud agent docs for the exact steps.
- To check that the skill is picked up, ask Copilot something like *"Using the zephyr-scale skill, get test case PROJ-T123"*.

See GitHub's docs on [creating skills for Copilot](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-skills) and [agent skills in VS Code](https://code.visualstudio.com/docs/copilot/customization/agent-skills).

### Other agents

Any agent that can read a Markdown file and run shell commands can use the skill, for example Codex or Gemini CLI. Point the agent at `SKILL.md`, or use that agent's skills directory if it has one.

### Keeping the skill up to date

`scripts/zephyr.mjs` and `references/tools.md` are generated by `npm run build` from `src/`. After you pull a newer version of this repository, rebuild and copy the folder again.

## Core Concepts

### Unified API
A single **`create_test_case` tool** supports all test script types (STEP_BY_STEP, PLAIN_TEXT, and BDD) through one interface. The server maps it to the right Zephyr Scale REST API for your platform: v2 on Cloud, v1 on Data Center.

### Jira Cloud vs. Data Center
The server automatically detects your Jira environment and uses the appropriate API version:
- **Jira Cloud**: Uses Zephyr Scale API v2.
- **Jira Data Center**: Uses Zephyr Scale API v1.

Some tools are platform-specific. For example, `add_test_cases_to_run` is only available on Cloud, as the Data Center API (v1) does not support modifying test runs after creation.

### Resource System
The server provides access to various resources through URI schemes:
- `zephyr://testcase/YOUR-TEST-CASE-KEY`: Fetch real test case data from your Zephyr instance to use as templates.
- `file:///absolute/path/to/your/file.json`: Read user-provided files.
- `zephyr://examples/...`: Access built-in example payloads.

## Tools Reference

### Test Case Management
- `get_test_case`: Get detailed information about a specific test case.
- `create_test_case`: Create test cases with STEP_BY_STEP, PLAIN_TEXT, or BDD content.
- `delete_test_case`: Delete a specific test case.
- `update_test_case_bdd`: Update an existing test case with BDD content (optionally update the test case name).
- `update_test_case_custom_fields`: Update one or more custom field values on an existing test case. Merges the given fields into the existing `customFields` object — fields not mentioned are left untouched.
- `move_test_case_folder`: Move an existing test case to a different folder. The destination folder must already exist (use `create_folder` first if needed). All other fields on the test case are preserved.
- `update_test_case_name`: Rename an existing test case. All other fields on the test case are preserved.
- `update_test_case_precondition_objective`: Update the precondition and/or objective on an existing test case. Provide at least one; the other is preserved if omitted. All other fields on the test case are preserved.
- `get_test_case_steps`: Get the STEP_BY_STEP test steps for a test case, with pagination. *(Cloud only)*
- `update_test_case_steps`: Append or overwrite STEP_BY_STEP test steps on an existing test case. Supports inline steps and call-to-test references. *(Cloud only)*

### Test Scripts
- `get_test_script`: Get the test script (PLAIN_TEXT or BDD content) for a test case — use this instead of `get_test_case_steps` for non-STEP_BY_STEP test cases.

### Test Run Management
- `create_test_run`: Create a new test run.
- `get_test_run`: Get detailed information about a specific test run, including resolved status name.
- `update_test_run`: Update an existing test cycle — set owner, name, description, dates, or status. *(Cloud only)*
- `get_test_run_cases`: Get test case keys from a test run.
- `add_test_cases_to_run`: Add test cases to an existing test run. *(Cloud only)*

### Test Execution & Search
- `get_test_execution`: Get detailed individual test execution results. On Data Center, `test_run_keys` is required.
- `list_executions_by_cycle`: List all test executions for a specific test cycle with status, executor, and date.
- `update_test_execution`: Update a test case execution's status within a cycle (Pass/Fail/etc.), add a comment, and attach bug(s) as Jira issue links. Identify the execution by `execution_id`, or by `test_cycle_key` + `test_case_key`. *(Cloud only)*
- `search_test_cases_by_folder`: Search for test cases in a specific folder. Automatically paginates through all results.
- `search_test_cases`: Search for test cases by a case-insensitive name substring within a project, optionally scoped to an exact folder. Filters client-side (neither platform offers server-side name search); capped at 5000 scanned test cases per call — check the `truncated` field in the response.
- `search_test_runs`: Search for test runs by project key and/or folder path.
- `get_test_cycles_for_issue`: Get the Zephyr test cycles linked to a Jira issue (story/epic). Resolves each cycle ID to its key (e.g. `PROJ-R123`) and name so you can feed it straight into `list_executions_by_cycle` / `update_test_execution`. *(Cloud only)*

### Organization
- `create_folder`: Create a new folder in Zephyr Scale.
- `get_folders`: List folders, optionally filtered by project, type, and path. When `folder_path` is given, returns the matching folder and its full subtree at every depth.

### Lookup & Reference Data
- `get_projects`: Get Zephyr projects. If `project_key_or_id` is given, fetches that single project instead of listing all. *(Cloud only)*
- `get_statuses`: Get statuses for test cases, test plans, test cycles, or test executions, optionally filtered by project and entity type. *(Cloud only)*
- `get_priorities`: Get priorities for test cases, optionally filtered by project. *(Cloud only)*
- `get_environments`: Get environments, optionally filtered by project. *(Cloud only)*

### Jira Links
- `get_test_case_links`: Get all links (Jira issue links and web links) associated with a test case. *(Cloud only)*
- `create_test_case_web_link`: Create a web link that associates a test case with a generic URL. *(Cloud only)*
- `create_test_case_issue_link`: Create a Jira issue link that associates a test case with a Jira issue. *(Cloud only)*
- `get_test_cases_linked_to_issue`: Get test case keys and versions linked to a given Jira issue. *(Cloud only)*
- `get_test_cycle_links`: Get all links (Jira issue links, web links, and test plan links) associated with a test cycle. *(Cloud only)*
- `create_test_cycle_web_link`: Create a web link that associates a test cycle with a generic URL. *(Cloud only)*
- `create_test_cycle_issue_link`: Create a Jira issue link that associates a test cycle with a Jira issue. *(Cloud only)*
- `get_test_execution_links`: Get Jira issue links associated with a test execution. Test executions do not support web links. *(Cloud only)*
- `create_test_execution_issue_link`: Create a Jira issue link that associates a test execution with a Jira issue. *(Cloud only)*
- `get_test_executions_linked_to_issue`: Get test execution IDs linked to a given Jira issue. Returns numeric IDs only, not keys. *(Cloud only)*

## Usage Examples

### Create a BDD Test Case with Issue Links
```json
{
  "project_key": "PROJ",
  "name": "User Authentication",
  "test_script": {
    "type": "BDD",
    "text": "Given a user with valid credentials\nWhen the user attempts to log in\nThen the user should be authenticated successfully"
  },
  "issue_links": ["PROJ-123", "PROJ-456"]
}
```
**Note**: `issue_links` requires `JIRA_USERNAME` and `JIRA_API_TOKEN` to be set (Cloud only). Link failures are reported as warnings — the test case is still created.

### Use a Live Test Case as a Template
1. Fetch an existing test case: `zephyr://testcase/PROJ-T123` (MCP), or the `get_test_case` tool (`node skills/zephyr-scale/scripts/zephyr.mjs get_test_case '{"test_case_key":"PROJ-T123"}'` with the skill).
2. Copy its structure (especially `customFields` and `folder`).
3. Create a new test case using the same project-specific configuration.

### Create a Test Run
```json
{
  "project_key": "PROJ",
  "name": "Sprint 1 Test Run",
  "test_case_keys": ["PROJ-T123", "PROJ-T124", "PROJ-T125"]
}
```

### Update an Existing BDD Test Case
```json
{
  "test_case_key": "PROJ-T123",
  "name": "Ensure the axial-flow pump is enabled",
  "bdd_content": "Feature: Pump Enablement\n\nScenario: Enable the pump\n  Given the system is powered on\n  When the operator enables the axial-flow pump\n  Then the pump should report as enabled"
}
```
**Note**: The server will convert markdown-style BDD into Gherkin when possible and will preserve all other existing test case fields.

### Mark an Execution as Failed and Attach a Bug
```json
{
  "test_cycle_key": "PROJ-R123",
  "test_case_key": "PROJ-T456",
  "status": "Fail",
  "comment": "Login button unresponsive on submit.",
  "bug_keys": ["PROJ-789"]
}
```
Or target an execution directly by key:
```json
{
  "execution_id": "PROJ-E123",
  "status": "Pass"
}
```
**Note**: `update_test_execution` is Cloud only. `bug_keys` requires `JIRA_USERNAME` and `JIRA_API_TOKEN`; link failures are reported as warnings while the status update still succeeds.

### Find the Test Cycle Linked to a Jira Ticket
```json
{
  "issue_key": "PROJ-6752"
}
```
Returns the linked cycles with resolved keys, e.g. `[{ "id": "110702963", "key": "PROJ-R467", "name": "..." }]`. This is the bridge from a Jira ticket to its Zephyr cycle — the association is stored on the Zephyr side, not in Jira's issue fields. Chain it: `get_test_cycles_for_issue` → `list_executions_by_cycle` → `update_test_execution`. Pass `"resolve_keys": false` to skip the per-cycle key/name lookup and return raw IDs only. **Cloud only.**

## Authentication

### Jira Cloud Configuration

| Variable | Required | Description |
|---|---|---|
| `ZEPHYR_BASE_URL` | ✅ | Your Jira Cloud URL, e.g. `https://your-company.atlassian.net` |
| `ZEPHYR_API_KEY` | ✅ | Zephyr Scale API key (JWT). Generate in Jira: profile picture (bottom left) → **Zephyr API keys** |
| `JIRA_USERNAME` | ⚠️ Optional* | Your Jira account email address |
| `JIRA_API_TOKEN` | ⚠️ Optional* | Jira API token. Generate at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `ZEPHYR_API_BASE_URL` | Optional | Override the Zephyr API base URL (e.g. for EU: `https://eu.api.zephyrscale.smartbear.com/v2`). Defaults to US endpoint. |
| `JIRA_TYPE` | Optional | Force `"cloud"` or `"datacenter"` — overrides auto-detection |

> **\* `JIRA_USERNAME` + `JIRA_API_TOKEN`**: Required on Cloud for anything that turns a Jira issue key into a link. This includes `issue_links` on `create_test_case` and `create_test_run`, `bug_keys` on `update_test_execution`, and the `create_test_case_issue_link`, `create_test_cycle_issue_link`, and `create_test_execution_issue_link` tools. The Zephyr API key can't authenticate against the Jira REST API, so a separate Jira credential is needed to resolve issue keys to numeric IDs. Without it, linking fails with a 401 warning. The main operation still succeeds.

### Jira Data Center Configuration

| Variable | Required | Description |
|---|---|---|
| `ZEPHYR_BASE_URL` | ✅ | Your Jira server URL, e.g. `https://your-jira-server.com` |
| `ZEPHYR_API_KEY` | ✅ | Zephyr Scale API token from your Jira profile settings |
| `JIRA_TYPE` | Optional | Set to `"datacenter"` to override auto-detection |

### Automatic Detection
The server automatically detects your Jira type based on `ZEPHYR_BASE_URL` — URLs containing `.atlassian.net` are treated as Cloud, everything else as Data Center. Override with `JIRA_TYPE="cloud"` or `JIRA_TYPE="datacenter"`.

## License

MIT
