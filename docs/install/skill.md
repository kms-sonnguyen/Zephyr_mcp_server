# Install the Zephyr Scale skill (agent guide)

You are an AI coding agent installing the `zephyr-scale` agent skill for your user. The skill lets you manage Zephyr Scale test cases, cycles and executions by running a bundled Node CLI. It needs no MCP server, so it works in organizations that block MCP. Do the steps in order. Each step ends with a **Done when** check. Don't move on until it passes.

Repository: `https://github.com/kms-sonnguyen/Zephyr_mcp_server` (public, branch `main`). The skill is the folder `skills/zephyr-scale/`.

The commands below come in two forms: **sh** for macOS, Linux and Git Bash, and **PowerShell** for Windows. Use the one that matches your shell.

## 1. Check prerequisites

Run `node -v` and `git --version`.

**Done when:** Node reports `v18` or higher, and git prints a version. If Node is missing or older, stop here and tell the user to install Node 18 or later from https://nodejs.org. If only git is missing, use the archive download shown in step 3.

## 2. Pick the install folder

Pick the skills directory for the agent you are, at personal scope (every project). Use project scope only when the user asks for it to be shared through one repository.

| Agent | Personal scope | Project scope (from the repo root) |
|---|---|---|
| Claude Code | `~/.claude/skills/zephyr-scale` | `.claude/skills/zephyr-scale` |
| GitHub Copilot (VS Code agent mode, Copilot CLI) | `~/.copilot/skills/zephyr-scale` | `.github/skills/zephyr-scale` |
| Any other agent | `~/.agents/skills/zephyr-scale` | `.agents/skills/zephyr-scale` |

On Windows, `~` is `$HOME` (for example `C:\Users\<name>`).

From here on, `SKILL_DIR` means the absolute path you picked.

**Done when:** you have one absolute `SKILL_DIR`, and you've told the user which path you chose.

## 3. Copy the skill folder

Download a fresh copy into a temporary folder. Then copy the whole folder into `SKILL_DIR`. Copying over an existing install updates it and keeps the user's `.env`, because the download doesn't contain one.

**sh**
```sh
SKILL_DIR="$HOME/.claude/skills/zephyr-scale"   # use your path from step 2
TMP="$(mktemp -d)"
git clone --depth 1 https://github.com/kms-sonnguyen/Zephyr_mcp_server.git "$TMP/repo"
mkdir -p "$SKILL_DIR"
cp -R "$TMP/repo/skills/zephyr-scale/." "$SKILL_DIR/"
rm -rf "$TMP"
```

**PowerShell**
```powershell
$SkillDir = "$HOME\.copilot\skills\zephyr-scale"   # use your path from step 2
$Tmp = Join-Path $env:TEMP "zephyr-skill-$(Get-Random)"
git clone --depth 1 https://github.com/kms-sonnguyen/Zephyr_mcp_server.git "$Tmp\repo"
New-Item -ItemType Directory -Force $SkillDir | Out-Null
Copy-Item -Recurse -Force "$Tmp\repo\skills\zephyr-scale\*" $SkillDir
Copy-Item -Force "$Tmp\repo\skills\zephyr-scale\.env.example", "$Tmp\repo\skills\zephyr-scale\.gitignore" $SkillDir
Remove-Item -Recurse -Force $Tmp
```

The PowerShell version copies the two dot-files explicitly, because `*` can skip hidden files.

Without git, download `https://github.com/kms-sonnguyen/Zephyr_mcp_server/archive/refs/heads/main.zip` instead. Extract it, then copy `Zephyr_mcp_server-main/skills/zephyr-scale/` the same way.

**Done when:** `SKILL_DIR` contains `SKILL.md`, `scripts/zephyr.mjs`, `references/tools.md`, `.env.example` and `.gitignore`.

## 4. Set up credentials

The CLI reads its settings from a `.env` file in `SKILL_DIR`. If a variable is already set in the environment, that value wins over the file.

1. If `SKILL_DIR/.env` already exists, keep it and go to the check at the end of this step.
2. Otherwise, copy `SKILL_DIR/.env.example` to `SKILL_DIR/.env`.
3. Ask the user for their Jira URL and write it into `ZEPHYR_BASE_URL`. A Cloud URL looks like `https://company.atlassian.net`. Anything else is Data Center.
4. Ask the user to open `SKILL_DIR/.env` in their editor and paste their API key into `ZEPHYR_API_KEY` themselves. Give them the full path.
   - **Cloud:** they create the key in Jira under profile picture → **Zephyr API keys**.
   - **Data Center:** the key is a Jira personal access token.

   Don't take the key in chat. Don't write it, echo it, or read the file back. The key stays between the user and the file.
5. For Cloud users who want to link Jira issues or bugs, tell them about the optional `JIRA_USERNAME` and `JIRA_API_TOKEN` lines in the same file.

Then run:

```sh
node "SKILL_DIR/scripts/zephyr.mjs" config
```

**Done when:** `config` shows `ZEPHYR_BASE_URL` with the user's URL and `ZEPHYR_API_KEY` as `********` plus four characters, with no line marked `PLACEHOLDER`, both marked `[from env file]` or `[from environment]`.

## 5. Verify against Zephyr

Run `node "SKILL_DIR/scripts/zephyr.mjs" list`. It should print 40 tools.

Then make one read-only call:

- **Cloud:** `node "SKILL_DIR/scripts/zephyr.mjs" get_projects '{}'`
- **Data Center, or if the user gives you a test case key:** `get_test_case` with that key. Put the JSON in a file and pass `@path/to/args.json` on PowerShell, because PowerShell strips the quotes from inline JSON.

**Done when:** the read call exits 0 and prints JSON from the user's Zephyr instance. To fix failures:

| Output | Fix |
|---|---|
| `Configuration error` | Back to step 4. Run `config` to see what's missing |
| `Status: 401` | The key is wrong or expired. The user regenerates it and updates `.env` |
| `ENOTFOUND` / `ECONNREFUSED` | `ZEPHYR_BASE_URL` has a typo, or a proxy/VPN is needed. On Cloud EU, set `ZEPHYR_API_BASE_URL=https://eu.api.zephyrscale.smartbear.com/v2` |
| `only supported on Zephyr Scale Cloud` | The instance is Data Center. Verify with `get_test_case` instead |

## 6. Report

Tell the user:

- where the skill is installed (`SKILL_DIR`)
- that the credentials live in `SKILL_DIR/.env`, which git ignores
- the result of the verification call
- that they can now ask for things like "get test case PROJ-T123" or "mark PROJ-T45 failed in cycle PROJ-R12"

If the agent's skill list doesn't show `zephyr-scale` yet, tell them to start a new session.

To update the skill later, repeat step 3. Their `.env` is kept.
