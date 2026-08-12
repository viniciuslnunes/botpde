#!/usr/bin/env node
/**
 * Transiciona issue: pnpm jira:transition -- --key KEY-123 --status "In Progress"
 */
import { runAcli } from './resolve-acli.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');

function hasFlag(flags, name) {
  return flags.includes(name);
}

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`Uso: pnpm jira:transition -- --key KEY-123 --status "Done" [--yes]

Exemplos:
  pnpm jira:transition -- --key PROJ-12 --status "In Progress" --yes
  pnpm jira:transition -- --key PROJ-12,PROJ-13 --status Done --yes
`);
  process.exit(args.length === 0 ? 1 : 0);
}

if (!hasFlag(args, '--key') && !hasFlag(args, '-k')) {
  console.error('Obrigatório: --key <KEY>');
  process.exit(1);
}
if (!hasFlag(args, '--status') && !hasFlag(args, '-s')) {
  console.error('Obrigatório: --status <nome>');
  process.exit(1);
}

runAcli(['jira', 'workitem', 'transition', ...args]);
