#!/usr/bin/env node
/**
 * Edita issue: pnpm jira:edit -- --key KEY-123 --summary "..." [--yes]
 */
import { runAcli, loadJiraEnv } from './resolve-acli.mjs';

loadJiraEnv();
const args = process.argv.slice(2).filter((a) => a !== '--');

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`Uso: pnpm jira:edit -- --key KEY-123 [--summary "..."] [--description "..."] [--assignee @me] [--yes]

Exemplos:
  pnpm jira:edit -- --key VIN-42 --summary "Novo título" --yes
  pnpm jira:edit -- --key VIN-42 --assignee @me --yes
`);
  process.exit(args.length === 0 ? 1 : 0);
}

if (!args.includes('--key') && !args.includes('-k') && !args.includes('--jql') && !args.includes('--filter')) {
  console.error('Informe --key, --jql ou --filter.');
  process.exit(1);
}

runAcli(['jira', 'workitem', 'edit', ...args]);
