#!/usr/bin/env node
/**
 * Alinha `main` entre GitHub (`origin`) e Bitbucket — fluxo único de pair programming.
 *
 * - O Railway/CI só veem o GitHub; os dois remotes devem ficar no mesmo tip.
 * - Prioridade: o tip mais avançado (união dos dois). Nunca force-push.
 *
 * Uso:
 *   pnpm sync:bitbucket -- --dry-run
 *   pnpm sync:bitbucket
 *   pnpm sync:bitbucket -- --no-push
 *
 * Auth Bitbucket: `BITBUCKET_API_TOKEN` em `.env.jira`
 * (scopes: read:repository:bitbucket + write:repository:bitbucket).
 * Ver docs/ops/git-remotes.md.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = argv.includes('--dry-run');
const noPush = argv.includes('--no-push');

function loadEnvJira() {
  const file = path.join(root, '.env.jira');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
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

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
    env: opts.env ?? process.env,
    ...opts,
  }).trim();
}

function gitOk(args, opts = {}) {
  try {
    return git(args, opts);
  } catch (err) {
    const stderr = err?.stderr?.toString?.() ?? String(err);
    throw new Error(stderr || String(err));
  }
}

function gitInherit(args, opts = {}) {
  execFileSync('git', args, {
    cwd: root,
    stdio: 'inherit',
    env: opts.env ?? process.env,
  });
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

function bitbucketAuthArgs() {
  const token = process.env.BITBUCKET_API_TOKEN?.trim();
  if (!token) return [];
  const basic = Buffer.from(`x-bitbucket-api-token-auth:${token}`).toString('base64');
  return [
    '-c',
    `http.https://bitbucket.org/.extraheader=Authorization: Basic ${basic}`,
  ];
}

function fetchBitbucket() {
  const auth = bitbucketAuthArgs();
  if (auth.length) console.log('fetch bitbucket (BITBUCKET_API_TOKEN)…');
  else console.log('fetch bitbucket…');
  gitOk([...auth, 'fetch', 'bitbucket']);
}

function pushBitbucket() {
  const auth = bitbucketAuthArgs();
  if (auth.length) console.log('push bitbucket main (BITBUCKET_API_TOKEN)…');
  else console.log('push bitbucket main…');
  gitInherit([...auth, 'push', 'bitbucket', 'main']);
}

function count(range) {
  return gitOk(['rev-list', '--count', range]);
}

function shortLog(range) {
  try {
    return gitOk(['log', '--oneline', range]);
  } catch {
    return '';
  }
}

function assertCleanMain() {
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
}

function mergeRef(ref, message) {
  console.log(`merge ${ref}…`);
  try {
    gitInherit(['merge', '--no-ff', ref, '-m', message]);
  } catch {
    console.error(
      'Merge falhou (conflitos?). Resolva, finalize o merge e rode o sync de novo.',
    );
    process.exit(1);
  }
}

function main() {
  loadEnvJira();

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

  try {
    fetchBitbucket();
  } catch (err) {
    console.error('Falha no fetch bitbucket:', err.message);
    console.error(
      '\nPrecisa de BITBUCKET_API_TOKEN no .env.jira com scopes\n' +
        'read:repository:bitbucket e write:repository:bitbucket.\n' +
        'Ver docs/ops/git-remotes.md.',
    );
    process.exit(1);
  }

  let bbMain;
  let originMain;
  try {
    bbMain = gitOk(['rev-parse', 'bitbucket/main']);
    originMain = gitOk(['rev-parse', 'origin/main']);
  } catch {
    console.error('Refs origin/main ou bitbucket/main ausentes após o fetch.');
    process.exit(1);
  }

  const localMain = gitOk(['rev-parse', 'main']);
  const bbOnly = count('origin/main..bitbucket/main');
  const ghOnly = count('bitbucket/main..origin/main');

  console.log(`origin/main     ${originMain.slice(0, 8)}`);
  console.log(`bitbucket/main  ${bbMain.slice(0, 8)}`);
  console.log(`main (local)    ${localMain.slice(0, 8)}`);
  console.log(`\nvs: bitbucket +${bbOnly} commits só nele · github +${ghOnly} commits só nele`);

  const equal = originMain === bbMain;
  const needMergeBb = bbOnly !== '0';
  const needPushBb = ghOnly !== '0' || needMergeBb;
  const needPushGh = needMergeBb;

  if (equal) {
    console.log('\nRemotes já alinhados (mesmo tip).');
    if (localMain !== originMain) {
      console.log('Local main difere do tip remoto — fast-forward local sugerido.');
      if (!dryRun) {
        assertCleanMain();
        try {
          gitInherit(['merge', '--ff-only', 'origin/main']);
        } catch {
          console.error(
            'Não deu ff-only em origin/main. Faça merge/rebase local e rode de novo.',
          );
          process.exit(1);
        }
      }
    }
    if (dryRun) console.log('\n--dry-run: nada a fazer nos remotes.');
    else console.log('Pronto — pair sync ok.');
    process.exit(0);
  }

  if (bbOnly !== '0') {
    console.log('\nSó no Bitbucket:');
    console.log(shortLog('origin/main..bitbucket/main') || '(vazio)');
  }
  if (ghOnly !== '0') {
    console.log('\nSó no GitHub:');
    console.log(shortLog('bitbucket/main..origin/main') || '(vazio)');
  }

  const plan = [];
  if (needMergeBb) {
    plan.push('1) atualizar local main com origin/main (ff se possível)');
    plan.push('2) merge bitbucket/main → main (união; tip mais completo)');
  } else {
    plan.push('1) garantir local main = origin/main');
  }
  if (needPushGh && !noPush) plan.push('3) push origin main (Railway/CI)');
  if (needPushBb && !noPush) plan.push('4) push bitbucket main (espelho pair)');

  console.log('\nPlano:');
  for (const step of plan) console.log(`  ${step}`);

  if (dryRun) {
    console.log('\n--dry-run: sem merge/push.');
    process.exit(0);
  }

  assertCleanMain();

  // Trazer local para origin antes de unir o Bitbucket
  if (localMain !== originMain) {
    console.log('alinhar local → origin/main…');
    try {
      gitInherit(['merge', '--ff-only', 'origin/main']);
    } catch {
      // divergiu localmente: merge sem ff
      mergeRef('origin/main', 'merge: alinhar main local com origin (pair sync)');
    }
  }

  if (needMergeBb) {
    mergeRef(
      'bitbucket/main',
      'merge: unir Bitbucket ↔ GitHub (pair sync setorize-torcidas)',
    );
  }

  if (noPush) {
    console.log(
      'Merge local ok. --no-push: rode sem a flag (ou push origin + bitbucket à mão).',
    );
    process.exit(0);
  }

  const tip = gitOk(['rev-parse', 'main']);
  if (tip !== originMain) {
    console.log('push origin main…');
    gitInherit(['push', 'origin', 'main']);
  } else {
    console.log('origin/main já no tip — skip push GitHub.');
  }

  if (tip !== bbMain || needMergeBb || ghOnly !== '0') {
    try {
      pushBitbucket();
    } catch (err) {
      console.error(
        '\nPush no Bitbucket falhou. Confirme write:repository:bitbucket no token.\n' +
          String(err?.message || err),
      );
      process.exit(1);
    }
  }

  // Re-fetch e confirmar igualdade
  gitOk(['fetch', 'origin']);
  fetchBitbucket();
  const o2 = gitOk(['rev-parse', 'origin/main']);
  const b2 = gitOk(['rev-parse', 'bitbucket/main']);
  console.log(`\nTips finais: origin=${o2.slice(0, 8)} bitbucket=${b2.slice(0, 8)}`);
  if (o2 !== b2) {
    console.error('Ainda divergentes após o sync — investigue permissões/proteção de branch.');
    process.exit(1);
  }
  console.log('Pronto — GitHub e Bitbucket alinhados. Railway só reage ao push no GitHub.');
}

main();
