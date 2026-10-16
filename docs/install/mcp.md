# Install the Zephyr Scale MCP server (agent guide)

You are an AI coding agent installing this fork's Zephyr Scale MCP server for your user, and registering it with their MCP client. Do the steps in order. Each step ends with a **Done when** check. Don't move on until it passes.

Repository: `https://github.com/kms-sonnguyen/Zephyr_mcp_server` (public, branch `main`). Install from source. The `zephyr-scale-mcp-server` package on npm is published from upstream and has fewer tools than this fork.

The commands below come in two forms: **sh** for macOS, Linux and Git Bash, and **PowerShell** for Windows. Use the one that matches your shell.

## 0. Confirm MCP is the right fit

If the user's organization blocks MCP servers, or they say MCP isn't allowed, follow [`skill.md`](skill.md) instead. It installs the same tools as an agent skill.

**Done when:** the user wants the MCP server and their client allows it.

## 1. Check prerequisites

Run `node -v` and `git --version`.

**Done when:** Node reports `v18` or higher, and git prints a version. If either is missing, stop here and tell the user what to install: Node from https://nodejs.org, git from https://git-scm.com.

## 2. Clone and build

Install into a stable folder the user keeps. The client starts the server from this path on every launch. From here on, `REPO_DIR` means its absolute path.

**sh**
```sh
REPO_DIR="$HOME/.zephyr-scale-mcp"
if [ -d "$REPO_DIR/.git" ]; then git -C "$REPO_DIR" pull --ff-only; else git clone https://github.com/kms-sonnguyen/Zephyr_mcp_server.git "$REPO_DIR"; fi
cd "$REPO_DIR" && npm install && npm run build
```

**PowerShell**
```powershell
$RepoDir = "$HOME\.zephyr-scale-mcp"
if (Test-Path "$RepoDir\.git") { git -C $RepoDir pull --ff-only } else { git clone https://github.com/kms-sonnguyen/Zephyr_mcp_server.git $RepoDir }
Set-Location $RepoDir; npm install; npm run build
```

If npm refuses with "configured to use pnpm", a parent folder's `package.json` sets `packageManager`. Rerun with the environment variable `COREPACK_ENABLE_STRICT=0` set.

**Done when:** `REPO_DIR/build/index.js` exists and `npm run build` ended without errors.

## 3. Set up credentials

The server reads its settings from `REPO_DIR/.env`, which git ignores. If a variable is already set in the environment, that value wins over the file. Keep the secrets in this file, so the client config holds only the command.

1. If `REPO_DIR/.env` already exists, keep it and go to the check at the end of this step.
2. Otherwise, copy `REPO_DIR/skills/zephyr-scale/.env.example` to `REPO_DIR/.env`.
3. Ask the user for their Jira URL and write it into `ZEPHYR_BASE_URL`. A Cloud URL looks like `https://company.atlassian.net`. Anything else is Data Center.
4. Ask the user to open `REPO_DIR/.env` in their editor and paste their API key into `ZEPHYR_API_KEY` themselves. Give them the full path.
   - **Cloud:** they create the key in Jira under profile picture → **Zephyr API keys**.
   - **Data Center:** the key is a Jira personal access token.

   Don't take the key in chat. Don't write it, echo it, or read the file back. The key stays between the user and the file.
5. For Cloud users who want to link Jira issues or bugs, tell them about the optional `JIRA_USERNAME` and `JIRA_API_TOKEN` lines in the same file.

The skill CLI in the same checkout reads its own `.env` from a different folder. To check this file, point the CLI at it explicitly:

```sh
ZEPHYR_ENV_FILE="REPO_DIR/.env" node "REPO_DIR/skills/zephyr-scale/scripts/zephyr.mjs" config
```
```powershell
$env:ZEPHYR_ENV_FILE = "$RepoDir\.env"; node "$RepoDir\skills\zephyr-scale\scripts\zephyr.mjs" config; Remove-Item Env:ZEPHYR_ENV_FILE
```

**Done when:** `config` shows `ZEPHYR_BASE_URL` with the user's URL and `ZEPHYR_API_KEY` as `********` plus four characters, with no line marked `PLACEHOLDER`.

## 4. Register the server with the client

Register the user's client. If you're unsure which one they use, ask. The server is always `node <REPO_DIR>/build/index.js`, with no env block. In JSON, write Windows paths with forward slashes, like `C:/Users/<name>/.zephyr-scale-mcp/build/index.js`.

**Claude Code**
```sh
claude mcp add zephyr-scale --scope user -- node "REPO_DIR/build/index.js"
```

**VS Code (Copilot agent mode).** This adds the server to the user profile:
```sh
code --add-mcp '{"name":"zephyr-scale","type":"stdio","command":"node","args":["REPO_DIR/build/index.js"]}'
```
Alternatively, add it to `.vscode/mcp.json` for one workspace. That file uses the top-level key `servers`:
```json
{ "servers": { "zephyr-scale": { "type": "stdio", "command": "node", "args": ["REPO_DIR/build/index.js"] } } }
```

**GitHub Copilot CLI**
```sh
copilot mcp add zephyr-scale -- node "REPO_DIR/build/index.js"
```
Alternatively, merge this into `~/.copilot/mcp-config.json`:
```json
{ "mcpServers": { "zephyr-scale": { "type": "local", "command": "node", "args": ["REPO_DIR/build/index.js"], "tools": ["*"] } } }
```

**Claude Desktop.** Merge this into `claude_desktop_config.json`. On macOS the file is in `~/Library/Application Support/Claude/`, and on Windows in `%APPDATA%\Claude\`:
```json
{ "mcpServers": { "zephyr-scale": { "command": "node", "args": ["REPO_DIR/build/index.js"] } } }
```

When you edit an existing config file, merge your entry into it and keep every other server the file already lists.

**Done when:** the client's config contains a `zephyr-scale` entry that points at the absolute `REPO_DIR/build/index.js`.

## 5. Verify

Reload the client: restart Claude Desktop, reload the VS Code window, or start a new Claude Code or Copilot CLI session. Check the server:

- **Claude Code:** `claude mcp list` shows `zephyr-scale` as connected.
- **Any client:** the tool list includes `get_test_case`, `create_test_case` and the other Zephyr tools, 40 in total.

Then call one read-only tool. On Cloud use `get_projects`. On Data Center use `get_test_case` with a key the user gives you.

**Done when:** the call returns data from the user's Zephyr instance. To fix failures:

| Symptom | Fix |
|---|---|
| Server fails to start or isn't connected | Run `node "REPO_DIR/build/index.js"` in a terminal. A `ZEPHYR_BASE_URL ... is required` error means step 3 isn't done. Any other crash means rerun step 2 |
| Tools missing after config change | Fully restart or reload the client |
| `Status: 401` | The key is wrong or expired. The user regenerates it and updates `REPO_DIR/.env` |
| `ENOTFOUND` / `ECONNREFUSED` | `ZEPHYR_BASE_URL` has a typo, or a proxy/VPN is needed. On Cloud EU, set `ZEPHYR_API_BASE_URL=https://eu.api.zephyrscale.smartbear.com/v2` |
| `only supported on Zephyr Scale Cloud` | The instance is Data Center. Verify with `get_test_case` instead |

## 6. Report

Tell the user:

- where the server is installed (`REPO_DIR`)
- which client config you changed
- that the credentials live in `REPO_DIR/.env`, which git ignores
- the result of the verification call

To update the server later, repeat step 2 and reload the client. Their `.env` is kept.
