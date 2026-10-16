#!/usr/bin/env node
/**
 * Command-line entry point exposing every MCP tool without an MCP client.
 * Used by the `zephyr-scale` agent skill (skills/zephyr-scale) for orgs that
 * cannot enable MCP servers.
 *
 *   zephyr list                       # tool names + one-line descriptions
 *   zephyr help <tool>                # tool description + JSON input schema
 *   zephyr <tool> '<json args>'       # run a tool, args as an argument
 *   zephyr <tool> < args.json         # run a tool, args on stdin
 *   zephyr <tool> @args.json          # run a tool, args from a file (PowerShell-safe)
 *   zephyr config                     # show where settings come from (secrets masked)
 *
 * Credentials come from the environment, falling back to a .env file
 * (see env-file.ts) so Windows users don't have to edit shell profiles.
 *
 * Exit codes: 0 success, 1 tool/API error, 2 usage or configuration error.
 */
import axios from 'axios';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { toolSchemas } from './tool-schemas.js';
import { ZephyrToolHandlers } from './tool-handlers.js';
import { createToolDispatch } from './dispatch.js';
import { createJiraConfig } from './utils.js';
import { loadEnvFile } from './env-file.js';
import { readFileSync } from 'node:fs';
const USAGE = `Usage:
  zephyr list                    List all tools
  zephyr help <tool>             Show a tool's description and JSON input schema
  zephyr <tool> '<json>'         Run a tool with JSON arguments
  zephyr <tool> < args.json      Run a tool with JSON arguments from stdin
  zephyr <tool> @args.json       Run a tool with JSON arguments from a file
  zephyr config                  Show which settings are set and where from

Settings: ZEPHYR_BASE_URL, ZEPHYR_API_KEY (required); JIRA_TYPE,
ZEPHYR_API_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN (optional).
Read from the environment, then from the .env file at $ZEPHYR_ENV_FILE or,
by default, .env in the skill folder (next to SKILL.md).`;
const SETTINGS = ['ZEPHYR_BASE_URL', 'ZEPHYR_API_KEY', 'JIRA_TYPE', 'ZEPHYR_API_BASE_URL', 'JIRA_USERNAME', 'JIRA_API_TOKEN'];
const SECRETS = new Set(['ZEPHYR_API_KEY', 'JIRA_API_TOKEN']);
function fail(message, code) {
    process.stderr.write(message.endsWith('\n') ? message : message + '\n');
    process.exit(code);
}
function findSchema(name) {
    const schema = toolSchemas.find((t) => t.name === name);
    if (!schema) {
        fail(`Unknown tool: ${name}\nRun "zephyr list" to see available tools.`, 2);
    }
    return schema;
}
async function readStdin() {
    if (process.stdin.isTTY)
        return '';
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}
function readArgsFile(path) {
    try {
        return readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    }
    catch (e) {
        fail(`Cannot read arguments file ${path}: ${e instanceof Error ? e.message : String(e)}`, 2);
    }
}
async function parseArgs(raw) {
    const source = raw?.startsWith('@') ? readArgsFile(raw.slice(1)) : raw;
    const text = (source ?? (await readStdin())).trim();
    if (!text)
        return {};
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (e) {
        fail(`Invalid JSON arguments: ${e instanceof Error ? e.message : String(e)}`, 2);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        fail('JSON arguments must be an object, e.g. {"test_case_key":"PROJ-T1"}', 2);
    }
    return parsed;
}
function checkRequired(schema, args) {
    const required = schema.inputSchema.required ?? [];
    const missing = required.filter((k) => args[k] === undefined || args[k] === null);
    if (missing.length) {
        fail(`Missing required argument(s) for ${schema.name}: ${missing.join(', ')}\nRun "zephyr help ${schema.name}" for the schema.`, 2);
    }
}
function loadSettings() {
    const result = loadEnvFile();
    if (!result.found && process.env.ZEPHYR_ENV_FILE?.trim()) {
        fail(`ZEPHYR_ENV_FILE points to a file that does not exist: ${result.path}`, 2);
    }
    return result;
}
function printConfig(env) {
    const lines = [`env file: ${env.path} (${env.found ? 'found' : 'not found'})`];
    for (const key of SETTINGS) {
        const value = process.env[key];
        if (value === undefined || value === '') {
            lines.push(`${key}: (not set)`);
            continue;
        }
        const shown = SECRETS.has(key) ? `${'*'.repeat(8)}${value.slice(-4)}` : value;
        lines.push(`${key}: ${shown} [from ${env.applied.includes(key) ? 'env file' : 'environment'}]`);
    }
    process.stdout.write(lines.join('\n') + '\n');
}
async function main() {
    const [command, rawArgs] = process.argv.slice(2);
    if (command === 'config') {
        printConfig(loadSettings());
        return;
    }
    if (!command || command === '--help' || command === '-h') {
        process.stdout.write(USAGE + '\n');
        return;
    }
    if (command === 'list') {
        for (const t of toolSchemas) {
            process.stdout.write(`${t.name}\t${t.description.split('\n')[0]}\n`);
        }
        return;
    }
    if (command === 'help') {
        if (!rawArgs)
            fail('Usage: zephyr help <tool>', 2);
        const schema = findSchema(rawArgs);
        process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
        return;
    }
    const schema = findSchema(command);
    const args = await parseArgs(rawArgs);
    checkRequired(schema, args);
    const env = loadSettings();
    let jiraConfig;
    try {
        jiraConfig = createJiraConfig();
    }
    catch (e) {
        fail(`Configuration error: ${e instanceof Error ? e.message : String(e)}\n` +
            `Set it in the environment or in ${env.path}${env.found ? '' : ' (file not found)'}. Run "zephyr config" to check.`, 2);
    }
    const axiosInstance = axios.create({
        baseURL: jiraConfig.baseUrl,
        headers: jiraConfig.authHeaders,
    });
    const dispatch = createToolDispatch(new ZephyrToolHandlers(axiosInstance, jiraConfig));
    try {
        const result = await dispatch[schema.name](args);
        const text = (result?.content ?? []).map((c) => c.text ?? '').join('\n');
        if (result?.isError)
            fail(text, 1);
        process.stdout.write(text + '\n');
    }
    catch (e) {
        // McpError prefixes messages with "MCP error <code>: ", which is noise outside MCP.
        const message = e instanceof McpError || e instanceof Error ? e.message.replace(/^MCP error -?\d+: /, '') : String(e);
        fail(`Error: ${message}`, 1);
    }
}
main();
