#!/usr/bin/env node
/**
 * Seed mínimo do projeto KAN: epics + decisões abertas + issue de smoke SR.
 *
 * Uso:
 *   pnpm jira:seed-kan
 *   pnpm jira:seed-kan -- --dry-run
 *
 * Idempotente por summary (busca JQL recente).
 * Types no site (PT): Epic, Tarefa, História, Bug, Função, Subtarefa.
 * Components: team-managed — criar no UI (lista em docs/ops/jira-kan.md).
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAcli, loadJiraEnv } from './resolve-acli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = argv.includes('--dry-run');

loadJiraEnv();
const project = process.env.JIRA_PROJECT?.trim() || 'KAN';
const acli = requireAcli();

const EPICS = [
  'Núcleo',
  'Associação',
  'Comunidade',
  'Loja',
  'Ops-Schema',
  'Infra',
  'TechDebt-Audit',
];

const DECISIONS = [
  {
    summary: '[decisão #7] Provedor de API de jogos',
    labels: ['needs-decision'],
    description: [
      'Fonte: docs/product/decisoes-abertas.md #7',
      '',
      'Opções: API-Football, TheSportsDB, outros; Wikidata spike.',
      'Google Sports/SERP descartado (2026-07-17).',
      'Ver docs/knowledge/futebol-dados-publicos.md',
    ].join('\n'),
  },
  {
    summary: '[decisão #11] Lock otimista no estoque da Loja',
    labels: ['needs-decision', 'loja'],
    description: [
      'Fonte: docs/product/decisoes-abertas.md #11',
      '',
      'version/lock otimista vs read-modify-write no estoque JSON.',
      'Risco de sobrescrita sob concorrência (auditoria loja 2026-07-16).',
    ].join('\n'),
  },
  {
    summary: '[decisão #12] Remover fazerPedido (deprecated)',
    labels: ['needs-decision', 'loja'],
    description: [
      'Fonte: docs/product/decisoes-abertas.md #12',
      '',
      'Remover quando não houver chamador do fluxo single-item.',
      'Hoje delega a adicionarAoCarrinho.',
    ].join('\n'),
  },
  {
    summary: '[decisão #13] Modelo de preço do SaaS vs mercado',
    labels: ['needs-decision'],
    description: [
      'Fonte: docs/product/decisoes-abertas.md #13',
      '',
      'Preço fixo vs faixa por sócios adimplentes.',
      'Benchmark: docs/knowledge/concorrentes-gestao.md',
    ].join('\n'),
  },
];

const OPEN_FINDINGS = [
  {
    summary: '[seed][audit §7.3] podeVerPost sem hierarquia/rivalidade',
    labels: ['audit-finding'],
    description:
      'ARCHITECTURE §7 item 3. Medir: pnpm --filter @torcida/web audit:achados',
  },
  {
    summary: '[seed][audit §7.4] alcanceNacional INSTITUCIONAL inerte',
    labels: ['audit-finding'],
    description:
      'ARCHITECTURE §7 item 4. Medir: pnpm --filter @torcida/web audit:achados',
  },
  {
    summary: '[seed][audit §7.5] MembroConversa órfão em canal privado',
    labels: ['audit-finding'],
    description:
      'ARCHITECTURE §7 item 5. Medir: pnpm --filter @torcida/web audit:achados',
  },
  {
    summary: '[seed][audit §7.7] Override negado não rege feed público',
    labels: ['audit-finding'],
    description:
      'ARCHITECTURE §7 item 7. Medir: pnpm --filter @torcida/web audit:achados',
  },
  {
    summary: '[seed][audit §7.10] Super admin portal só por cookie',
    labels: ['audit-finding'],
    description:
      'ARCHITECTURE §7 item 10. Medir: pnpm --filter @torcida/web audit:achados',
  },
];

function runJson(args) {
  const r = spawnSync(acli, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `acli exit ${r.status}`);
  }
  const out = (r.stdout || '').trim();
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
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
              content: [{ type: 'text', text: line }],
            },
      ),
  };
}

function listExistingSummaries() {
  try {
    const r = spawnSync(
      acli,
      [
        'jira',
        'workitem',
        'search',
        '--jql',
        `project = ${project} ORDER BY created DESC`,
        '--limit',
        '100',
        '--fields',
        'key,summary',
        '--json',
      ],
      { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
    );
    if (r.status !== 0) {
      console.warn('aviso: busca JQL falhou; seed pode duplicar:', (r.stderr || '').slice(0, 200));
      return new Set();
    }
    const data = JSON.parse((r.stdout || '').trim() || '[]');
    const issues = Array.isArray(data) ? data : data.issues || data.values || [];
    return new Set(
      issues.map((i) => i.fields?.summary || i.summary).filter(Boolean),
    );
  } catch (err) {
    console.warn('aviso: busca JQL falhou; seed pode duplicar:', err.message);
    return new Set();
  }
}

function createIssue({ type, summary, description, labels }) {
  if (dryRun) {
    console.log(`[dry-run] ${type}: ${summary}`);
    return null;
  }
  const payload = {
    projectKey: project,
    type,
    summary,
    description: adfFromText(description || summary),
    labels: labels || [],
  };
  const tmp = path.join(root, `.tmp-jira-seed-${Date.now()}.json`);
  writeFileSync(tmp, JSON.stringify(payload, null, 2));
  try {
    const result = runJson(['jira', 'workitem', 'create', '--from-json', tmp, '--json']);
    const key = result?.key || result?.fields?.key || result;
    console.log(`OK ${type}: ${summary} → ${typeof key === 'string' ? key : JSON.stringify(key)?.slice(0, 80)}`);
    return result;
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

function main() {
  console.log(`Seed KAN structure → project=${project} dryRun=${dryRun}`);
  const existing = listExistingSummaries();
  if (existing.size) console.log(`Já no board (amostra): ${existing.size} issues recentes`);

  for (const name of EPICS) {
    const summary = `[seed] Epic: ${name}`;
    if (existing.has(summary)) {
      console.log(`skip epic: ${summary}`);
      continue;
    }
    createIssue({
      type: 'Epic',
      summary,
      description: `Epic seed Torcida — ${name}. Ver docs/ops/jira-kan.md`,
      labels: ['seed'],
    });
  }

  for (const d of DECISIONS) {
    if (existing.has(d.summary)) {
      console.log(`skip decisão: ${d.summary}`);
      continue;
    }
    createIssue({
      type: 'Tarefa',
      summary: d.summary,
      description: d.description,
      labels: d.labels,
    });
  }

  for (const f of OPEN_FINDINGS) {
    if (existing.has(f.summary)) {
      console.log(`skip finding: ${f.summary}`);
      continue;
    }
    createIssue({
      type: 'Bug',
      summary: f.summary,
      description: f.description,
      labels: f.labels,
    });
  }

  // Smoke issue for ScriptRunner manual apply
  const smokeSummary = '[seed][smoke-sr] Aplicar Behaviours/Listeners ScriptRunner';
  if (!existing.has(smokeSummary)) {
    createIssue({
      type: 'Tarefa',
      summary: smokeSummary,
      description: [
        'Checklist ScriptRunner (docs/ops/jira-scriptrunner.md):',
        '',
        '1. Colar behaviour-dod-create.js (Create)',
        '2. Colar behaviour-schema-transition.js (Transition)',
        '3. Listener listener-label-audit.groovy',
        '4. Listener listener-critical-notify.groovy',
        '5. Salvar filtros jql-filters.md',
        '6. Testar Create Story vazia → DoD aparece',
        '7. Apagar este issue e outros smoke-sr',
      ].join('\n'),
      labels: ['smoke-sr', 'seed'],
    });
  } else {
    console.log(`skip smoke: ${smokeSummary}`);
  }

  console.log('\nComponents: criar no UI do KAN (team-managed) — lista em docs/ops/jira-kan.md');
  console.log('Pronto.');
}

main();
