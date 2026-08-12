#!/usr/bin/env node
/**
 * Cria issue Jira: pnpm jira:create -- --summary "..." [--project KEY] [--type Task]
 *
 * Env: JIRA_PROJECT (default do --project se omitido), JIRA_SITE só para auth (ver docs).
 */
import { runAcli } from './resolve-acli.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--');

function flagValue(flags, name) {
  const i = flags.indexOf(name);
  if (i === -1 || i === flags.length - 1) return null;
  return flags[i + 1];
}

function hasFlag(flags, name) {
  return flags.includes(name);
}

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`Uso: pnpm jira:create -- --summary "Título" [--project KEY] [--type Task] [flags acli...]

Env:
  JIRA_PROJECT  projeto padrão se --project omitido

Exemplos:
  pnpm jira:create -- --summary "Corrigir deploy Railway" --type Task
  JIRA_PROJECT=VIN pnpm jira:create -- --summary "Bug na loja" --type Bug
`);
  process.exit(args.length === 0 ? 1 : 0);
}

const forwarded = [...args];
if (!hasFlag(forwarded, '--project') && !hasFlag(forwarded, '-p')) {
  const project = process.env.JIRA_PROJECT?.trim();
  if (!project) {
    console.error('Informe --project <KEY> ou defina JIRA_PROJECT.');
    process.exit(1);
  }
  forwarded.push('--project', project);
}
if (!hasFlag(forwarded, '--type') && !hasFlag(forwarded, '-t')) {
  forwarded.push('--type', process.env.JIRA_ISSUE_TYPE?.trim() || 'Tarefa');
}
if (!flagValue(forwarded, '--summary') && !flagValue(forwarded, '-s')) {
  console.error('Obrigatório: --summary "..."');
  process.exit(1);
}

runAcli(['jira', 'workitem', 'create', ...forwarded]);
