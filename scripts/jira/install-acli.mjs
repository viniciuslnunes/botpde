#!/usr/bin/env node
/**
 * Baixa o Atlassian CLI (acli) para tools/ conforme a plataforma.
 *
 * Uso: pnpm acli:install
 * Env: ACLI_FORCE=1 para baixar de novo mesmo se já existir.
 */
import { createWriteStream, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const toolsDir = path.join(root, 'tools');
const force = process.env.ACLI_FORCE === '1' || process.argv.includes('--force');

function target() {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === 'win32') {
    const slug = arch === 'arm64' ? 'acli_windows_arm64' : 'acli_windows_amd64';
    return {
      url: `https://acli.atlassian.com/windows/latest/${slug}/acli.exe`,
      out: path.join(toolsDir, 'acli.exe'),
    };
  }
  if (plat === 'darwin') {
    const slug = arch === 'arm64' ? 'acli_darwin_arm64' : 'acli_darwin_amd64';
    return {
      url: `https://acli.atlassian.com/darwin/latest/${slug}/acli`,
      out: path.join(toolsDir, 'acli'),
    };
  }
  // linux
  const slug = arch === 'arm64' ? 'acli_linux_arm64' : 'acli_linux_amd64';
  return {
    url: `https://acli.atlassian.com/linux/latest/${slug}/acli`,
    out: path.join(toolsDir, 'acli'),
  };
}

async function main() {
  const { url, out } = target();
  mkdirSync(toolsDir, { recursive: true });
  if (existsSync(out) && !force) {
    console.log(`Já instalado: ${path.relative(root, out)}`);
    console.log('Use ACLI_FORCE=1 ou --force para baixar de novo.');
    process.exit(0);
  }
  console.log(`Baixando ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    console.error(`Download falhou: HTTP ${res.status}`);
    process.exit(1);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  if (process.platform !== 'win32') {
    chmodSync(out, 0o755);
  }
  console.log(`OK → ${path.relative(root, out)}`);
  console.log('Auth: pnpm jira:auth');
  console.log('Doc:  docs/ops/acli-jira.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
