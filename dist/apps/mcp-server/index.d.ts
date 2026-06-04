#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

declare function createServer(): Promise<Server>;

export { createServer };
