#!/usr/bin/env node
/**
 * Status da instalação/auth acli.
 *   pnpm jira:status
 */
import { execFileSync } from 'node:child_process';
import { resolveAcli, loadJiraEnv, requireAcli } from './resolve-acli.mjs';

loadJiraEnv();

const bin = resolveAcli();
console.log('acli bin:', bin || '(não encontrado — rode pnpm acli:install)');
if (!bin) process.exit(1);

try {
  const ver = execFileSync(bin, ['-v'], { encoding: 'utf8' }).trim();
  console.log('version: ', ver);
} catch {
  try {
    const ver = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
    console.log('version: ', ver);
  } catch (err) {
    console.error('Falha ao ler versão:', err.message);
  }
}

console.log('JIRA_SITE   :', process.env.JIRA_SITE || '(não definido — copie docs/ops/jira.env.example → .env.jira)');
console.log('JIRA_PROJECT:', process.env.JIRA_PROJECT || '(não definido)');
console.log('JIRA_EMAIL  :', process.env.JIRA_EMAIL || process.env.ATLASSIAN_EMAIL || '(não definido)');

try {
  requireAcli();
  execFileSync(bin, ['jira', 'auth', 'status'], { stdio: 'inherit' });
} catch {
  console.log('\nSem sessão Jira. Rode: pnpm jira:auth');
  process.exitCode = 1;
}
