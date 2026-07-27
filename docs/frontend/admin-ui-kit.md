# Admin UI Kit + Inteligência Administrativa

Guia do kit de componentes da área admin e da camada de insights/relatórios.
Decisões fechadas em `ARCHITECTURE.md` §5.12. Plano original: refactor admin
2026-07-22 — **todas as fases (1–5) entregues**.

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
| `AdminTabs` | Barra de tabs (`tabs`, `basePath`, `activeId`, `paramKey?`, `extraParams?`); `icon` é `ReactNode` (ex. `<Users className="h-4 w-4" />`), **nunca** o componente Lucide — funções não serializam Server→Client | Client (roving tabindex por teclado); navegação via `Link` real + `buildAdminHref` — funciona sem JS; ARIA completo (`role="tablist"`/`"tab"`/`aria-selected`/`aria-controls`); helper `adminTabIds(paramKey, id)` gera os ids para o `role="tabpanel"` do conteúdo |

**Quando usar `AdminTabs` vs. filtro simples**: tabs são para **seções de
conteúdo mutuamente exclusivas** (um form ou bloco por vez — ex.: settings,
status de uma listagem). Filtros que se **combinam** com paginação/busca (ex.:
tipo + unidade + ordenação numa tabela) continuam sendo `searchParams` simples
em um `<form>`, sem essa UI.

### Backlog de tabs (candidatos não migrados)

Levantados na auditoria que originou o `AdminTabs` (2026-07-27) — próximos
candidatos a ganhar tabs, priorizados por quantidade de seções empilhadas:

- `admin/bar` — turno + PDV + vendas do dia + margem/CMV + insights 30d +
  estoque baixo.
- `admin/eventos` — filtro de tipo + toggle lista/semana/mês + insights +
  histórico.
- `admin/cobrancas` — insights + filtro de status + form de criar + tabela.
- `admin/financeiro` — resumo + insights + filtros + form de lançamento +
  lista.
- `admin/loja` — insights + form de criar produto + grid ativos/inativos.

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
| `lib/membros-insights.ts` | `resumirFunilMembros`, `serieFunilMensal`, `distribuirMembros`, `resumirCarteirinhas` | Hub membros + relatórios |
| `lib/cobrancas-insights.ts` | `resumirInadimplencia` (aging 0-30/31-60/61-90/90+, taxa, MRR) — 1º consumidor do índice `CobrancaAssociacao (tenantId,status,vencimento)` | Hub cobranças + relatórios (Associação) |
| `lib/comunidade-insights.ts` | `resumirEngajamento`, `resumirLeituraComunicados` (read-rate = leituras ÷ membros aprovados) | Hub comunidade + relatórios |

Regras de negócio embutidas: receita da loja = pedidos `CONFIRMADO`/`ENTREGUE`
(`PENDENTE` é aguardando, `CANCELADO` não conta); receita do bar = vendas
`PAGA`; presença de eventos = `checkedInAt != null` (walk-in conta; taxa pode
passar de 1), no-show = `CONFIRMADO` sem check-in; cobrança em atraso =
`PENDENTE`/`VENCIDA` com vencimento passado; MRR = `PAGA` tipo `MENSALIDADE`
com `pagoEm` no mês corrente (fuso SP); engajamento de comunidade escopa
`Reacao`/`Comentario` via relação `post: { tenantId }` (não têm tenantId
próprio).

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

## Estado final (2026-07-22)

Todas as ondas entregues. `/admin/relatorios` cobre Financeiro, Membros,
Associação, Bar, Loja, Eventos e Comunidade (sem placeholders). Decisões de
escopo registradas nas ondas 4–5:

- **Tabela de membros** manteve a própria estrutura animada
  (`AnimatePresence` + stagger, superior ao `TableShell` estático); a
  unificação foi via `StatusBadge`/`statusBadgeLabel` + `TablePagination`.
- **Hub de sócios** ficou intacto: o rodapé sticky de paginação com contagem é
  um padrão próprio (não o duplicado) e o client de 1014L não foi
  reestruturado; o donut de carteirinhas vive na seção Associação dos
  relatórios (`resumirCarteirinhas`).
- **`/admin/design`** ficou fora do Motion leveling: layout de estúdio com
  `overflow-hidden` sensível; o form já anima via `StickyPersistBar`.
- `StatCard` ganhou `badgeTone` (linha auxiliar em danger/warning/default —
  default `success`) e o modo `compact` passou a renderizar `badge`.

## Ver também

- Upload/crop de imagem e picker de localização:
  [`docs/frontend/media-upload-crop.md`](media-upload-crop.md)
