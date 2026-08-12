#!/usr/bin/env node
/**
 * Autentica no Jira via acli.
 *
 *   pnpm jira:auth              → OAuth no browser (--web)
 *   pnpm jira:auth -- --token   → lê ATLASSIAN_API_TOKEN / stdin (precisa JIRA_SITE + e-mail)
 *
 * Env: JIRA_SITE, JIRA_EMAIL (ou ATLASSIAN_EMAIL)
 */
import { runAcli, loadJiraEnv } from './resolve-acli.mjs';

loadJiraEnv();
const args = process.argv.slice(2).filter((a) => a !== '--');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Uso:
  pnpm jira:auth
  pnpm jira:auth -- --token
  pnpm jira:auth -- --web

Env para --token:
  JIRA_SITE              ex. setorize.atlassian.net
  JIRA_EMAIL             e-mail da conta Atlassian
  ATLASSIAN_API_TOKEN    token (ou pipe via stdin)

Doc: docs/ops/acli-jira.md
`);
  process.exit(0);
}

const useToken = args.includes('--token');
if (useToken) {
  const site = process.env.JIRA_SITE?.trim();
  const email = (process.env.JIRA_EMAIL || process.env.ATLASSIAN_EMAIL || '').trim();
  const token = process.env.ATLASSIAN_API_TOKEN?.trim();
  if (!site || !email) {
    console.error('Para --token defina JIRA_SITE e JIRA_EMAIL (ver docs/ops/jira.env.example).');
    process.exit(1);
  }
  if (!token && process.stdin.isTTY) {
    console.error('Defina ATLASSIAN_API_TOKEN ou faça: echo TOKEN | pnpm jira:auth -- --token');
    process.exit(1);
  }
  const loginArgs = ['jira', 'auth', 'login', '--site', site, '--email', email, '--token'];
  if (token) {
    const { spawnSync } = await import('node:child_process');
    const { requireAcli } = await import('./resolve-acli.mjs');
    const bin = requireAcli();
    const r = spawnSync(bin, loginArgs, {
      input: `${token}\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
      encoding: 'utf8',
    });
    process.exit(r.status ?? 1);
  }
  runAcli(loginArgs);
  process.exit(0);
}

// default: web OAuth
runAcli(['jira', 'auth', 'login', '--web', ...args.filter((a) => a !== '--web' && a !== '--token')]);
