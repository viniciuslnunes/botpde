# Admin UI Kit + Inteligência Administrativa

Guia do kit de componentes da área admin e da camada de insights/relatórios.
Decisões fechadas em `ARCHITECTURE.md` §5.12. Plano original: refactor admin
2026-07-22 (fases 1–3 entregues; ondas 4–5 pendentes — ver § Roadmap).

## Por que existe

Antes do kit, cada page admin reimplementava header, stat cards, badges de
status, tabela e paginação inline (3 implementações quase idênticas de stat
card; mapas `STATUS_BADGE` hard-coded por módulo). O kit unifica esses padrões
**compondo** os primitivos de `@torcida/ui` — nunca duplicando — e integra
Motion por padrão. Vive em `apps/web` (não em `packages/ui`) porque depende de
`motion` e dos presets de `apps/web/src/lib/motion-presets.ts`.

## Kit — `apps/web/src/components/admin/ui/`

| Componente | Uso | Notas |
|---|---|---|
| `AdminPageHeader` | Header de toda page admin (título, descrição, `icon`, `actions`, `backHref`) | Server-safe; full-bleed com `app-container` |
| `StatCard` | Indicador (label, `value` já formatado, `icon`, `href`, `badge`, `tone`, `delta`, `sparkline`, `compact`) | Client; anima como filho de `KpiGrid`; `delta` renderiza `TrendDelta` |
| `KpiGrid` | Grid responsivo de `StatCard` com `staggerContainer`/`staggerItem` | Client |
| `StatusBadge` | Badge de status por domínio (`membro`, `cobranca`, `pedido`, `rsvp`, `patrimonio`) | Server-safe; compõe `Badge` de `@torcida/ui`; labels centralizados |
| `TableShell` | Card + `<table>` (children = thead/tbody do módulo), slot de filtros, empty via `MotionEmptyState` | **Não** é DataTable declarativa — cada módulo mantém suas linhas |
| `TablePagination` | ← Anterior / Próxima → (`page`, `totalPages`, `buildHref`) | Server-safe; use com `buildAdminHref` de `apps/web/src/lib/admin-href.ts` |
| `InsightSection` | Seção de insights (título + grid) com `MotionRevealOnce` | Usada nos hubs e em `/admin/relatorios` |

## Charts — `apps/web/src/components/admin/charts/`

SVG puro, zero dependência, client components. Cores **sempre** por CSS vars em
tripla RGB (`rgb(var(--color-primary))`; áreas com `/ 0.15`) — funcionam em
qualquer tema de tenant e em dark mode. Todos com `role="img"` + `aria-label`.

| Componente | Uso | Animação |
|---|---|---|
| `Sparkline` | Série temporal compacta (`data: number[]`) | `m.path` com `pathLength` |
| `MiniBarChart` | Barras verticais; série dupla via `valorSecundario` (barras agrupadas) | stagger + `scaleY` origem base |
| `DonutChart` | Distribuição (`{ rotulo, valor, cor? }[]`, `centro?`) | arcos com `pathLength` |
| `TrendDelta` | % vs período anterior; `invertido` p/ métricas onde subir é ruim (ex.: inadimplência) | — |

**Regras de fronteira RSC→client (obrigatórias):**
- Props só com primitivas (`number`, `string`) — **nunca** `Prisma.Decimal`/`Date`.
  Conversão (`Number(...)`, rótulo formatado) acontece na lib.
- Funções não atravessam a fronteira: use o prop serializável
  `formato: 'numero' | 'moeda' | 'unidades'` no `MiniBarChart` a partir de RSC
  (`format` fn só para callers client).

## Camada de dados — libs de insights

Utilitários compartilhados: `apps/web/src/lib/admin-insights.ts` —
`Periodo` (`'30d' | '90d' | '12m'`), `SerieTemporal`, `resolverIntervaloPeriodo`
(período atual + anterior para comparativos), `bucketPorDia`/`bucketSomaPorDia`/
`bucketPorMes`/`ultimosMesesSP`/`chaveMesSP`, `calcularDelta`.

**Bucketing é SEMPRE em JS com timezone `America/Sao_Paulo`** — nunca
`date_trunc` SQL (rodaria em UTC e deslocaria registros noturnos de dia/mês).
Agregação é on-the-fly via índices existentes (sem snapshots, sem tabelas
novas); séries fazem 1 fetch por range + bucket em memória.

Libs por módulo (todas: `'server-only'`, `cache()` do React, primeiro parâmetro
`tenantId`, `where` sempre com tenant, **tipo de retorno explícito exportado**,
Decimal→number antes de retornar):

| Lib | Funções | Consumo |
|---|---|---|
| `lib/admin-dashboard.ts` | `carregarKpisDashboard`, `carregarListasDashboard`, `carregarSerieNovosMembros`, `carregarReceitaMesDashboard` | Dashboard `/admin` |
| `lib/financeiro.ts` (estendida) | `resumirFinanceiroMensal`, `compararFinanceiroPeriodo` (+ `resumirFinanceiro`/`PorCategoria` pré-existentes) | Hub financeiro + relatórios |
| `lib/bar.ts` (estendida) | `resumirVendasBarPorDia`, `listarMaisVendidosBar`, `compararVendasBarPeriodo` (+ `resumirMargemBar` agora aceita `sedeId: undefined` = torcida inteira) | Hub bar + relatórios |
| `lib/loja-insights.ts` | `resumirVendasLoja`, `listarMaisVendidosLoja`, `resumirUsoCupons` | Hub loja + relatórios |
| `lib/eventos-insights.ts` | `resumirComparecimento`, `listarPresencaPorEvento` | Hub eventos + relatórios |

Regras de negócio embutidas: receita da loja = pedidos `CONFIRMADO`/`ENTREGUE`
(`PENDENTE` é aguardando, `CANCELADO` não conta); receita do bar = vendas
`PAGA`; presença de eventos = `checkedInAt != null` (walk-in conta; taxa pode
passar de 1), no-show = `CONFIRMADO` sem check-in.

## Página `/admin/relatorios`

`apps/web/src/app/admin/relatorios/page.tsx` — gate
`assertPermission(PERMISSIONS.REPORTS_VIEW)` com `redirect('/admin')` no catch;
seletor de período por links (30d/90d/12m, default 30d); uma seção async por
módulo em `sections/*-section.tsx`, cada uma no próprio `<Suspense>` com
skeleton. Entrada de menu em `packages/types/src/menu.js` (id `relatorios`,
seção `governanca`, antes de `auditoria`).

**RBAC**: `reports:view` está nos pacotes de colaborador de áreas canônicas
(Diretoria, Financeiro etc. — `packages/db/src/departamentos-canonicos.js`).
Invariante testado em `rbac.test.ts`: colaborador com `reports:view` abre no
máximo **Dashboard + Relatórios (leitura)** na área admin — nunca itens de
operação. Para restringir relatórios a gestores, remova `reports:view` dos
pacotes colaborador no seed.

## Como adicionar insights a um módulo (receita)

1. Crie/estenda a lib (`lib/<modulo>-insights.ts`) seguindo as regras acima;
   comparativos usam `resolverIntervaloPeriodo`.
2. No hub do módulo, adicione `InsightSection` dentro de `<Suspense>` próprio
   (não bloquear o conteúdo operacional da page).
3. Em `/admin/relatorios`, crie `sections/<modulo>-section.tsx` (async, empty
   state via `MotionEmptyState`, deltas onde couber) e remova o módulo de
   `SECOES_EM_BREVE`.
4. Estados vazio/erro/loading sempre cobertos; charts recebem só primitivas.

## Roadmap (ondas pendentes)

- **Onda 4 — Membros/Sócios/Cobranças**: `lib/membros-insights.ts` (funil
  novos×aprovados×desligados, distribuição por sede/cidade/tipo),
  `lib/cobrancas-insights.ts` (inadimplência/aging 0-30/31-60/61-90/90+ e MRR —
  primeiro consumidor do índice `CobrancaAssociacao (tenantId,status,vencimento)`);
  insights nos hubs membros/cobranças/sócios; migrar tabelas de membros e
  cobranças para `TableShell` (em `admin-socios-client.tsx`, 1014L, só
  badges/paginação/empty); `sections/associacao-section.tsx`; Motion em
  `membros/[id]`.
- **Onda 5 — Comunidade + Governança**: `lib/comunidade-insights.ts`
  (engajamento por dia, denúncias, read-rate de comunicados via
  `Announcement`/`AnnouncementRead`); `sections/comunidade-section.tsx` fecha os
  relatórios; Motion leveling final em sedes, sedes/[id], hierarquia, aliancas,
  acessos, configuracoes, design, comunidade/comunicados|mural|noticias.
