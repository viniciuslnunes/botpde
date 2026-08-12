/**
 * Resolve o binário acli: PATH, tools/acli.exe (Windows) ou tools/acli.
 * Carrega `.env.jira` da raiz (gitignored) se existir.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let envLoaded = false;

/** Lê docs/ops/jira.env.example → copie para `.env.jira` na raiz. */
export function loadJiraEnv() {
  if (envLoaded) return;
  envLoaded = true;
  const file = path.join(root, '.env.jira');
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function which(cmd) {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split(/\r?\n/).find(Boolean)?.trim() || null;
  } catch {
    return null;
  }
}

export function resolveAcli() {
  const candidates = [
    path.join(root, 'tools', 'acli.exe'),
    path.join(root, 'tools', 'acli'),
    path.join(root, 'acli.exe'),
    path.join(root, 'acli'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return which('acli') || which('acli.exe');
}

export function requireAcli() {
  const bin = resolveAcli();
  if (!bin) {
    console.error(
      'acli não encontrado.\n' +
        'Rode: pnpm acli:install\n' +
        'Doc: docs/ops/acli-jira.md\n' +
        'https://developer.atlassian.com/cloud/acli/guides/install-windows/',
    );
    process.exit(1);
  }
  return bin;
}

export function runAcli(args, opts = {}) {
  loadJiraEnv();
  const bin = requireAcli();
  execFileSync(bin, args, { stdio: 'inherit', cwd: root, ...opts });
}
