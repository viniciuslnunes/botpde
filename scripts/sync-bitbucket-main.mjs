#!/usr/bin/env node
/**
 * Traz bitbucket/main para a main local e (opcionalmente) faz push em origin.
 *
 * Uso:
 *   node scripts/sync-bitbucket-main.mjs --dry-run
 *   node scripts/sync-bitbucket-main.mjs
 *   node scripts/sync-bitbucket-main.mjs --no-push
 *
 * Pré-requisitos: remote `bitbucket` e acesso de leitura ao workspace.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = argv.includes('--dry-run');
const noPush = argv.includes('--no-push');

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function gitOk(args) {
  try {
    return git(args);
  } catch (err) {
    const stderr = err?.stderr?.toString?.() ?? String(err);
    throw new Error(stderr || String(err));
  }
}

function hasRemote(name) {
  try {
    gitOk(['remote', 'get-url', name]);
    return true;
  } catch {
    return false;
  }
}

function ensureBitbucketRemote() {
  const url = 'https://bitbucket.org/setorize-torcidas/botpde.git';
  if (!hasRemote('bitbucket')) {
    gitOk(['remote', 'add', 'bitbucket', url]);
    console.log(`remote bitbucket adicionado → ${url}`);
  }
}

function main() {
  if (!existsSync(path.join(root, '.git'))) {
    console.error('Não é um repositório git.');
    process.exit(1);
  }

  ensureBitbucketRemote();

  console.log('fetch origin…');
  try {
    gitOk(['fetch', 'origin']);
  } catch (err) {
    console.error('Falha no fetch origin:', err.message);
    process.exit(1);
  }

  console.log('fetch bitbucket…');
  try {
    gitOk(['fetch', 'bitbucket']);
  } catch (err) {
    console.error('Falha no fetch bitbucket:', err.message);
    console.error(
      '\nSem acesso ao workspace setorize-torcidas? Peça membership/App Password\n' +
        'e veja docs/ops/git-remotes.md.',
    );
    process.exit(1);
  }

  let bbMain;
  try {
    bbMain = gitOk(['rev-parse', 'bitbucket/main']);
  } catch {
    console.error('Ref bitbucket/main não encontrada após o fetch.');
    process.exit(1);
  }

  const originMain = gitOk(['rev-parse', 'origin/main']);
  const localMain = gitOk(['rev-parse', 'main']);

  console.log(`origin/main     ${originMain.slice(0, 8)}`);
  console.log(`bitbucket/main  ${bbMain.slice(0, 8)}`);
  console.log(`main (local)    ${localMain.slice(0, 8)}`);

  const ahead = gitOk(['rev-list', '--count', 'origin/main..bitbucket/main']);
  const behind = gitOk(['rev-list', '--count', 'bitbucket/main..origin/main']);
  console.log(`\nbitbucket está +${ahead} / -${behind} vs origin/main`);

  if (ahead === '0') {
    console.log('Nada a herdar: bitbucket/main não está à frente de origin/main.');
    process.exit(0);
  }

  console.log('\nCommits só no Bitbucket:');
  console.log(gitOk(['log', '--oneline', 'origin/main..bitbucket/main']));

  if (dryRun) {
    console.log('\n--dry-run: sem merge/push.');
    process.exit(0);
  }

  const branch = gitOk(['branch', '--show-current']);
  if (branch !== 'main') {
    console.error(`Checkout em '${branch}'. Mude para main antes do sync.`);
    process.exit(1);
  }

  const dirty = gitOk(['status', '--porcelain']);
  if (dirty) {
    console.error('Working tree suja. Commit/stash antes do sync.');
    process.exit(1);
  }

  console.log('\nmerge bitbucket/main…');
  try {
    execFileSync('git', ['merge', '--no-ff', 'bitbucket/main', '-m', 'merge: herdar main do Bitbucket (setorize-torcidas)'], {
      cwd: root,
      stdio: 'inherit',
    });
  } catch {
    console.error('Merge falhou (conflitos?). Resolva e rode de novo ou finalize o merge à mão.');
    process.exit(1);
  }

  if (noPush) {
    console.log('Merge local ok. --no-push: faça `git push origin main` quando quiser.');
    process.exit(0);
  }

  console.log('push origin main…');
  execFileSync('git', ['push', 'origin', 'main'], { cwd: root, stdio: 'inherit' });
  console.log('Pronto — Railway / Actions devem ver o push em origin/main.');
}

main();
