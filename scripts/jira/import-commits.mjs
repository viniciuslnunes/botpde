#!/usr/bin/env node
/**
 * Importa commits de origin/main como Tarefas KAN (histórico).
 *
 * Custo (plano Free ≤10 users): NÃO há cobrança por quantidade de issues.
 * Ver docs/ops/jira-import-commits.md
 *
 * Uso:
 *   pnpm jira:import-commits -- --dry-run
 *   pnpm jira:import-commits -- --apply
 *   pnpm jira:import-commits -- --apply --max=50
 *   pnpm jira:import-commits -- --apply --since=2026-07-01
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAcli, loadJiraEnv } from './resolve-acli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = argv.includes('--dry-run') || !argv.includes('--apply');
const apply = argv.includes('--apply');

function flag(name, def = null) {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return def;
  return argv[i + 1];
}

const since = flag('--since', null);
const max = Number(flag('--max', '0')) || 0;
const delayMs = Number(flag('--delay-ms', '350')) || 350;
const statusDone = flag('--status', 'Done');

loadJiraEnv();
const project = process.env.JIRA_PROJECT?.trim() || 'KAN';
const acli = requireAcli();

const SKIP_RE =
  /^(chore\(release\)|Merge |merge: |.*\[skip ci\])/i;

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* sync throttle for acli rate limits */
  }
}

function gitLog() {
  const args = [
    'log',
    'origin/main',
    '--no-merges',
    '--format=%H%x09%h%x09%aI%x09%an%x09%s',
  ];
  if (since) args.push(`--since=${since}`);
  const out = execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [full, short, date, author, ...rest] = line.split('\t');
      return { full, short, date, author, subject: rest.join('\t') };
    })
    .filter((c) => c.subject && !SKIP_RE.test(c.subject));
}

function listExistingImportShas() {
  const set = new Set();
  try {
    const r = spawnSync(
      acli,
      [
        'jira',
        'workitem',
        'search',
        '--jql',
        `project = ${project} AND labels = "from-git" ORDER BY created DESC`,
        '--limit',
        '100',
        '--fields',
        'summary,description',
        '--paginate',
        '--json',
      ],
      { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
    );
    if (r.status !== 0) {
      console.warn('aviso: busca from-git falhou; pode duplicar em re-run');
      return set;
    }
    const data = JSON.parse((r.stdout || '').trim() || '[]');
    const issues = Array.isArray(data) ? data : data.issues || [];
    for (const i of issues) {
      const summary = i.fields?.summary || '';
      const m = summary.match(/\b([0-9a-f]{7,40})\b/i);
      if (m) set.add(m[1].toLowerCase());
      const desc = JSON.stringify(i.fields?.description || '');
      const m2 = desc.match(/commit[:\s]+([0-9a-f]{40})/i);
      if (m2) set.add(m2[1].toLowerCase());
      const m3 = desc.match(/\b([0-9a-f]{40})\b/);
      if (m3) set.add(m3[1].toLowerCase());
    }
  } catch (err) {
    console.warn('aviso: busca from-git:', err.message);
  }
  return set;
}

function adfFromText(text) {
  return {
    type: 'doc',
    version: 1,
    content: String(text)
      .split('\n')
      .map((line) =>
        line.length === 0
          ? { type: 'paragraph', content: [] }
          : {
              type: 'paragraph',
              content: [{ type: 'text', text: line.slice(0, 4000) }],
            },
      ),
  };
}

function createFromCommit(c) {
  const summary = `[git] ${c.subject}`.slice(0, 240);
  const description = [
    `Import automático do Git (histórico).`,
    ``,
    `commit: ${c.full}`,
    `short: ${c.short}`,
    `author: ${c.author}`,
    `date: ${c.date}`,
    `branch: origin/main`,
    ``,
    `Label: from-git · não conta como trabalho aberto de produto.`,
  ].join('\n');

  if (dryRun || !apply) {
    console.log(`[dry-run] ${c.short} ${c.subject}`);
    return null;
  }

  const payload = {
    projectKey: project,
    type: 'Tarefa',
    summary,
    description: adfFromText(description),
    labels: ['from-git', 'done-in-git'],
  };
  const tmp = path.join(root, `.tmp-jira-import-${c.short}.json`);
  writeFileSync(tmp, JSON.stringify(payload));
  try {
    const r = spawnSync(acli, ['jira', 'workitem', 'create', '--from-json', tmp, '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    });
    if (r.status !== 0) {
      console.error(`FAIL ${c.short}:`, (r.stderr || r.stdout || '').slice(0, 300));
      return null;
    }
    const created = JSON.parse((r.stdout || '{}').trim() || '{}');
    const key = created.key;
    console.log(`OK ${key} ← ${c.short}`);
    if (statusDone && key) {
      spawnSync(
        acli,
        ['jira', 'workitem', 'transition', '--key', key, '--status', statusDone, '--yes'],
        { cwd: root, encoding: 'utf8' },
      );
    }
    return key;
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

function main() {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Uso:
  pnpm jira:import-commits -- --dry-run
  pnpm jira:import-commits -- --apply
  pnpm jira:import-commits -- --apply --max=50 --since=2026-07-01
  pnpm jira:import-commits -- --apply --status=Concluído

Sem --apply, roda dry-run (não cria issues).
`);
    process.exit(0);
  }

  console.log(`Import commits → ${project}`);
  console.log(`mode: ${apply && !dryRun ? 'APPLY' : 'DRY-RUN'} since=${since || '(início)'} max=${max || 'all'}`);
  console.log(
    'Custo: plano Free (≤10 users) não cobra por nº de issues. Ver docs/ops/jira-import-commits.md',
  );

  let commits = gitLog();
  // oldest first (mais legível no board)
  commits = commits.reverse();
  if (max > 0) commits = commits.slice(0, max);

  console.log(`candidatos: ${commits.length}`);

  const existing = apply ? listExistingImportShas() : new Set();
  if (existing.size) console.log(`já importados (amostra labels from-git): ${existing.size} refs`);

  let created = 0;
  let skipped = 0;
  for (const c of commits) {
    if (
      existing.has(c.full.toLowerCase()) ||
      existing.has(c.short.toLowerCase())
    ) {
      skipped++;
      continue;
    }
    createFromCommit(c);
    created++;
    if (apply && delayMs > 0) sleep(delayMs);
  }

  console.log(`\nresumo: processados=${created} skipped=${skipped} total_candidatos=${commits.length}`);
  if (!apply) {
    console.log('Nada criado. Para aplicar: pnpm jira:import-commits -- --apply');
  } else {
    console.log(
      `Filtro board: labels != from-git  |  ou JQL: project = KAN AND labels = from-git`,
    );
    console.log(
      `Se transição "${statusDone}" falhou (workflow team-managed), issues ficam em "A fazer" com label done-in-git — mova em lote no UI.`,
    );
  }
}

main();
