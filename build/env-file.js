/**
 * Minimal .env support for the CLI (cli.ts), so users — especially on Windows,
 * where editing shell profiles is awkward — can keep credentials in one file.
 * Node 18 has no built-in loader (process.loadEnvFile is 20.12+), hence this parser.
 *
 * Lookup: $ZEPHYR_ENV_FILE if set, else `.env` in the parent of the directory
 * holding the running script:
 *   - skill CLI:  skills/zephyr-scale/scripts/zephyr.mjs → skills/zephyr-scale/.env
 *     (the skill folder ships a .gitignore covering it)
 *   - MCP server: build/index.js → <repo root>/.env (covered by the root .gitignore)
 * Variables already present in process.env always win over the file.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function defaultEnvFilePath() {
    return resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
}
export function envFilePath() {
    return process.env.ZEPHYR_ENV_FILE?.trim() || defaultEnvFilePath();
}
/**
 * Parses KEY=VALUE lines. Supports `#` comments, an optional `export ` prefix,
 * single quotes (literal), double quotes (with \n escapes), and trailing
 * ` # comment` on unquoted values. A UTF-8 BOM (Notepad) is stripped.
 */
export function parseEnv(text) {
    const out = {};
    for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#'))
            continue;
        const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m)
            continue;
        const [, key, rest] = m;
        let value;
        if (rest.startsWith('"')) {
            const end = rest.indexOf('"', 1);
            value = (end === -1 ? rest.slice(1) : rest.slice(1, end)).replace(/\\n/g, '\n');
        }
        else if (rest.startsWith("'")) {
            const end = rest.indexOf("'", 1);
            value = end === -1 ? rest.slice(1) : rest.slice(1, end);
        }
        else {
            value = rest.replace(/\s+#.*$/, '').trim();
        }
        out[key] = value;
    }
    return out;
}
/** Loads the env file into process.env without overriding existing variables. */
export function loadEnvFile() {
    const path = envFilePath();
    if (!existsSync(path))
        return { path, found: false, applied: [] };
    const values = parseEnv(readFileSync(path, 'utf8'));
    const applied = [];
    for (const [key, value] of Object.entries(values)) {
        if (process.env[key] === undefined) {
            process.env[key] = value;
            applied.push(key);
        }
    }
    return { path, found: true, applied };
}
