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
| `AdminPageHeader` | Header de toda page admin (título, descrição, `icon`, `actions`, `backHref`, `children` para tabs/toolbar) | Server-safe; full-bleed com `app-container`. Ritmo: título↔descrição 12px; título↔chrome 20px; peças do chrome 12px. Tabs/toolbar entram em `children` — nunca colados no `h1`. |
| `StatCard` | Indicador (label, `value` já formatado, `icon`, `href`, `badge`, `tone`, `delta`, `sparkline`, `compact`) | Client; anima como filho de `KpiGrid`; `delta` renderiza `TrendDelta` |
| `KpiGrid` | Grid responsivo de `StatCard` com `staggerContainer`/`staggerItem` | Client |
| `StatusBadge` | Badge de status por domínio (`membro`, `cobranca`, `pedido`, `rsvp`, `patrimonio`) | Server-safe; compõe `Badge` de `@torcida/ui`; labels centralizados |
| `TableShell` | Card + `<table>` (children = thead/tbody do módulo), slot de filtros, empty via `MotionEmptyState` | **Não** é DataTable declarativa — cada módulo mantém suas linhas |
| `TablePagination` | ← Anterior / Próxima → (`page`, `totalPages`, `buildHref`) | Server-safe; use com `buildAdminHref` de `apps/web/src/lib/admin-href.ts` |
| `InsightSection` | Seção de insights (título + grid) com `MotionRevealOnce` | Usada nos hubs e em `/admin/relatorios` |
| `AdminChartPeriodFilter` | Período URL-driven para gráficos (`3m`, `6m`, `9m`, range customizado) | Preserva filtros da página; use 3 meses como default e aplique o intervalo a todas as séries/métricas do bloco |
| `AdminTabs` | Barra de tabs (`tabs`, `basePath?`, `activeId`, `paramKey?`, `extraParams?`); `icon` é `ReactNode` (ex. `<Users className="h-4 w-4" />`), **nunca** o componente Lucide — funções não serializam Server→Client; `href` por tab dispensa `basePath` (modo rota) | Client (roving tabindex por teclado); navegação via `Link` real + `buildAdminHref` — funciona sem JS; ARIA completo (`role="tablist"`/`"tab"`/`aria-selected`/`aria-controls`); helper `adminTabIds(paramKey, id)` gera os ids para o `role="tabpanel"` do conteúdo |
| `AdminModuleTabs` | Tabs em que cada tab é uma **rota** do módulo (`tabs` com `href` e `matchPaths?`, `children` = painel) | Client; tab ativa vem do `usePathname()` por casamento mais específico, então deep links seguem válidos; já embrulha o `role="tabpanel"` |
| `AdminCreateDisclosure` | Ação de criar recolhida em botão (`label`, `title?`, `children` = form) | Client; para hubs cujo form de criação é componente compartilhado com a edição (cobranças, financeiro) e por isso não pode virar disclosure internamente |
| `AdminDetailHeader` | Header de página de **detalhe** (`title`, `backHref`, `backLabel?`, `eyebrow?`, `icon?`, `badges?`, `actions?`) | Server-safe; versão leve, **sem** faixa de superfície — detalhe sob shell de módulo (`/admin/sedes/[id]` em Estrutura) ganharia dois headers full-bleed empilhados se usasse `AdminPageHeader` |
| `AppModal` / `AppModalBody` | Overlay de diálogo (`components/ui/app-modal.tsx`) — porta no `document.body` acima da sidebar (`--z-modal` 80). Tamanhos: `sm` confirmação · `md` form curto · `lg` cadastro · `xl` ficha (sócio/torcedor). `height="frame"` trava a altura (abas de recrutamento). Nunca `fixed` solto dentro do `main` | Client |
| `AdminRowActions` | Menu da coluna **Ações** (`items` com `label`/`icon`/`tone`/`onSelect`) | Client; gatilho só de ícone `h-8 w-8` (`.app-touch-target`); painel no `body` (`AnchoredPopover`) para não ser recortado pelo overflow da tabela |

**Quando usar `AdminTabs` vs. filtro simples**: tabs são para **seções de
conteúdo mutuamente exclusivas** (um form ou bloco por vez — ex.: settings,
status de uma listagem). Filtros que se **combinam** com paginação/busca (ex.:
tipo + unidade + ordenação numa tabela) continuam sendo `searchParams` simples
em um `<form>`, sem essa UI.

## Tabs de rota — o hub como shell do módulo (2026-07-29)

Módulos com sub-rotas (Bar, Loja) tinham navegação duplicada: uma seção longa
no menu lateral **e** uma fileira de botões no hub — que, no caso do Bar, nem
estava no menu. Agora o `layout.tsx` do segmento monta header + `AdminModuleTabs`,
as sub-rotas viram painéis irmãos e o menu guarda uma entrada por módulo.

Receita:

1. **Declare as etapas em `ADMIN_MODULOS`** (`packages/types/src/menu.js`) —
   fonte única de módulo → tabs (id, label, href, `permissao`, `matchPaths`).
   Ícone e contagem **não** entram: componente React não atravessa
   Server→Client.
2. `layout.tsx` no segmento resolve permissão e contexto e monta
   `AdminPageHeader` + `AdminModuleTabs`, com a barra vinda de
   `montarTabsModulo(id, permissoes, enfeites)`
   (`apps/web/src/lib/admin-modulos.tsx`) — o segundo argumento vem de
   `permissoesEfetivasNoAdmin()`. Libs com `React.cache` não pagam a query duas
   vezes quando a página repete a chamada.
3. Páginas do módulo perdem o wrapper `app-container … py-8` e o back-link
   "← Módulo": o shell já provê ambos. Cada página retorna um fragmento.
4. Rota que **não** entra na barra (detalhe, ou etapa secundária como
   `bar/fornecedores`) é declarada em `matchPaths` da tab a que pertence, para
   não deixar a barra sem tab ativa.
5. Página imersiva de tela cheia fica **fora** do shell via route group — o PDV
   mora em `admin/bar/pdv`, enquanto o resto vive em `admin/bar/(modulo)/`
   (route group não altera URL).
6. Etapa com permissão própria é filtrada por `tabsPermitidasDoModulo`; quem
   não pode ver a raiz entra por `primeiraTabPermitida` em vez de ser expulso
   para `/admin` (`store:view_orders` → Pedidos; `news:curate` → Notícias).
   Isso **não** é controle de acesso: cada rota-tab mantém seu
   `assertPermission`.
7. Badge de notificação aponta para a **rota** onde a pendência se resolve
   (`ROTA_POR_TIPO` em `lib/notificacoes-menu-badges.ts` + `rota` em
   `POLITICA_POR_TIPO`), nunca para id de menu — `resolverMenuIdDeRota` casa o
   prefixo mais longo entre `ADMIN_MENU` e as tabs dos módulos, então promover
   uma rota a tab **sobe** o badge para o módulo em vez de apagá-lo. Ajuste
   também `ICON_BY_ID` no `components/admin/sidebar.tsx`.

### Sub-rota ou route group?

- **Prefixo comum** (`/admin/financeiro/cobrancas`) → sub-rota. Mover uma rota
  existente para dentro do módulo exige `permanentRedirect` na antiga
  preservando query: `Notificacao.link` já gravado no banco aponta para ela.
- **Etapas irmãs** sem prefixo comum (`/admin/torcida`, `/admin/sedes`,
  `/admin/hierarquia`, `/admin/afiliacoes`) → **route group**
  (`admin/(estrutura)/`). Dá o layout comum sem tocar em URL nenhuma — zero
  redirect, zero link quebrado.

### Regra de corte

Tab = etapa do mesmo módulo, sobre a mesma entidade-raiz, deep-linkável, com
alternância frequente. **Não** viram tab: tela imersiva (PDV), criação
(disclosure) e leitura cross-módulo (Relatórios). Teto de ~6 etapas — passou
disso, provavelmente são dois módulos. Página de detalhe (`[id]`) não é tab do
módulo, mas pode ter tabs **internas** por query param quando tem seções
pesadas e independentes; se o form já tem stepper próprio (`sedes/[id]`), não
empilhe uma barra em cima dele.

Os invariantes estão travados em `lib/__tests__/admin-modulos.test.ts` (rota
existe, uma entrada de menu por módulo, raiz = primeira tab, teto de 6, seção
não repete o nome do único item) e em `notificacoes-routing.test.ts` (nenhuma
rota de badge órfã).

### Estado das tabs por módulo

| Módulo | Tabs | Menu lateral |
|---|---|---|
| `admin/bar` | Balcão · Vendas (+ estornos) · Fiado · Produtos · Estoque (+ fornecedores) · Desempenho | 7 → 2 (Bar + PDV) |
| `admin/loja` | Catálogo · Pedidos · Categorias · Cupons · Desempenho | 2 → 1 |
| `admin/comunidade` | Visão geral · Comunicados · Mural · Moderação · Notícias | 5 → 1 |
| `admin/financeiro` | Direção · Lançamentos · Evolução · Cobranças · Planos de sócio · Novo plano | 3 → 1 |
| `admin/(estrutura)` | Visão geral · Unidades · Hierarquia · Solicitações | 4 → 1 |
| `admin/(plataforma)` | Geral · Transparência · Integrações · Identidade · Acessos · Auditoria | 4 → 1 |
| `admin/eventos` | Lista · Semana · Mês · Histórico · Comparecimento (`?vista=`) | 1 |
| `admin/membros` | status da fila (`?status=`) | 1 |
| `admin/eventos/[id]` | Cockpit · Embarque/Presença · Editar (`?tab=`) | detalhe |
| `admin/torcida/unidade/[id]` | Financeiro · Agenda · Bar · Membros (`?modulo=`) | detalhe |

Os hubs de Bar e Loja deixaram de acumular insights: cada um ganhou a etapa
**Desempenho** (`bar/desempenho`, `loja/desempenho`), que concentra margem/CMV e
as séries de 30 dias. O Balcão do bar ficou com turno, caixa do dia e estoque
baixo; o PDV virou ação primária do header do módulo.

O drill-down da unidade só consulta o banco da aba visível — antes eram cinco
leituras por render, mesmo com o Presidente olhando um módulo só.

### Seções do menu lateral

`ADMIN_MENU_SECOES` agrupa por **natureza do trabalho**, não por módulo:
Pessoas · Operação · Finanças · Governança (+ Dashboard sem cabeçalho). Uma
seção só se justifica quando agrupa dois ou mais itens e diz algo que os nomes
deles não dizem — enquanto cada módulo ocupava várias linhas havia uma seção
por módulo; virando uma linha, sobravam cabeçalhos repetindo o item
("Loja › Loja"). O menu saiu de **24 entradas para 14**.

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

**Mobile (obrigatório):** `MiniBarChart` rola de lado (`overflow-x-auto` +
`min-w` por coluna) — nunca deixa o rótulo `nowrap` definir a largura do
card. Grades que hospedam chart (`InsightSection`, `AdminExpansionPanel`,
`KpiGrid`) usam `grid-cols-[minmax(0,1fr)]` + `[&>*]:min-w-0` na base.
Medição: `e2e/charts.measure.ts`.

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

## Refactor de navegação por tabs (2026-07-29 → 2026-07-30)

Cinco ondas, todas entregues. Menu de **24 → 14** entradas; seis módulos com
tabs de rota. Decisões de escopo:

- **Torcedores e Sócios ficaram separados**: jornadas distintas (quadro de
  torcedores vs admissão/carteirinha/vigência de sócios). Solicitações de sócio
  vivem em `/admin/socios`; `/admin/membros` redireciona para `/admin/torcedores`.
  Ambos já têm tabs internas por status — fundir criaria duas barras empilhadas.
  Ver `docs/data/modulo-associacao.md` § Pessoas.
- **`sedes/[id]` e detalhe de pessoa não ganharam tabs de módulo**: o form de sede já tem
  stepper próprio (`SEDE_STEPS`, com marcação de erro por etapa), e o detalhe
  tem só três blocos. Contagem de linhas engana — boa parte desses
  arquivos é query e tipo, não interface.
- **Estúdio de Design sob o shell**: dependia de `h-[calc(100dvh-3.5rem)]`
  (viewport inteira). Passou a `xl:h-[70dvh]` com piso de `34rem`, para as duas
  colunas com scroll próprio não dependerem da altura de header + tabs.
- **Formulário de criação em disclosure, não modal**: em Cobranças/Financeiro o
  form é compartilhado com a edição, e um modal quebraria a integração com
  `useTrackedForm`/`StickyPersistBar`.

## Kit de listagem — paginação, filtro por coluna e busca (2026-07-30)

Listagens grandes (Acessos com 831 pessoas em uma página, Membros, Sócios)
repetiam o mesmo bloco: `parseSortParam`, `buildHref`, `sortHref`, `where`
montado à mão, `POR_PAGINA` local e uma barra de `<select>`. Agora existe um
**contrato declarativo** por listagem e componentes que o consomem.

### Contrato — `apps/web/src/lib/listagem/`

| Arquivo | Papel |
|---|---|
| `spec.ts` | `ListagemSpec`: colunas, filtro por coluna, campos de busca, sort/dir padrão, `porPaginaPadrao`, `camposProibidos`. Tetos: `POR_PAGINA_MAX`, `PAGINA_MAX`, `VALORES_POR_FILTRO_MAX` |
| `specs.ts` | **Registro** das listagens (`LISTAGENS`) — fonte única, no mesmo espírito de `ADMIN_MODULOS` |
| `params.ts` | `parseListagemParams` (Zod, hostile-safe) e os `construirHref*` — a serialização da URL existe em **um** lugar |
| `query.ts` | `montarWhereListagem` / `montarOrderByListagem` / `montarPaginacao` / `resumirPaginacao` / `carregarFacetas` (server-only) |
| `ui.ts` | Ponte spec → props serializáveis (`montarFiltroUI`, `montarChips`, `ocultosPreservados`, `paramsDoContrato`) |

Componentes em `components/admin/ui/listagem/`: `ListagemToolbar` (busca
reativa com debounce, contador, chips dos filtros ativos, "limpar tudo"),
`ListagemTh` (ordenação + popover de filtro na própria coluna),
`ListagemPaginacao` (primeira/anterior/janela/próxima/última + itens por
página), `ListagemVazia`, `ListagemPersistencia`.

### Decisões

- **Servidor decide, cliente só navega**: as opções do popover são `<a>` com
  href pronto do servidor. A lógica de toggle de filtro não é reimplementada no
  cliente, e o filtro funciona sem JS.
- **URL é a verdade; `localStorage` é conveniência.** `ListagemPersistencia`
  restaura a última visão apenas quando a URL está limpa, uma vez por mount —
  link compartilhado nunca é sobrescrito pelo estado de quem abre. Busca (`q`)
  e página não entram no snapshot: procurar um nome é consulta pontual, não
  visão da lista (voltar em Torcedores não pode reabrir `?q=Fulano`).
- **Faceta ignora o próprio filtro**: o número ao lado de "Sócio" é quantos
  apareceriam se a opção fosse marcada, não quantos há no resultado atual.
  Facetas vêm de `groupBy`; caminho de relação não é facetável (o popover
  simplesmente sai sem números).
- **Segurança no contrato, não na página**: `sort` só aceita coluna declarada;
  `porPagina` tem teto; `camposProibidos` barra campo sensível (CPF, RG, URLs de
  documento) em filtro/busca/sort — e os testes de invariante
  (`src/lib/__tests__/listagem.test.ts`, 44 casos) rodam sobre `LISTAGENS`, então
  listagem nova ganha as travas de graça.
- **Filtro de coluna escondida**: `filtrosCompactos` na `ListagemToolbar` repete
  o filtro na barra exatamente nos breakpoints em que a coluna não está na
  tabela — sem isso, filtro de coluna `hidden lg:table-cell` fica inalcançável
  no mobile.
- **Tabela de membros manteve a própria estrutura animada** (a decisão de
  2026-07-22 segue): ela recebe os `<th>` prontos via prop `cabecalho` em vez de
  virar `TableShell`.
- **Coluna Origem** (sócios e torcedores): unidade de solicitação + canal de
  entrada (link de convite, onboarding, Associe-se, importação). Display-only —
  o canal é lido do `AuditLog.detalhes.origem` do `CADASTRO_SOLICITADO` mais
  antigo. Cadastros legados sem origem mostram a unidade (quando espelho) e não
  inventam "onboarding".
- **Ações em menu**: `AdminRowActions` substitui fileiras de botões na coluna
  Ações — gatilho só de ícone (`MoreVertical`, 32×32, o mesmo alvo da paginação).
  O painel porta no `body` para não ser recortado pelo overflow da tabela.

### Ganho medido no piloto

`/admin/acessos?secao=pessoas` fazia quatro dumps da torcida (usuários, cargos,
departamentos, gestores) e cruzava tudo em memória, O(n×m), serializando 831
linhas com todos os cargos em cada uma. Passou a uma página de 25 linhas com
`include` escopado por tenant; abrir o painel de uma pessoa resolve **aquele**
usuário (`?usuario=`) em vez de carregar a lista inteira para editar um.

`/admin/loja/pedidos` não tinha `take` — baixava todos os pedidos com itens e
imagens. Agora pagina, busca por cliente/cupom e filtra status/data pelo kit.
`/admin/socios` ganhou dois specs (`emitidas` × `aguardando`) porque a aba
troca de modelo; o filtro de unidade em emitidas virou relação
(`user.membros.some.sedeId`) em vez de materializar `userId[]` sem teto.

Índices que sustentam a ordenação paginada (exigem `db:push`):
`SaasMembro [tenantId, status, criadoEm]`, `[tenantId, criadoEm]`,
`[tenantId, nome]`; `User [nome]`; `UserDepartamento [tenantId]`;
`SaasSocio [tenantId, validade]`, `[tenantId, nome]`;
`SaasPedido [tenantId, status, criadoEm]`, `[tenantId, criadoEm]`.

### Escrita em GET removida

`/admin/socios` alinhava o `numeroSocio` legado ao nº do recrutamento **durante
o GET** da aba "emitidas": um refresh ou prefetch mutava o banco, sem auditoria.
Virou a Server Action `sincronizarNumerosSocio` (permissão `MEMBERS_APPROVE`,
advisory lock por torcida, `AuditLog` `SOCIO_NUMEROS_SINCRONIZADOS`), disparada
por um aviso que só aparece quando a página exibida tem divergência.

## Ver também

- Upload/crop de imagem e picker de localização:
  [`docs/frontend/media-upload-crop.md`](media-upload-crop.md)
