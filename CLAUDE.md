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
pnpm --filter @torcida/web lint
pnpm --filter @torcida/web test       # Vitest (RBAC, rate-limit, visibilidade)
pnpm --filter @torcida/db db:generate # prisma generate
pnpm --filter @torcida/db db:push     # sincroniza schema (NÃO há migrations)
pnpm --filter @torcida/db schema:check # exit 1 se schema mudou (pós-deploy: HML/prod ainda precisam de push)
pnpm --filter @torcida/db schema:deploy # db:push no alvo (HML/prod; prod exige --i-know-prod) — ver docs/ops/schema-deploy.md
pnpm --filter @torcida/db db:enable-pg-trgm  # extensão + índices busca Comunidade
pnpm --filter @torcida/db seed:loja-gavioes  # catálogo demo Gaviões (tenant pde-gavioes-fiel)
pnpm --filter @torcida/db seed:departamento-areas    # áreas de atuação canônicas por departamento
pnpm --filter @torcida/db db:repair-canais-departamentos # canais internos depto/área + roster
pnpm --filter @torcida/db seed:torcedores-estimados  # IBOPE Top 50 + teto 10 mil (offline)
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
  `eslint.config.mjs` (limpeza gradual, sem bloquear o build); passivo hoje:
  19. Receitas, armadilhas e o que sobrou: `docs/frontend/react-compiler.md` +
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
  portal usa o loader `[slug]/_lib/contexto.ts` e mostra bloco sem permissão
  como `blocked` com motivo, não escondido. Admin: `/admin/departamentos`
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
  *se* pode — o alvo sai do **tenant ativo**, resolvido no servidor: presidente
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
- **Sofascore Widgets** — embeds oficiais na comunidade (display only; não sync
  de `Partida`): por clube (`SOFASCORE_WIDGETS`) e classificação nacional por
  divisão A/B/C/D (`SOFASCORE_COMPETICOES` + `Afiliacao.serie`). Repair de série:
  `pnpm --filter @torcida/db db:repair-series-afiliacoes`. Ver
  `docs/data/modulo-sofascore-widgets.md`.
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
