#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toolSchemas } from './tool-schemas.js';
import { ZephyrToolHandlers } from './tool-handlers.js';
import { createToolDispatch, ToolFn } from './dispatch.js';
import { resourceList, readResource, setAxiosInstance } from './resources.js';
import { createJiraConfig } from './utils.js';
import { loadEnvFile } from './env-file.js';

// Read version from package.json (../ relative to build/index.js at runtime) so
// it always matches the published package rather than drifting on each release.
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
);

class ZephyrServer {
  private server: Server;
  private toolHandlers: ZephyrToolHandlers;
  private dispatch: Record<string, ToolFn>;

  constructor() {
    // Same .env fallback as the CLI: $ZEPHYR_ENV_FILE, else <package root>/.env.
    // Lets MCP client configs omit secrets; real env vars still win.
    const envFile = loadEnvFile();
    if (envFile.found) console.error(`[zephyr] loaded settings from ${envFile.path}`);
    const jiraConfig = createJiraConfig();

    this.server = new Server(
      {
        name: 'zephyr-server',
        version: pkg.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    const axiosInstance = axios.create({
      baseURL: jiraConfig.baseUrl,
      headers: jiraConfig.authHeaders,
    });
    
    setAxiosInstance(axiosInstance);

    this.toolHandlers = new ZephyrToolHandlers(axiosInstance, jiraConfig);
    this.dispatch = createToolDispatch(this.toolHandlers);
    this.setupToolHandlers();
    this.setupResourceHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolSchemas,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const args = request.params.arguments || {};
        
        const handler = this.dispatch[request.params.name];
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
        return await handler(args);
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: resourceList,
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return await readResource(request.params.uri);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Zephyr MCP server running on stdio');
  }
}

const server = new ZephyrServer();
server.run().catch(console.error);
