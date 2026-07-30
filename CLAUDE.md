# CLAUDE.md — Torcida SaaS

Guia curto para trabalhar neste repositório. Detalhe arquitetural em `ARCHITECTURE.md`;
produto e roadmap em `docs/`; time de agentes em `.claude/agents/` (ver `docs/agents/README.md`);
conhecimento do nicho (torcidas, alianças, governança, lei) em `docs/knowledge/`.
Performance web: `ARCHITECTURE.md` §5.6 e §5.6.1; Comunidade (feed/timeline/busca):
`docs/data/modulo-comunidade-performance.md` (inclui **ganhos estimados por
cenário %**, live UX: ping pós-fan-out / auto-refetch no topo, **engajamento
overlay** 2026-07-17: sem `revalidatePath` do feed em reação/comentário,
**publish + nav-back** 2026-07-17: prepend otimista / chrome no layout /
`React.cache` salas·tenant, e **busca** 2026-07-17: `modo=rapida` + SQL
`GROUP BY` — sem `DISTINCT`+`similarity`); **Agenda** 2026-07-17:
`docs/data/modulo-eventos.md` + `ARCHITECTURE.md` §5.11; agente `performance`
para auditorias novas. Investimento em infra (faixas A–D, ads, 1ª carga):
`docs/ops/plano-investimento-infra.md` — agentes `performance` +
`product-strategy`. Seed de dados de teste em volume (Corinthians, e futura
escala nacional): `docs/ops/plano-teste-volume-dados.md`.

## O que é

SaaS operacional multi-tenant para torcidas organizadas de futebol. Hierarquia
Sede → Subsede → PDE, RBAC por tenant, comunicados/eventos/loja, bot Discord legado.
Em produção no Railway; em evolução.

## Monorepo (pnpm + Turborepo)

```
apps/
  web/     Next.js 16 (App Router, RSC/Server Actions), React 19, NextAuth v5, Tailwind v4
  bot/     Discord.js 14 (JS puro), acesso a dados via `pg` cru (legado)
packages/
  db/      Prisma 6 — schema.prisma (fonte única do modelo); client + getDbForTenant()
  types/   Zod schemas, permissions.js (RBAC), visibility.js (visibilidade cross-tenant)
  ui/      componentes React (CSS variables) + services
```

## Comandos

```bash
pnpm install
pnpm dev                              # turbo dev (todos os apps)
pnpm --filter @torcida/web dev        # só web
pnpm --filter @torcida/web lint
pnpm --filter @torcida/web test       # Vitest (RBAC, rate-limit, visibilidade)
pnpm --filter @torcida/db db:generate # prisma generate
pnpm --filter @torcida/db db:push     # sincroniza schema (NÃO há migrations)
pnpm --filter @torcida/db db:enable-pg-trgm  # extensão + índices busca Comunidade
pnpm --filter @torcida/db seed:loja-gavioes  # catálogo demo Gaviões (tenant pde-gavioes-fiel)
pnpm --filter @torcida/db seed:torcedores-estimados  # IBOPE Top 50 + teto 10 mil (offline)
pnpm --filter @torcida/db coleta:ibope-ranking -- --validate  # cobertura Top 50
pnpm --filter @torcida/db audit:regras       # invariantes de negócio + matriz de relações
pnpm --filter @torcida/web audit:dados       # auditoria funcional (código real × banco semeado)
pnpm --filter @torcida/web audit:fluxos      # fluxos ponta a ponta (Server Actions reais; muta e reverte)
pnpm --filter @torcida/web audit:fluxos-avancados  # regras ainda não cobertas (eventos, bar, RBAC, grupos)
pnpm --filter @torcida/web audit:hierarquia  # Sede→Subsede→PDE (promover, excluir, reatribuir)
pnpm --filter @torcida/web audit:notificacoes # fan-out, reconciliação de leitura, escopo
pnpm --filter @torcida/web audit:mensageria  # DM: segregação por rivalidade, bloqueio, solicitação
pnpm --filter @torcida/web audit:loja        # cupom, estoque (inclui concorrência), pedido, seguir
```

CI roda `tsc --noEmit` + `eslint` em todo PR. Deploy: push em `main` → Railway.

## Convenções (obrigatórias)

- **Autorização**: toda Server Action de mutação chama `assertPermission(PERMISSION)`
  (`apps/web/src/lib/authz.ts`). É o **único** critério do admin — nunca por nome de
  cargo, nunca só no cliente. Permissões em `packages/types/src/permissions.js`.
  **Permissão nova exige `db:repair-system-roles`**: cargo de sistema resolve pelo
  array gravado no `Role`, não pela constante do código — sem o repair, torcidas
  existentes ficam sem a capacidade nova, em silêncio (aconteceu com o módulo Bar;
  ver `docs/ops/auditoria-funcional-2026-07.md` §Achado 1). Se só os arrays
  estão defasados: `db:repair-system-roles -- --permissions-only` (sem
  syncMembership por usuário).
- **Auditoria**: toda mutação administrativa grava `AuditLog` (ator, ação, entidade, id, detalhes).
- **Validação**: `Zod safeParse` antes de qualquer operação de banco.
- **Multi-tenant**: `tenantId` nunca omitido nas queries de dados SaaS. Referências
  globais (`Afiliacao`, `Partida`, `Noticia`) são a exceção — não filtram por tenant.
  (`Afiliacao` = o time apoiado; não se usa o termo genérico "clube" como entidade.)
- **Prisma / TypeScript**: **anote explicitamente o tipo de retorno** de queries novas
  (`const x: XLite[] = await db.modelo.findMany(...)`). A inferência automática quebra
  silenciosamente neste schema (ver `ARCHITECTURE.md` §5.2). Sem `any` (`no-any`).
- **Visibilidade**: use `resolveVisibility`/`canViewRecurso` de `packages/types/src/visibility.js`.
  `self`/`ancestor` = tudo; `descendant` e `allied` = só PÚBLICO; `unrelated` = nada.
- **UX**: cubra estados de vazio, erro e loading. Formulários longos de
  admin/departamentos/loja/onboarding/design usam `StickyPersistBar`
  (Salvar/Cancelar fixos; somem no idle/clique fora; ficam se dirty; **ao
  reverter ao baseline / descartar / salvar, somem na hora** — nunca ficar
  cinza com botões disabled). Comunidade não herda isso. Ver
  `docs/frontend/motion.md` § barra de persistência.
- **Performance** (páginas com muitas queries, feed ou polling): siga `ARCHITECTURE.md`
  §5.6–§5.6.1 e `docs/data/modulo-comunidade-performance.md` — `React.cache`/`unstable_cache`,
  Suspense, prefetch on-hover, `useVisibleInterval`, `next/image` quando aplicável.
  Comunidade: feed TanStack atualizado no publish (não só RSC); chrome salas/chat
  no layout ao sair do feed. Dúvida de diagnóstico → agente `performance` antes de
  codar.
- **Animações (Motion):** presets em `apps/web/src/lib/motion-presets.ts`; guia em
  `docs/frontend/motion.md`. Novas UIs client seguem os padrões documentados (`MotionShell`,
  `m`, `MotionReveal`, `MotionEmptyState`). Shell já montado em portal/admin/onboarding.
- **Área admin (2026-07-22):** páginas admin novas usam o kit de
 `apps/web/src/components/admin/ui/` (`AdminPageHeader`, `StatCard`/`KpiGrid`,
 `StatusBadge`, `TableShell`, `TablePagination`, `InsightSection`) e os charts
 SVG de `components/admin/charts/` — nunca reimplementar header/stat/badge/
 paginação inline. Insights/relatórios: `lib/admin-insights.ts` (bucketing JS
 fuso SP) + `/admin/relatorios` (gate `reports:view`). Guia:
 `docs/frontend/admin-ui-kit.md`; decisões: `ARCHITECTURE.md` §5.12.
 **Tabs (2026-07-30):** módulo com sub-rotas declara suas etapas em
 `ADMIN_MODULOS` (`packages/types/src/menu.js`) — fonte única — e o
 `layout.tsx` do segmento monta o shell com `montarTabsModulo` +
 `AdminModuleTabs` (tab = rota; ícone/contagem só no layout; imersivo como o
 PDV fica fora via route group). O menu lateral guarda **uma** entrada por
 módulo. Etapa com permissão própria é filtrada por `tabsPermitidasDoModulo`, e
 quem não pode ver a raiz entra por `primeiraTabPermitida` (nunca expulsar para
 `/admin`). Badge de notificação aponta para a **rota** (`ROTA_POR_TIPO` +
 `rota` em `POLITICA_POR_TIPO`), nunca para id de menu — assim ele sobe para o
 módulo em vez de sumir em silêncio. Etapas com prefixo comum viram sub-rota;
 etapas irmãs (Estrutura, Plataforma) viram **route group**
 (`admin/(estrutura)/`), que dá o layout comum sem mudar URL. Mover rota de
 módulo exige `permanentRedirect` na antiga: `Notificacao.link` já gravado
 aponta para ela.
 Seções de uma única rota usam `AdminTabs` por query param; form de criar não
 fica empilhado (disclosure ou `AdminCreateDisclosure`).
- **Dependência externa opcional**: quando uma feature depende de um serviço externo não
  obrigatório (ex.: LiveKit em Salas/Meet), faça o gate com uma função `isXConfigured()`
  e degrade graciosamente em vez de quebrar. Ver `apps/web/src/lib/livekit.ts`.

## Fluxo de trabalho

- Planejar antes de codificar; implementar via agente `implementation` com escopo
  mínimo. Preferir Sonnet ou o modelo Auto da sessão — não fixar Opus para
  planejamento. Ver `docs/agents/README.md`.
- Commit/push só quando pedido. Se estiver na branch default, crie branch antes.
- Mensagens de commit terminam com:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## Arquivos-chave

- `packages/db/prisma/schema.prisma` — modelo de dados.
- `packages/types/src/permissions.js` — permissões, cargos de sistema, efetivas.
- `packages/types/src/visibility.js` — sensibilidade e visibilidade cross-tenant.
- `apps/web/src/lib/authz.ts` — `assertPermission` / `assertPresidenteGlobal` / `assertAnyPermission`.
- `apps/web/src/lib/hierarquia.ts` — relação entre tenants + `getTorcidaWorktree`.
- `apps/web/src/lib/salas.ts`, `salas-api.ts`, `livekit.ts` — núcleo do módulo Salas (Meet);
  ver `docs/data/modulo-salas.md`.
- **Loja** — catálogo, sacola, checkout, cupons: `apps/web/src/app/portal/loja/`,
  `apps/web/src/app/admin/loja/`; regras em `packages/types/src/loja.js`;
  ver `docs/data/modulo-loja.md`.
- **Departamentos / governo** — RBAC por depto + worktree da Visão da torcida:
  `docs/data/modulo-departamentos.md`; seed `packages/db/scripts/seed-departamentos.js`.
  **Preferência ≠ membership (2026-07-17):** onboarding grava
  `SaasMembro.departamentoId`; equipe só após `aprovarMembro` (ou Sem área).
  Repair: `db:repair-departamento-orfaos`.
- **Membros / admissão** — fila `/admin/membros`, reprovação com laudo obrigatório
 (categoria + justificativa + etapas erradas, `CATEGORIAS_REPROVACAO`/
 `PONTOS_REPROVACAO` em `packages/types/src/schemas/membro.js`) e aba de
 histórico com diff campo a campo (`historico-actions.ts`,
 `lib/membro-audit-diff.ts`); ver `docs/data/modulo-associacao.md`
 §reprovação com laudo e §histórico do cadastro.
- **Financeiro** — livro-caixa (`FinanceiroLancamento`): `docs/data/modulo-financeiro.md`;
  portal `/portal/financeiro`, admin `/admin/financeiro`.
- **Bar** — PDV do bar da sede (`/admin/bar`): catálogo, estoque, venda rápida com
  PIX real (gateway reusado) ou Dinheiro/Cartão; estoque isolado por torcida e
  por unidade (SEDE/SUBSEDE/PDE via `sedeId`); integra o Financeiro (categoria
  `BAR`); ver `docs/data/modulo-bar.md`.
- **Patrimônio** — inventário (`PatrimonioItem`): `docs/data/modulo-patrimonio.md`;
  portal `/portal/patrimonio`, admin `/admin/patrimonio`.
- **Caravanas / Bateria** — plugins sobre `Evento.tipo` (`CARAVANA` / `ENSAIO`);
  hubs legado redirecionam para Agenda: `docs/data/modulo-caravanas.md`,
  `docs/data/modulo-bateria.md`.
- **Eventos / Agenda** — hub `/admin/eventos` e `/portal/eventos` (lista/semana/mês);
  `Partida` global por `Afiliacao`; série/waitlist/mapa/QR offline; ver
  `docs/data/modulo-eventos.md` e `ARCHITECTURE.md` §5.11. Fontes de jogos:
  `docs/knowledge/futebol-dados-publicos.md` (Google Sports ≠ API gratuita).
- **Sofascore Widgets** — embeds oficiais por clube na comunidade (display only;
  não sync de `Partida`): `packages/types/src/sofascore-widgets.js`; ver
  `docs/data/modulo-sofascore-widgets.md`.
- **Comunidade** — feed social, timeline, busca: `apps/web/src/lib/feed.ts`,
  `feed-timeline.ts`, `comunidade-busca.ts`; engajamento (reação/comentário CN):
  `comunidade/actions.ts` (`resolverContextoEngajamento`, `podeEngajarPostVisivel`);
  busca: `modo=rapida` no typeahead, `postIncludeBusca`, SQL membros com
  `GROUP BY` (nunca `DISTINCT`+`ORDER BY similarity`); ver
  `docs/data/modulo-comunidade.md` (§ engajamento / § busca) e
  `docs/data/modulo-comunidade-performance.md`.
- **Design** — personalização visual do tenant (`/admin/design`): marca, ações,
  grade `.app-shell-bg`, superfícies; paletas priorizam torcida→escudo→clube
  (3 cores; sem verde/rival forçado; P&B sem virar marrom); nav/badges usam
  `--color-*-fg`. Domínio: `docs/knowledge/identidade-visual-cores.md`;
  spec: `docs/data/modulo-design.md`.
- **Onboarding** — wizard `/onboarding`, escudos (`docs/data/escudos-afiliacoes.md`),
  estimativa torcedores/base digital (`docs/data/torcedores-estimados.md`,
  `docs/knowledge/futebol-dados-publicos.md`); stats em `onboarding-clube-stats.ts`.
- **Super Admin** — operação da plataforma (`/super-admin`), fora do RBAC por
  tenant (gate por allowlist de e-mail, `isSuperAdminEmail`): torcidas, plano,
  afiliações, usuários, moderação e auditoria cross-tenant; ver
  `docs/data/modulo-super-admin.md` (inclui pendência: LGPD só tem exportação,
  exclusão de conta ainda não implementada).
- `ARCHITECTURE.md` — decisões fechadas (§5) e itens em aberto (§6).
