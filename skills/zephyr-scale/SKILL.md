---
name: zephyr-scale
description: Use when working with Zephyr Scale test management in Jira (Cloud or Data Center) - reading, creating, updating, moving, or deleting test cases, test cycles/runs, test executions, folders, or links between tests and Jira issues (keys like PROJ-T123, PROJ-R45, PROJ-C12), especially when no Zephyr MCP server is available.
---

# Zephyr Scale

## Overview

`scripts/zephyr.mjs` is a self-contained Node CLI (Node >= 18, no install step) that exposes the 40 Zephyr Scale tools of the `zephyr-scale-mcp-server` package as shell commands. It talks to the Zephyr/Jira REST API directly. No MCP server or client is involved.

Paths below are relative to this skill's directory. Run them from there, or use the absolute path.

## Setup

The CLI reads these settings from the environment first. For anything not set there, it falls back to a `.env` file in this skill's folder, next to this file. To use a different file, set `ZEPHYR_ENV_FILE` to its path.

- Run `node scripts/zephyr.mjs config` to see which settings are set and where each comes from. Secrets are masked.
- If settings are missing, the CLI exits 2 with `Configuration error`. Ask the user to copy `.env.example` to `.env` and fill it in. Don't guess values. Don't ask for the API key in chat, and don't write it into the file yourself.
- Never print the contents of `.env`, and never commit it. The folder's `.gitignore` already excludes it.

| Variable | Required | Notes |
|---|---|---|
| `ZEPHYR_BASE_URL` | yes | Jira URL. `*.atlassian.net` means Cloud, anything else means Data Center |
| `ZEPHYR_API_KEY` | yes | Zephyr Scale API token (Cloud) or Jira PAT (Data Center) |
| `JIRA_TYPE` | no | `cloud` or `datacenter`. Overrides auto-detection |
| `ZEPHYR_API_BASE_URL` | no | Cloud region override, e.g. `https://eu.api.zephyrscale.smartbear.com/v2` |
| `JIRA_USERNAME`, `JIRA_API_TOKEN` | no | Cloud only. Needed by tools that turn a Jira issue key into its ID (`*_issue_link`, `issue_links` on create, `update_test_execution` bug links) |

## Invocation

```bash
node scripts/zephyr.mjs list                 # every tool + one-line description
node scripts/zephyr.mjs help <tool>          # full JSON input schema for one tool
node scripts/zephyr.mjs <tool> '<json>'      # simple args
node scripts/zephyr.mjs <tool> <<'EOF'       # nested or quoted args (bash/zsh): quoted heredoc
{ "project_key": "PROJ", "name": "Login works", "test_script": { "type": "BDD", "text": "Given ..." } }
EOF
node scripts/zephyr.mjs <tool> @args.json    # args from a file
node scripts/zephyr.mjs config               # check settings
```

**On Windows (PowerShell or cmd)**, don't pass JSON as a command-line argument, because PowerShell strips the inner quotes. Write the JSON to a temp file and pass it as `@path\to\args.json`.

Arguments are always a single JSON object whose keys are snake_case, exactly as the schema shows. Output goes to stdout (usually JSON). Exit codes: `0` ok, `1` API/tool error (message on stderr), `2` usage/config error.

The full argument tables are in `references/tools.md`. Check them, or run `help <tool>`, before you call a write tool for the first time.

## Quick reference

| Task | Tool |
|---|---|
| Read a test case / its steps / script | `get_test_case`, `get_test_case_steps`, `get_test_script` |
| Find test cases | `search_test_cases` (by name), `search_test_cases_by_folder` |
| Create a test case | `create_test_case` (STEP_BY_STEP, PLAIN_TEXT, BDD) |
| Edit a test case | `update_test_case_name`, `update_test_case_precondition_objective`, `update_test_case_custom_fields`, `update_test_case_bdd`, `update_test_case_steps`, `move_test_case_folder` |
| Folders | `get_folders`, `create_folder` |
| Test cycles (runs) | `create_test_run`, `get_test_run`, `get_test_run_cases`, `update_test_run`, `search_test_runs`, `add_test_cases_to_run` |
| Executions | `list_executions_by_cycle`, `get_test_execution`, `update_test_execution` (set status, comment, link bugs) |
| Jira issue → tests | `get_test_cases_linked_to_issue`, `get_test_cycles_for_issue`, `get_test_executions_linked_to_issue` |
| Links | `get_test_case_links`, `create_test_case_issue_link`, `create_test_case_web_link`, `get_test_cycle_links`, `create_test_cycle_*_link`, `get_test_execution_links`, `create_test_execution_issue_link` |
| Project reference data | `get_projects`, `get_statuses`, `get_priorities`, `get_environments` |
| Delete | `delete_test_case`, `delete_test_run` |

## Rules

- **Check the platform.** About half the tools are Cloud only. These include every link tool, `update_test_execution`, `add_test_cases_to_run`, `update_test_run`, the step tools, and the reference-data tools. On Data Center they return an error. The Platform column in `references/tools.md` lists every tool.
- **Copy an existing record as a template.** Before you create a test case, run `get_test_case` on a similar existing case and copy its `customFields`, `priority`, and folder conventions. Where a tool description mentions a `zephyr://testcase/KEY` resource, `get_test_case` is the equivalent.
- **Status/priority/environment values** must match names configured in the project. Use `get_statuses` / `get_priorities` / `get_environments` (Cloud) to look them up. New test cases are always created as `Draft`.
- **Update tools preserve everything else.** Each one reads the full record and writes it back, changing only the field you name. Use the narrowest tool for the change.
- **Destructive calls:** confirm with the user before you run `delete_test_case` or `delete_test_run`. Deletes are permanent.

## Common mistakes

| Symptom | Fix |
|---|---|
| `Invalid JSON arguments` | Shell quoting broke the JSON. Use the `<<'EOF'` heredoc form, or `@args.json` on Windows |
| `Configuration error` or `PLACEHOLDER` in `config` output | Run `config`. Ask the user to fill in `.env` next to `SKILL.md`, starting from `.env.example` |
| `Missing required argument(s)` | Run `help <tool>`. Keys are snake_case (`test_case_key`, not `testCaseKey`) |
| `Status: 400` mentioning status/priority | The value isn't configured in the project. Look it up first |
| Issue link fails with an auth or ID error | `JIRA_USERNAME` / `JIRA_API_TOKEN` are not set (Cloud) |
| Folder move fails with "not found" | Cloud needs an existing full path like `/Parent/Child`. Create it with `create_folder` first |
