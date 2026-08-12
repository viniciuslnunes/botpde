#!/usr/bin/env node
/**
 * Ver issue Jira: pnpm jira:view -- KEY-123
 * Flags extras passam ao acli (ex.: --json, --web, --fields summary,status).
 */
import { runAcli } from './resolve-acli.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`Uso: pnpm jira:view -- <KEY> [--json] [--web] [--fields ...]

Exemplo:
  pnpm jira:view -- PROJ-12
  pnpm jira:view -- PROJ-12 --web
`);
  process.exit(args.length === 0 ? 1 : 0);
}

runAcli(['jira', 'workitem', 'view', ...args]);
