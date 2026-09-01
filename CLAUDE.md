# CLAUDE.md — Torcida SaaS

Guia curto para trabalhar neste repositório. Detalhe arquitetural em `ARCHITECTURE.md`;
produto e roadmap em `docs/`; time de agentes em `.claude/agents/` (ver `docs/agents/README.md`);
conhecimento do nicho (torcidas, alianças, governança, lei) em `docs/knowledge/`.
Performance web: `ARCHITECTURE.md` §5.6 e §5.6.1; **bundle de entrada** (medição
com `next experimental-analyze` — `build:analyze` é no-op sob Turbopack):
§5.6.2 + `docs/data/bundle-entrada-performance.md`; Comunidade (feed/timeline/busca):
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
escala nacional): `docs/ops/plano-teste-volume-dados.md`. Teste de **caminho**
(as 3 portas de entrada, canais, permissões — não volume):
`docs/ops/lote-jornadas.md`. **Todo usuário de seed tem a senha `m1k43l3n`**
(`packages/db/scripts/lib/senha-teste.js`) — dá para entrar como ele em
`/entrar` e conferir o cenário de dentro.

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
pnpm dev:cache                        # tamanho de .next e do cache Turbopack (exit 1 acima de 8 GB)
pnpm dev:clean                        # apaga .next quando o cache passar do teto — ver docs/ops/dev-local-performance.md
pnpm --filter @torcida/web lint
pnpm --filter @torcida/web test       # Vitest (RBAC, rate-limit, visibilidade)
pnpm --filter @torcida/db db:generate # prisma generate + gera src/prisma-exports.{js,d.ts} (commitar o diff)
pnpm --filter @torcida/db prisma-exports:check # exit 1 se o reexport do Prisma defasou do schema
pnpm --filter @torcida/db db:push     # sincroniza schema (NÃO há migrations)
pnpm --filter @torcida/db schema:check # exit 1 se schema mudou (pós-deploy: HML/prod ainda precisam de push)
pnpm --filter @torcida/db schema:deploy # db:push no alvo (HML/prod; prod exige --i-know-prod) — ver docs/ops/schema-deploy.md
pnpm --filter @torcida/db db:enable-pg-trgm  # extensão + índices busca Comunidade
pnpm --filter @torcida/db seed:loja-gavioes  # catálogo demo Gaviões (tenant pde-gavioes-fiel)
pnpm --filter @torcida/db seed:brecho-gavioes # anúncios P2P de teste no brechó (sócios nomeados; senha m1k43l3n)
pnpm --filter @torcida/db seed:gavioes-logins # logins nomeados por cargo/área (só Postgres local; senha m1k43l3n)
pnpm --filter @torcida/db seed:memoria-demo   # eventos, posts e fatos na linha do tempo (Gaviões + Camisa 12; só local)
pnpm --filter @torcida/db seed:forum-praca    # fórum da praça: CN Corinthians + Gaviões (`[TESTE-FORUM]`; só local)
pnpm --filter @torcida/db seed:departamento-areas    # áreas de atuação canônicas por departamento
pnpm --filter @torcida/db db:repair-canais-departamentos # canais internos depto/área + roster
pnpm --filter @torcida/db seed:torcedores-estimados  # tier PESQUISA (Datafolha×IBGE) > IBOPE > limite
pnpm --filter @torcida/db seed:clubes-rnc            # Ranking Nacional de Clubes da CBF: cria os ausentes + grava posição
pnpm --filter @torcida/db coleta:wikidata-clubes     # regenera wikidata-clubes-br.json (tipos, descrição, extinção)
pnpm --filter @torcida/db seed:ficha-clubes -- --corrigir-cidades  # fundação, estádio, cores, site, ids externos
pnpm --filter @torcida/db seed:ficha-clubes -- --corrigir-ficha    # reancora quem está no QID errado do Wikidata
pnpm --filter @torcida/db repair:clubes-curados      # correções e fusões curadas (nome quebrado, UF errada, duplicata)
pnpm --filter @torcida/db seed:rivalidades-clubes    # rivalidade que ISOLA (municipal/estadual; interestadual é só contexto)
pnpm --filter @torcida/db seed:torcidas-registro -- --importar-ausentes  # registro na federação (FPF) + ano de fundação
pnpm --filter @torcida/db coleta:cores-escudos       # cor do clube a partir do escudo (Cloudinary Admin API)
pnpm --filter @torcida/db audit:catalogo-clubes      # placar do catálogo x CBF/Wikidata/IBGE/FPF (gate: exit 1)
pnpm --filter @torcida/db test:catalogo-clubes       # invariantes puros do catálogo e da rivalidade
pnpm --filter @torcida/db coleta:api-football-times  # snapshot times BR (1 requisição da cota)
pnpm --filter @torcida/db seed:api-football-ids      # Afiliacao.apiExternalId (offline; --apply grava)
pnpm --filter @torcida/db test:api-football-match    # invariantes do casamento clube ↔ API
pnpm --filter @torcida/web seed:partidas-sync        # sincroniza Partida e MANTÉM (para ver na tela)
pnpm --filter @torcida/web audit:partidas-sync       # sync ponta a ponta (grava e reverte)
pnpm --filter @torcida/db coleta:ibope-ranking -- --validate  # cobertura Top 50
pnpm --filter @torcida/db db:repair-carteirinha-espelho  # carteirinha do sócio Caso B nos dois níveis
pnpm --filter @torcida/db db:repair-owner-heranca-promocao  # tira owner herdado da mãe em portal de unidade + o SaasMembro/canal fabricados junto (simula; --apply grava)
pnpm --filter @torcida/db db:repair-espelho-membros-sede # membro (sócio OU torcedor) de unidade sem espelho na Sede
pnpm --filter @torcida/db db:reconciliar-torcedor-convite -- --email=<e> --convite=<slug>  # torcedor global que devia ter entrado por convite
pnpm --filter @torcida/db audit:regras       # invariantes de negócio + matriz de relações
pnpm --filter @torcida/web audit:dados       # auditoria funcional (código real × banco semeado)
pnpm --filter @torcida/web audit:fluxos      # fluxos ponta a ponta (Server Actions reais; muta e reverte)
pnpm --filter @torcida/web audit:fluxos-avancados  # regras ainda não cobertas (eventos, bar, RBAC, grupos)
pnpm --filter @torcida/web audit:hierarquia  # Sede→Subsede→PDE (promover, excluir, reatribuir)
pnpm --filter @torcida/web audit:notificacoes # fan-out, reconciliação de leitura, escopo
pnpm --filter @torcida/web audit:mensageria  # DM: segregação por rivalidade, bloqueio, solicitação
pnpm --filter @torcida/web audit:loja        # cupom, estoque (inclui concorrência), pedido, seguir
pnpm --filter @torcida/web audit:canal-restrito  # R5: semeia unidade Caso B (o seed não tem) e mede o isolamento
pnpm --filter @torcida/web audit:onboarding  # TORCEDOR / SOCIO PENDENTE / APROVADO → comunidades e mural
pnpm --filter @torcida/db seed:convites-teste   # links /convite/<slug> em torcidas e unidades Caso B
pnpm --filter @torcida/db db:senha-teste        # senha padrão nos usuários de seed já criados
pnpm --filter @torcida/web seed:jornadas        # lote "jornadas": 3 fluxos de entrada + canais, por Server Actions reais
pnpm --filter @torcida/web audit:jornadas       # canais corretos + matriz de vazamento de permissão do lote
pnpm --filter @torcida/db reset:jornadas -- --dry-run  # limpa só o lote de jornadas
pnpm --filter @torcida/web audit:areas-projetos # áreas de atuação e projetos NÃO concedem permissão
pnpm --filter @torcida/web audit:achados        # status medido dos achados de ARCHITECTURE §7
pnpm --filter @torcida/web municipios:atualizar # regenera a malha municipal do IBGE (--check só compara)
pnpm --filter @torcida/web lint:mobile          # safe-area + dvh + recorte lateral (CI; sem app nem banco)
pnpm --filter @torcida/web rotas:dinamicas      # resolve ids reais p/ a auditoria de responsividade
pnpm version:print                              # 1.<commits_main>.<commits_totais> (docs/ops/release.md)
pnpm release:sync                               # sincroniza package.json + tag a partir do Git
```

CI roda `tsc --noEmit` + `eslint` em todo PR. Deploy: push em `main` → Railway.
Versão do produto: `1.<commits_em_main>.<commits_totais>` (ver
`docs/ops/release.md`). Mudança em `schema.prisma`: workflow **Schema deploy**
aplica `db:push` em HML e em prod (nessa ordem; **TEMP** sem approve — ver
`docs/ops/schema-deploy.md`). O Railway **não** aplica o schema sozinho.

**Lentidão em `localhost` não é bug do app**: sem Postgres local, cada query
Prisma atravessa o proxy público da Railway (RTT medido: 125ms; ~131ms por
query), então uma página com 30 queries gasta ~4s só de rede — contra ~40ms em
produção, onde app e banco dividem datacenter. Antes de "otimizar" uma rota
lenta em dev, suba o banco local: agente `/setup` (ou
`docs/ops/postgres-local-dev.md` + `scripts/dev-setup.ps1` /
`scripts/dev-setup.sh`). Secrets do time: `docs/ops/dev-secrets.md`.
**E o banco local é snapshot, não réplica (2026-08-12):** antes de investigar
"post/dado não apareceu" em dev, confirme que as duas telas comparadas estão no
**mesmo banco** — um relato de feed que "não propagou" era só o snapshot local
parado 5 dias atrás. Ver `docs/ops/postgres-local-dev.md` § o snapshot congela.
**E se o que arrasta é a COMPILAÇÃO, não a query (2026-08-30):** problema
distinto, disco e não rede. O cache persistente do Turbopack
(`apps/web/.next/dev/cache/turbopack`) cresce sem teto — chegou a **70 GB** aqui,
com o SSD 94% cheio, e sozinho levava a primeira compilação de `/entrar` a
**36s** (a subida era 3,2s: o custo está na rota, não no start). Diagnostique com
`pnpm dev:cache` e corte com `pnpm dev:clean` **antes** de otimizar código; passe
as exclusões do Defender uma vez (`scripts/dev-defender-exclusoes.ps1`, como
admin). **O tamanho do cache manda no ciclo de edição** (medido na mesma sessão:
10,8 GB → 4,0s; após `dev:clean` → **1,3s**), e ele volta a inflar em ~13h de
uso — `dev:clean` é rotina, não conserto de emergência. Nada que entre em `env` do `next.config.ts` pode ser volátil: vira define
de compilação e portanto chave de cache — um `new Date()` ali reescrevia a
árvore inteira a cada start. `turbopackFileSystemCacheForDev` e
`turbopackServerFastRefresh` **já são default `true`** no 16.2.9, não adianta
declarar. Ver `docs/ops/dev-local-performance.md`.
**Custo Railway** (fatura por projeto, ordem de corte, por que o HML fica, e o
backlog de tirar os bots Discord daqui): `docs/ops/custo-railway-projetos.md`.

## Convenções (obrigatórias)

- **Autorização**: toda Server Action de mutação chama `assertPermission(PERMISSION)`
  (`apps/web/src/lib/authz.ts`). É o **único** critério do admin — nunca por nome de
  cargo, nunca só no cliente. Permissões em `packages/types/src/permissions.js`.
  **Cargos de sistema** (`owner`/`admin`/`vice`/`member`) resolvem o pacote por
  `SYSTEM_ROLE_PERMISSIONS` em runtime (`permissionsOfRole`) — permissão nova
  vale sem repair. `db:repair-system-roles` continua útil como **higiene** do
  array gravado (bootstrap/UI); se só os arrays estão defasados:
  `db:repair-system-roles -- --permissions-only` (sem syncMembership por usuário).
  Permissão nova em **pacote de departamento** exige `seed:departamentos` nos
  tenants existentes.
- **Auditoria**: toda mutação administrativa grava `AuditLog` (ator, ação, entidade, id, detalhes).
- **Validação**: `Zod safeParse` antes de qualquer operação de banco.
- **Multi-tenant**: `tenantId` nunca omitido nas queries de dados SaaS. Referências
  globais (`Afiliacao`, `Partida`, `Noticia`) são a exceção — não filtram por tenant.
  (`Afiliacao` = o time apoiado; não se usa o termo genérico "clube" como entidade.)
- **Prisma / TypeScript**: **anote explicitamente o tipo de retorno** de queries novas
  (`const x: XLite[] = await db.modelo.findMany(...)`). A inferência automática quebra
  silenciosamente neste schema (ver `ARCHITECTURE.md` §5.2). Sem `any` (`no-any`).
  **E o `tsc` não valida payload de escrita (medido 2026-09-01):** campo
  inexistente no `data` de um `create`/`update` **passa limpo** na compilação.
  Conferir campo a campo e valor de enum contra `schema.prisma` ao escrever
  mutação nova — só auditoria de fluxo (`audit:*`, contra banco real) pega isso.
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
  **Barrel no root layout (2026-08-12):** componente na cadeia do root layout
  importa o **módulo direto** (`@torcida/types/design`), nunca o barrel
  `@torcida/types` — ele é 37 `export *` e arrasta tudo para toda página.
  `optimizePackageImports` **não** conserta isso (medido, zero efeito). Em
  componente de rota o barrel está ok — estreitar lá piora o chunk. Config
  herdada da era webpack (`build:analyze`, `treeshake` do Sentry) é no-op sob
  Turbopack: meça antes de creditar ganho. Ver §5.6.2.
- **Mobile-first (2026-08-27):** o produto vira app iOS/Android, então telefone
  é o alvo, não uma adaptação. Quatro regras não negociáveis, todas já
  centralizadas — não reimplemente à mão: (1) **altura de viewport é `dvh`**,
  nunca `vh`/`h-screen` (só atrás de `lg:`/`xl:`, onde são iguais); (2) **barra
  fixa de rodapé reserva `env(safe-area-inset-bottom)`** — no `AppModal` isso já
  vem do painel, não ponha no rodapé; (3) **campo de texto nunca abaixo de 16px
  no toque** — o piso é global em `globals.css` (junto com `min-height` de
  44px em input/select e 24px em checkbox/radio), não use `text-sm` achando que
  precisa compensar; (4) **alvo de toque 44×44 nos dois eixos** — `.app-action`
  em botão/ícone comum, `.app-touch-target` em UI densa (cresce só no toque,
  preserva a densidade do desktop) e `.app-touch-line` em link de texto solto
  (amplia a área por pseudo-elemento, sem mexer no layout; só onde o link está
  sozinho na linha, senão rouba o toque do vizinho). O `min-width` das duas
  primeiras é `:not(.min-w-0)`: botão que declara `min-w-0 flex-1` precisa
  encolher, e forçar largura nele **corta** o card. CI trava (1) e (2) via `pnpm --filter
@torcida/web lint:mobile`. Auditoria de tela: `e2e/responsivo.measure.ts`
  (30 rotas × 320/390/430/768-tablet/844-paisagem, mais um teste de
  **estado aberto** que abre modal e mede dentro; precisa de dev server +
  `--project=setup`) e
  `e2e/mobile-audit.measure.ts` (estouro em 25 rotas). **Guia de uso (as quatro
  classes, as regras globais, o que NÃO se corrige e as 6 armadilhas de
  método): `docs/frontend/mobile-first.md`** — leia antes de escrever `min-h-11`
  na mão; quase tudo já é global. Decisão e histórico: `ARCHITECTURE.md` §5.20
  e §5.20.1.
  Existe ainda um **piso global de altura de toque** em todo `a[href]`/`button`/
  `[role=button]`/`[role=tab]`/`summary` (seguro porque `min-height` não se
  aplica a elemento inline); escape explícito: `.app-sem-piso-toque`.
  `.app-inset-x` cobre o recorte lateral do notch em barra que atravessa a tela.
- **Barras de rolagem (2026-09-01):** tratamento global em `globals.css`
  (seção `── Barras de rolagem`), reativo à marca do tenant. Duas armadilhas
  medidas: (1) as duas APIs são **mutuamente exclusivas no Chromium** —
  `scrollbar-color` ou `scrollbar-width` num elemento **desliga** o
  `::-webkit-scrollbar` dele; nunca declarar as duas, e nunca reintroduzir
  `scrollbar-width: thin` num container (o `thin` do Firefox já herda do
  `<html>`); (2) a cor é `--color-primary-fg`, **não** `--color-primary` —
  mesma regra dos badges, senão marca preta some no escuro. Variantes prontas:
  `.app-scrollbar-none` (trilho de abas, feed com snap), `-fina` (popover,
  chat), `-idle` (aparece no hover), `-neutra`, `-sobre-escuro` (superfície
  preta nos dois temas), `-gutter`. Guia e tabela de medições:
  `docs/frontend/scrollbars.md`; decisão: `ARCHITECTURE.md` §5.34.
- **Animações (Motion):** presets em `apps/web/src/lib/motion-presets.ts`; guia em
  `docs/frontend/motion.md`. Novas UIs client seguem os padrões documentados (`MotionShell`,
  `m`, `MotionReveal`, `MotionEmptyState`). Shell já montado em portal/admin/onboarding.
- **Estado em client component (React Compiler, 2026-08-12):** não sincronize
  estado com prop/URL em `useEffect` — ajuste **no render** comparando com o
  último valor sincronizado; e se o effect só corrige algo que já é função de
  outros valores, aquilo não é estado, é derivação. Busca com debounce guarda o
  par `(termo, itens)` da última busca concluída. Antes de inventar hook, use
  `useLatestRef` / `useHidratado` / `useMediaQuery` / `useOnline` (`lib/`).
  Trocar `setState` em effect por escrita em ref no render **não** resolve — só
  troca o aviso de nome. As regras do compilador são **aviso de propósito** em
  `eslint.config.mjs` (limpeza gradual, sem bloquear o build); passivo hoje: 19. Receitas, armadilhas e o que sobrou: `docs/frontend/react-compiler.md` +
  `ARCHITECTURE.md` §5.27.
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
  **Listagens (2026-07-30):** listagem admin com volume declara um
  `ListagemSpec` em `apps/web/src/lib/listagem/specs.ts` (colunas, filtro por
  coluna, busca, sort padrão, `camposProibidos`) e a página usa
  `parseListagemParams` + `montarWhereListagem`/`montarOrderByListagem`/
  `montarPaginacao` + `ListagemToolbar`/`ListagemTh`/`ListagemPaginacao` — nunca
  `buildHref`/`parseSortParam` à mão, nunca `findMany` sem `take`. `sort` só
  aceita coluna declarada e campo sensível é barrado por invariante
  (`lib/__tests__/listagem.test.ts`). GET **não** escreve no banco: correção de
  dado legado é Server Action com `assertPermission` + `AuditLog` (caso
  `sincronizarNumerosSocio`). Guia: `docs/frontend/admin-ui-kit.md` § kit de
  listagem.
- **Fronteira client/server (2026-08-27):** helper **puro** consumido pelos dois
  lados NÃO mora em módulo `'use client'`. Importar uma função de um módulo
  client num Server Component devolve uma **referência de client**, não a
  função; chamá-la derruba a rota inteira com "Attempted to call X() from the
  server". A página responde **200** e renderiza só
  `"Application error: a client-side exception has occurred"` — não aparece em
  log de servidor nem em teste de status. Caso real: `parseAliancaTabId` em
  `/admin/aliancas`; a correção foi extrair para `lib/alianca-tabs.ts` e
  reexportar do módulo client para não quebrar quem já importava.
- **Comentário `///` no `schema.prisma`:** nunca escrever a sequência que fecha
  um bloco JSDoc. O Prisma copia esses comentários para dentro de `/** */` no
  `index.d.ts` gerado; a sequência encerra o comentário no meio, o resto do
  arquivo vira código e o `tsc` quebra com erro absurdo a dezenas de milhares
  de linhas da causa. `lint:mobile` trava isso (regra 4).
- **Dependência externa opcional**: quando uma feature depende de um serviço externo não
  obrigatório (ex.: LiveKit em Salas/Meet), faça o gate com uma função `isXConfigured()`
  e degrade graciosamente em vez de quebrar. Ver `apps/web/src/lib/livekit.ts`.

## Fluxo de trabalho

- Planejar antes de codificar; implementar via agente `implementation` com escopo
  mínimo. Preferir Sonnet ou o modelo Auto da sessão — não fixar Opus para
  planejamento. Ver `docs/agents/README.md`.
- Commit/push só quando pedido. Se estiver na branch default, crie branch antes.

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
- **Brechó** — P2P entre sócios (praça nacional da torcida, não catálogo
  oficial): `apps/web/src/app/portal/loja/brecho/`, `apps/web/src/lib/brecho.ts`;
  regras em `packages/types/src/brecho.js`; `docs/data/modulo-brecho.md`.
- **Confiança na torcida (2026-08-30)** — ledger `ConfiancaEvento` + saldo
  materializado; **não concede permissão**. Recortes 1–4: sinais + AND em
  grupo/canal/sala (tenant) + badge de nível no perfil. Ver
  `docs/data/modulo-confianca.md` e `ARCHITECTURE.md` §5.32.
- **Departamentos / governo** — RBAC por depto + worktree da Visão da torcida:
  `docs/data/modulo-departamentos.md`; seed `packages/db/scripts/seed-departamentos.js`.
  **Preferência ≠ membership (2026-07-17):** onboarding grava
  `SaasMembro.departamentoId`; equipe só após `aprovarMembro` (ou Sem área).
  Repair: `db:repair-departamento-orfaos`.
  **Área sede × unidade (2026-07-30):** `Departamento` é por tenant — quem entra
  por unidade promovida (Caso B) declara `departamentoId` (área na unidade) e
  `departamentoSedeId` (área na Sede, semeada no espelho por
  `departamentoSedeParaEspelho`, sem sobrescrever). Badge/permissão já resolvem
  por `(autor, tenant do post)` — não criar regra de canal para isso.
  **Área é aprovada pelo próprio nível:** vínculo de sócio é first-wins nos dois
  lados, área não — quem não decidiu efetiva depois via
  `efetivarAreaPretendida`. Nunca aplicar `aplicarDepartamentoPreferido` num
  tenant a partir da decisão de outro.
  **Áreas de atuação (2026-08-03):** `DepartamentoArea` +
  `DepartamentoAreaMembro` segmentam frentes dentro do departamento (Agasalho,
  Escolinha da Bateria, Barracão…). **Área NÃO concede permissão** — RBAC
  continua no `Departamento`; `papel: RESPONSAVEL` é accountability, e quem
  gere é `canManageDepartamento`. Regra pura em `resolverAreasDepartamento`
  (`lib/departamentos-portal-access.ts`); conhecimento canônico em
  `packages/types/src/departamento-areas-canonicas.js` (seed
  `seed:departamento-areas`, que nunca sobrescreve `ativa`/`nome`). Cockpit do
  portal usa o loader `[slug]/_lib/contexto.ts`. Bloco sem permissão de
  leitura não aparece (aba, contagem, painel) — quem não aprova a fila não
  vê a aba Fila nem o número de pendentes. Admin: `/admin/departamentos`
  (gate `roles:manage`); pacotes de permissão seguem em `/admin/acessos`.
  Ver `ARCHITECTURE.md` §5.15.
  **Projetos / campanhas (2026-08-03):** `Projeto` + `ProjetoParticipante`
  são o trabalho executado pela área (Agasalho, Festa das Crianças…).
  Projeto também **não** concede permissão; gasto realizado vem da soma
  das `DESPESA` com `projetoId` (não digitado à mão). Portal: bloco
  `#projetos` no cockpit; admin: tab em `/admin/departamentos/projetos`;
  financeiro: rateio opcional `departamentoId`/`projetoId` no lançamento.
  Contrato puro em `packages/types/src/projeto.js`. Ver `ARCHITECTURE.md`
  §5.16.
- **Membros / admissão** — fila `/admin/membros`, reprovação com laudo obrigatório
  (categoria + justificativa + etapas erradas, `CATEGORIAS_REPROVACAO`/
  `PONTOS_REPROVACAO` em `packages/types/src/schemas/membro.js`) e aba de
  histórico com diff campo a campo (`historico-actions.ts`,
  `lib/membro-audit-diff.ts`); ver `docs/data/modulo-associacao.md`
  §reprovação com laudo e §histórico do cadastro.
  **Acesso no card (2026-07-31):** cargo/área/permissão adicional são editados
  na aba **Acessos** do card do membro (`membro-acesso-tab.tsx` +
  `acesso-actions.ts`), que reusa `AccessUserPanel` com `variant="embutido"` —
  a pessoa vem do `membroId` aberto, e o gate é `roles:manage`. Sócios abrem o
  mesmo modal. O log grava diff legível (`lib/acesso-audit-diff.ts`) e a aba
  Histórico lê também `entidade: 'User'`.
- **Liderança / troca de gestão (2026-08-06)** — presidência não é vitalícia.
  Regra única em `apps/web/src/lib/lideranca.ts` (Caso B = cargo `owner` do
  tenant; Caso A = `Sede.responsavelUserId`), com `AuditLog` + notificação dos
  dois lados. Permissão `leadership:transfer` é **só do owner** e diz apenas
  _se_ pode — o alvo sai do **tenant ativo**, resolvido no servidor: presidente
  da Sede não escolhe presidente de subsede promovida. UI: aba Estrutura ›
  Presidência (`/admin/presidencia`) e `/super-admin/liderancas`
  (`lib/liderancas-console.ts`). Promoção a portal **não** herda mais o owner da
  mãe — sem liderança, o portal nasce sem owner; passivo em
  `db:repair-owner-heranca-promocao`. Ver `ARCHITECTURE.md` §5.21.
- **Financeiro** — livro-caixa (`FinanceiroLancamento`): `docs/data/modulo-financeiro.md`;
  portal `/portal/financeiro`, admin `/admin/financeiro`.
- **Bar** — PDV do bar da sede (`/admin/bar`): catálogo, estoque, venda rápida com
  PIX real (gateway reusado) ou Dinheiro/Cartão; estoque isolado por torcida e
  por unidade (SEDE/SUBSEDE/PDE via `sedeId`); integra o Financeiro (categoria
  `BAR`); ver `docs/data/modulo-bar.md`.
- **Patrimônio** — inventário (`PatrimonioItem`): `docs/data/modulo-patrimonio.md`;
  portal `/portal/patrimonio`, admin `/admin/patrimonio`.
- **Bandeiras (2026-08-06)** — 11º departamento canônico, sem módulo novo: é o
  inventário recortado em `categoria: BANDEIRA`. `flags:view`/`flags:manage`
  valem **só** para essa categoria; `patrimony:manage` cobre tudo, inclusive
  bandeira. A trava é da **query** (`resolverEscopoPatrimonio.categoriaTravada`
  em `packages/types/src/patrimonio.js`), nunca da UI, e a edição confere
  categoria de **origem e destino**. Gate web em `lib/patrimonio-authz.ts`;
  vistoria de entrada em `PatrimonioItem.meta.vistoria`; escala de jogo via
  `Evento.partidaId` (sem lista paralela). Portal
  `/portal/departamentos/bandeiras`, admin `/admin/bandeiras`. Ver
  `docs/data/modulo-bandeiras.md` e `ARCHITECTURE.md` §5.22.
- **Caravanas / Bateria** — plugins sobre `Evento.tipo` (`CARAVANA` / `ENSAIO`);
  hubs legado redirecionam para Agenda: `docs/data/modulo-caravanas.md`,
  `docs/data/modulo-bateria.md`. Caravana paga: lotação por `PAGA`, cobrança
  auto ao confirmar, hard-block opcional (`checkInExigePagamento`); ver
  `ARCHITECTURE.md` §5.17.
- **Eventos / Agenda** — hub `/admin/eventos` e `/portal/eventos` (lista/semana/mês);
  `Partida` global por `Afiliacao`; série/waitlist/mapa/QR offline; ver
  `docs/data/modulo-eventos.md` e `ARCHITECTURE.md` §5.11. Fontes de jogos:
  `docs/knowledge/futebol-dados-publicos.md` (Google Sports ≠ API gratuita).
  **Provedor de jogos (decisão #7, 2026-08-12):** API-Football **pago** — o free
  trava em temporadas 2022–2024; sincronizar **por competição**, nunca por clube;
  fonte única (não misturar `football-data.org`, duplica `Partida`). Sonda:
  `pnpm apif:probe`. **Referência da API** (contrato, cota, status de partida,
  pegadinhas, widgets, football-data.org): `docs/knowledge/api-football-referencia.md`;
  decisão + implementação + **runbook de teste local**:
  `docs/data/integracao-api-football.md` e §5.26.
- **Memória (linha do tempo, 2026-08-30)** — `/portal/memoria`. Fases 1–5:
  unidade / torcida / clube; fato atrasado (`MemoriaFato`); aliados bilaterais
  (`Tenant.memoriaAliados`); presença com check-in + opt-in. Entra na top bar
  como **item de menu** (ao lado de Loja), não como ícone do cluster de
  chat/notificações; na CN abre `?escopo=clube` e isola a linha do clube (sem
  caravana de unidade). Na unidade: chip Unidade | Torcida. Espinha pagina o
  mês (todos os dias + busca de data). Admin: `/admin/comunidade/memoria`.
  Contrato `packages/types/src/memoria.js`. Doc `docs/data/modulo-memoria.md`, §5.30.
- **Sofascore Widgets** — embeds oficiais na comunidade (display only; não sync
  de `Partida`): por clube (`SOFASCORE_WIDGETS`) e classificação nacional por
  divisão A/B/C/D (`SOFASCORE_COMPETICOES` + `Afiliacao.serie`). Repair de série:
  `pnpm --filter @torcida/db db:repair-series-afiliacoes`. Ver
  `docs/data/modulo-sofascore-widgets.md`.
- **Catálogo de clubes — fonte por campo (2026-08-27):** cada campo de
  `Afiliacao` tem UMA fonte certa, e usar a errada é o erro clássico do
  domínio — CBF/RNC diz se o clube existe profissionalmente (e dá relevância),
  Wikidata dá fundação/estádio/capacidade/coordenada/site, Ogol dá fundação e
  id externo, a **malha do IBGE valida cidade** (a cidade do clube vinha do
  endereço da torcida: "Estádio Moça Bonita", "571 Curitiba"), Datafolha×Censo
  dá **torcedores** (tier `PESQUISA`) e IBOPE dá **seguidor**, nunca torcedor.
  Cor: paleta curada primeiro, escudo (Cloudinary) como proposta revisável.
  **Nome+UF não é chave** (Bahia × Bahia de Feira) — desempatar por cidade e
  id externo; `chaveCanonicaClube` resolve alias em ciclo. Avaliação das
  fontes: `docs/knowledge/fontes-dados-clubes.md`; medição e antes/depois:
  `docs/data/auditoria-catalogo-clubes.md`; decisões: `ARCHITECTURE.md` §5.29.
  **E o homônimo também está DENTRO da fonte (2026-09-01):** o Wikidata tem uma
  entidade separada para o time **feminino**, o time B, o futsal e o clube
  **extinto**, todas com o mesmo rótulo do clube — a ficha do Corinthians em
  `/super-admin/clubes` era a do time feminino (1997, Alfredo Schürig). Nunca
  casar clube com Wikidata por nome direto: usar `criarResolvedorWikidata`
  (`scripts/lib/catalogo-clubes.js`), que desempata por modalidade (P31 +
  descrição), extinção (P576) e cidade, e **não escolhe** sem evidência — quem
  sobra vira curadoria no bloco `wikidata` de `clubes-correcoes-curadas.json`.
  `audit:catalogo-clubes` §7 é o gate. Ver §5.29.1.
- **Rivalidade tem escopo (2026-08-27):** `EscopoRivalidade` =
  `MUNICIPAL | ESTADUAL | INTERESTADUAL`, e **só os dois primeiros isolam**
  (`ESCOPOS_RIVALIDADE_ISOLANTE` em `@torcida/types`, aplicado em
  `hierarquia.ts` e `perfil-visibilidade.ts`). Clássico interestadual
  (Flamengo × São Paulo) fica gravado como contexto — isolar por ele apagaria a
  malha nacional sem ganho. E nem todo clássico intraestadual isola: o dataset
  `rivalidades-clubes.js` marca `isola` (mesma cidade **ou** clássico nomeado),
  porque "clássico regional" tipo Guarani × São Paulo é jogo tradicional, não
  conflito de torcida. Semear com `seed:rivalidades-clubes`.
- **Comunidade** — feed social, timeline, busca: `apps/web/src/lib/feed.ts`,
  `feed-timeline.ts`, `comunidade-busca.ts`; engajamento (reação/comentário CN):
  `comunidade/actions.ts` (`resolverContextoEngajamento`, `podeEngajarPostVisivel`);
  busca: `modo=rapida` no typeahead, `postIncludeBusca`, SQL membros com
  `GROUP BY` (nunca `DISTINCT`+`ORDER BY similarity`); ver
  `docs/data/modulo-comunidade.md` (§ engajamento / § busca) e
  `docs/data/modulo-comunidade-performance.md`.
  **Criptografia vs moderação (2026-08-07):** Fase A (plaintext + ACL + filas);
  sem E2EE prometido; plano B/C em `docs/data/plano-criptografia-e-moderacao.md`
  e `ARCHITECTURE.md` §5.23.
- **Moderação (2026-09-01)** — deixou de ser feature e virou requisito:
  **STF Tema 987** impõe **dever de cuidado proativo** em discriminação/ódio
  (sem o limiar de "risco sistêmico" que pouparia plataforma pequena), o
  **ECA Digital** (Lei 15.211/2025, vigente desde 17/03/2026) exige preservação
  de prova e comunicação às autoridades, e a **Lei 14.532/2023** agrava racismo
  em contexto esportivo. Princípios do módulo: **rotular ≠ decidir** (sinal vs.
  política, piso da plataforma que o tenant só endurece), **três ações**
  (remover / reduzir alcance / informar) em vez de só `oculto`, **fila de
  retenção**, AND com **Confiança** (§5.32) para escolher quem é classificado,
  **devido processo** (autor notificado + recurso com revisor ≠ decisor) e
  **preservar antes de remover**. Classificação por `claude-haiku-4-5` com a
  política no system prompt sob `cache_control` — **não** usar Perspective API
  (descontinuada após dez/2026); mídia pelos add-ons do Cloudinary. Superfície
  nova de UGC **exige** entrada em `AlvoModeracao` — hoje só Post, DM e brechó
  têm denúncia, e o fórum da praça (cross-tenant, torcidas rivais) não tem.
  Spec: `docs/data/modulo-moderacao.md`; política normativa (e prompt do
  classificador): `docs/data/politica-de-conteudo.md`; pesquisa e fontes:
  `docs/knowledge/moderacao-plataformas.md`; decisão: `ARCHITECTURE.md` §5.33.
- **Design** — personalização visual do tenant (`/admin/design`): marca, ações,
  grade `.app-shell-bg`, superfícies; paletas priorizam torcida→escudo→clube
  (3 cores; sem verde/rival forçado; P&B sem virar marrom); nav/badges usam
  `--color-*-fg`. Domínio: `docs/knowledge/identidade-visual-cores.md`;
  spec: `docs/data/modulo-design.md`.
- **Onboarding** — **malha municipal (2026-08-13):** cidade/UF vêm de
  `apps/web/src/lib/data/municipios-brasil.json` (versionado, 5.571 municípios),
  nunca da API do IBGE em runtime — a chamada por busca com `unstable_cache` de
  30 dias transformava blip de rede em "Nenhuma cidade encontrada" permanente.
  Atualizar com `municipios:atualizar` e commitar o diff.
  Wizard `/onboarding`, escudos (`docs/data/escudos-afiliacoes.md`),
  estimativa torcedores/base digital (`docs/data/torcedores-estimados.md`,
  `docs/knowledge/futebol-dados-publicos.md`); stats em `onboarding-clube-stats.ts`.
- **Super Admin** — operação da plataforma (`/super-admin`), fora do RBAC por
  tenant (gate por allowlist de e-mail, `isSuperAdminEmail`): torcidas, plano,
  catálogo de clubes (`Afiliacao`, `/super-admin/clubes`), unidades
  (`SolicitacaoUnidade`, `/super-admin/unidades` — URL antiga `/afiliacoes`
  redireciona), usuários, moderação e auditoria cross-tenant (inclui ações de
  plataforma com `AuditLog.tenantId` nulo); identidade de build (versão ·
  publicação · commit) na visão geral e rodapé da sidebar — ver
  `docs/data/modulo-super-admin.md` e `docs/ops/release.md`.
  e `ARCHITECTURE.md` §5.24 (inclui pendência: LGPD só tem exportação, exclusão
  de conta ainda não implementada).
- **Canal restrito (R5)** — a liderança de uma unidade Caso B pode isolar o
  canal: sai da malha de **interação** (CN, coirmãs, aliados, salas, lojas, DMs,
  onboarding público, busca) e mantém administração e comunidade **internas**.
  Estado em `apps/web/src/lib/isolamento.ts` (**nunca ler `Tenant.canalRestrito`
  direto** — a expiração dos 5 dias é derivada na leitura); primitiva pura
  `aplicarIsolamento` em `packages/types/src/visibility.js`; UI/estado em
  `lib/canal-restrito.ts`, transições em `lib/canal-restrito-mutacoes.ts`.
  **Estrutural nunca é gateado** (`getAncestorTenantIds`,
  `getDescendantTenantIds`, `getTorcidaLineageTenantIds`, `getTorcidaWorktree`,
  `getTenantHierarquia`) — só relação/visibilidade e os conjuntos por
  `afiliacaoId`. Entrada da unidade restrita é por `/convite/<slug>`
  (`lib/convite.ts`), que **não** pula e-mail nem apelido. Ver
  `docs/data/modulo-canal-restrito.md` e `ARCHITECTURE.md` §5.13.
- `ARCHITECTURE.md` — decisões fechadas (§5) e itens em aberto (§6).
