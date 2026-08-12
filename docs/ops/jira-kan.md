# Jira KAN — SETORIZE TORCIDAS

Site: [setorize-torcidas.atlassian.net](https://setorize-torcidas.atlassian.net) ·
projeto **KAN** ([board](https://setorize-torcidas.atlassian.net/jira/software/projects/KAN)).

CLI: [`acli-jira.md`](acli-jira.md) · ScriptRunner: [`jira-scriptrunner.md`](jira-scriptrunner.md).

## Papel do Jira vs git

| Em Jira (fluxo / priorização) | Em git (fonte da verdade) |
|---|---|
| Epics, stories, bugs, decisões abertas | `schema.prisma`, `permissions.js` |
| Status do board, labels, components | Specs `docs/data/**`, `docs/knowledge/**` |
| Gate `schema` / Schema pending | `docs/ops/schema-deploy.md` + Actions |
| Achados §7 como bugs `audit-finding` | `pnpm --filter @torcida/web audit:achados` (status medido) |
| Fix Version informativo | Versão `1.<main>.<all>` (`docs/ops/release.md`) |

VIN-* é histórico de commits antigos. **Chave viva = KAN.**

## Types de issue (site PT)

`Epic` · `Tarefa` · `História` · `Bug` · `Função` · `Subtarefa`

`pnpm jira:create` usa `Tarefa` por padrão.

`Backlog → Ready → In Progress → In Review → QA → Schema pending → In Homolog → Done`

Team-managed: renomear/criar colunas no board para espelhar (especialmente
**Schema pending** e **In Homolog**).

## Components

| Component | Escopo |
|---|---|
| `web` | `apps/web` |
| `bot` | `apps/bot` |
| `db-schema` | Prisma / push |
| `authz-rbac` | permissões, cargos |
| `comunidade` | feed, canais, CN |
| `loja` | catálogo, checkout |
| `associacao` | membros, admissão |
| `eventos` | agenda, caravana, bateria |
| `departamentos` | gov, áreas, projetos |
| `financeiro-bar` | caixa + PDV |
| `super-admin` | plataforma |
| `ops-ci` | CI, Railway, audits |
| `knowledge` | docs/knowledge |

Seed: `pnpm jira:seed-kan` ([`scripts/jira/seed-kan-structure.mjs`](../../scripts/jira/seed-kan-structure.mjs)).

## Labels

| Label | Uso |
|---|---|
| `audit-finding` | Achado ARCHITECTURE §7 / audit |
| `schema` | PR/issue toca `schema.prisma` |
| `perf` | performance |
| `lge` | LGE / dados sensíveis |
| `needs-decision` | decisão de produto aberta |
| `hold-evidence` | não reabrir sem evidência |

## Epics seed

Núcleo · Associação · Comunidade · Loja · Ops-Schema · Infra · TechDebt-Audit

## DoD (colar em Story/Bug)

Espelha o agente `qa-verification`:

1. Mutação admin chama `assertPermission`
2. `AuditLog` onde for mutação administrativa
3. UI: vazio / erro / loading
4. Queries SaaS filtram `tenantId`
5. Retorno Prisma tipado (sem `any`)
6. Se schema mudou: label `schema` + seguir `schema-deploy.md`
7. Perf: não introduzir polling cego / N+1 óbvio no feed

ScriptRunner pré-preenche isso no Create — ver receitas.

## Convenção commit / PR

```text
feat(comunidade): indicador ao vivo (KAN-42)
fix(loja): … (KAN-108)

Branch: feat/KAN-42-live-indicator
PR:     [KAN-42] …
```

GitHub = deploy (Railway). Bitbucket = espelho pair — `pnpm sync:bitbucket` ([`git-remotes.md`](git-remotes.md)).

## O que migrar (ordem)

1. Decisões abertas (`docs/product/decisoes-abertas.md` #7, #11–13) — seed automático
2. Epics acima
3. Achados §7 ainda `EM ABERTO` como Bug + `audit-finding` (manual ou lote futuro)
4. Stories do roadmap sob demanda (não dump massivo)

## O que não migrar

ARCHITECTURE §5 fechado, knowledge, module specs, audits executáveis, prompts de agentes, fórmula de versão / workflows GitHub.
