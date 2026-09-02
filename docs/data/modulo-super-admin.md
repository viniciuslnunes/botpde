# Módulo — Super Admin (operação da plataforma)

> Painel `/super-admin`, isolado do admin de tenant: gestão de torcidas (tenants),
> afiliações cross-tenant, usuários, moderação, auditoria e relatórios operacionais
> em nível de **plataforma** — não de uma torcida específica.

## Autorização

Não usa RBAC por tenant (`assertPermission`/roles). Acesso é por **allowlist de
e-mail**: `SUPER_ADMIN_EMAILS` (env var) → `apps/web/src/lib/env.ts`
(`superAdminEmails`) → `isSuperAdminEmail(email)` em
`apps/web/src/lib/tenant-context.ts`. Todas as páginas de `/super-admin/*`
repetem o guard `if (!isSuperAdminEmail(session.user.email)) redirect('/')`
(o `layout.tsx` já barra o acesso, mas cada page confere de novo por
segurança — server actions confiam só no próprio guard, nunca no layout).

Queries deste módulo são **cross-tenant por natureza** — a exceção documentada
em `CLAUDE.md` para `Afiliacao`/`Partida`/`Noticia` (sem filtro de `tenantId`)
se aplica aqui também: as libs em `apps/web/src/lib/super-admin/` e as queries
inline nas pages não filtram por tenant, propositalmente.

## Shell e navegação

`apps/web/src/components/super-admin/super-admin-shell.tsx` — shell próprio
(topbar + sidebar com drawer mobile), independente do `AdminShell` do tenant,
mas seguindo os mesmos tokens de tema (`rgb(var(--*))`) e o mesmo padrão de
drawer via portal. Menu em `super-admin-nav.tsx`
(`SUPER_ADMIN_NAV_ITEMS`, array local — não usa `packages/types/src/menu.js`,
que é RBAC por tenant). Badges de contagem (`afiliacoes`, `moderacao`) vêm de
`contarPendentesSuperAdmin()` (`lib/super-admin/pendentes-badges.ts`),
buscado uma vez no `layout.tsx` e repassado via prop — sem polling/SSE (baixo
volume de tráfego no super-admin não justifica o custo do
`use-admin-navbar-context` do admin). Rodapé discreto da sidebar:
`AppBuildMetaSidebar` (`vX.Y.Z · commit`).

## Build (versão · publicação · commit)

Identidade do deploy, **só** no Super Admin (portal/admin de tenant não
mostram):

| Campo | Fonte |
|---|---|
| Versão | `1.<commits_main>.<commits_totais>` (Git no build; fallback `package.json`) via `NEXT_PUBLIC_APP_VERSION` |
| Publicação | ISO do build (`NEXT_PUBLIC_APP_PUBLISHED_AT`), exibida em fuso SP |
| Commit | `RAILWAY_GIT_COMMIT_SHA` / `NEXT_PUBLIC_APP_COMMIT` (link GitHub) |

Helper: `apps/web/src/lib/app-version.ts` + `scripts/lib/version-from-git.mjs`.
UI: `AppBuildMetaCard` na visão geral e `AppBuildMetaSidebar` no shell.
Processo: `docs/ops/release.md` (`ARCHITECTURE.md` §5.25).

## Rotas

| Rota | Função |
|---|---|
| `/super-admin` | Dashboard — KPIs agregados (`lib/super-admin/plataforma-dashboard.ts`) + card **Build da plataforma** (versão · publicação · commit) |
| `/super-admin/torcidas` | Hub: trocar de torcida (switcher com busca sob demanda), listagem paginada no banco (`LISTAGEM_SUPER_ADMIN_TORCIDAS`), transferir owner |
| `/super-admin/setup` | Criar tenant; lista todos os tenants (ativos e inativos) com busca (`tenants-lista-cliente.tsx`), toggle ativo/inativo, seletor de plano |
| `/super-admin/clubes` | Catálogo global de clubes (`Afiliacao`) — CRUD, rivalidades, métricas, qualidade |
| `/super-admin/unidades` | Fila de solicitações de unidade (subsede/PDE) de todas as torcidas |
| `/super-admin/afiliacoes` | Redirect permanente → `/super-admin/unidades` (URL legada em notificações) |
| `/super-admin/usuarios` | Busca de usuário por e-mail/nome/@nickname + vínculos em todos os tenants + exportação LGPD |
| `/super-admin/moderacao` | Fila cross-tenant de denúncias (post/mensagem) pendentes |
| `/super-admin/auditoria` | `AuditLog` de todas as torcidas **e** ações de plataforma (`tenantId` nulo), com filtro por torcida/ação/busca |
| `/super-admin/relatorios/perfis-torcedores-privados` | Relatório de perfis marcados como privados |

## Padrões de mutação

Toda ação de escrita segue o mesmo esqueleto: `'use server'`, gate
`superAdminEmails.includes(email)`, Zod, `db.$transaction`, `auditLog.create`
com `tenantId` do **registro afetado** (não do host da requisição — o
super-admin não está "dentro" de nenhum tenant). **Exceção:** mutações sobre
entidade global (`Afiliacao` / catálogo de clubes) gravam `tenantId: null` —
a UI de auditoria mostra "Plataforma" nesse caso. Ações que espelham uma
operação que também existe no admin do tenant (moderação de denúncia)
gravam `detalhes.viaSuperAdmin: true` no `AuditLog`, para o admin local saber
que a ação veio da operação da plataforma, não de alguém da própria diretoria.

Referências: `torcidas/actions.ts` (`alternarAtivoTenantAction`,
`alterarPlanoTenantAction`), `liderancas/actions.ts`
(`transferirLiderancaSuperAdmin`, `removerLiderancaSuperAdmin`),
`moderacao/actions.ts` (`resolverDenunciaSuperAdminAction` e pares),
`clubes/actions.ts` (CRUD + rivalidades do catálogo).

## Catálogo de clubes (2026-08-11)

`Afiliacao` é o time apoiado (referência global). O super-admin edita o catálogo
em `/super-admin/clubes`:

| Aba | Rota | Função |
|---|---|---|
| Catálogo | `/super-admin/clubes` | Listagem (`LISTAGEM_SUPER_ADMIN_CLUBES`) + disclosure de criar |
| Métricas | `/super-admin/clubes/metricas` | KPIs + distribuição + rankings + adesão (`clubes-metricas.ts`) |
| Qualidade | `/super-admin/clubes/qualidade` | Contagens por campo faltante + fila acionável (teto 30) |
| Detalhe | `/super-admin/clubes/[id]` | Form completo, rivais, uso, histórico |
| Métricas do clube | `/super-admin/clubes/[id]/metricas` | Torcidas-raiz + unidades lazy (`carregarUnidadesDaTorcida`) |

Contrato puro em `packages/types/src/afiliacao.js` (`ClubeSchema`,
`completudeClube`, `bloqueiosExclusaoClube`, `slugClube`). Escudo sobe com
purpose `clube-escudo` (Cloudinary). Arquivar (`ativo: false`) é o caminho
padrão; exclusão definitiva só com vínculos zerados (Cascade em
`Partida`/`Noticia` apagaria histórico). Ver `ARCHITECTURE.md` §5.24.

**Torcida ≠ portal Caso B:** listagens e KPIs de "torcidas" usam
`carregarMapaPortalMae` / `filtrarTenantsRaiz` (`lib/tenant-hierarquia-plataforma.ts`)
para excluir portais de unidade promovida. Feeds/CN por `afiliacaoId` continuam
incluindo todos os tenants do clube.

**Quantas torcidas o clube tem (2026-08-12):** fonte única
`listarTorcidasDoClube(afiliacaoId)` — raiz + `ativo: true` + `sintetico: false`.
As três exclusões são independentes e cada uma já inflou um número em produção:
o container sintético da CN (12 clubes), portal de unidade Caso B e tenant
suspenso (Corinthians exibia 10 na CN e 7 no super-admin; são 6 — a "FIEL
CUBATÃO" é erro de registro, arquivada). **Nunca** derivar a contagem de
`getTenantIdsPorAfiliacao().length`: aquele conjunto é o *escopo do feed*
nacional, e sintético + Caso B publicam ali sem serem torcidas — a CN conta por
`contarTorcidasDoClubeNaCN` (mesma fonte + corte R5).
Invariante em `lib/__tests__/tenant-hierarquia-plataforma.test.ts`.

**Listar é contar (2026-09-01):** a versão de 2026-08-12 deixou a torcida
arquivada **na lista**, com o selo "Suspensa", e tirou só do KPI. Na prática o
card "Uso do clube" ficou com **7 nomes sob um KPI de 6** e a "FIEL CUBATÃO"
seguia parecendo a sétima torcida do Corinthians — o selo não desfazia a
impressão. Agora as duas superfícies do clube (card do detalhe e aba Métricas)
partem do **mesmo conjunto**: `WHERE_TENANT_E_TORCIDA` (`ativo` + `sintetico`)
exportado de `lib/tenant-hierarquia-plataforma.ts`, mais o corte de raiz. Tenant
suspenso não é torcida do clube: **não conta, não aparece e não soma
sócios/posts** ao clube (o `where` das contagens de membro é o mesmo). O selo
"Suspensa" saiu do nível da torcida; **unidade** inativa continua com o selo,
porque unidade desativada é estado normal de operação. Torcida suspensa segue
fora do switcher de `/super-admin/torcidas` (já era `ativo: true`): se o caso é
erro de registro, o caminho é `db:excluir-torcida-erro -- --slug=<slug>`
(dry-run por padrão), não arquivar e conviver.

A fila de **unidades** (subsede/PDE) ficou em `/super-admin/unidades` — o menu
não chama mais as duas coisas de "Afiliações".

## Lideranças (2026-08-06)

`/super-admin/liderancas` mostra a **árvore real** — torcida no topo, portais de
unidade (Caso B) e unidades sem portal (Caso A) abaixo — com quem lidera cada
linha, KPI de "sem liderança" e o filtro **"só onde eu lidero"**, que responde
"de quais portais eu virei dono sem querer?". Loader:
`lib/liderancas-console.ts`; regra de escrita: `lib/lideranca.ts` (a mesma que o
presidente usa na aba Estrutura › Presidência). O super-admin passa
`exigirMembroAprovado: false` — só a plataforma consegue dar presidência a um
portal recém-promovido, ainda sem quadro associativo.

Substituiu o painel `TransferirOwnerPainel` de `/super-admin/torcidas`, que
listava tenants em ordem alfabética sem distinguir Sede raiz de subsede
promovida. Ver `ARCHITECTURE.md` §5.21.

## Acesso a Salas/Feed de qualquer torcida (2026-07-27)

Super admin entra em qualquer torcida (sede, subsede ou PDE) via
`selecionarTorcidaAction`/`selecionarUnidadeAction`
(`apps/web/src/app/admin/tenant-context-actions.ts`, cookie `torcida_ctx`) e
`getActiveTenant` já tem bypass de vínculo (`apps/web/src/lib/tenant.ts:184`).
A partir daí, dois pontos que checam `SaasMembro` (não permissão RBAC) também
ganharam bypass de leitura para super admin, sem exigir associação real:

- **Feed** — `podeVerFeedSocios` (`apps/web/src/lib/feed.ts`) libera posts
  "Só torcida" (`TENANT`) para super admin mesmo sem `SaasMembro APROVADO`.
  Puramente leitura: não afeta publicar/reagir/comentar (`assertMembroAtivo`
  continua exigindo vínculo real para escrita).
- **Salas** — `assertSalaMembro` (`apps/web/src/lib/salas-api.ts`) permite
  super admin entrar/ver qualquer sala (mensagens, participantes, enquetes)
  sem `SaasMembro`, marcando o contexto com `isSuperAdminViewer: true`. Os
  chamadores de escrita (enviar mensagem, votar em enquete) checam essa flag
  e bloqueiam com 403 — oversight é só leitura, não equivale a virar membro.
  Criar/moderar mídia/encerrar sala já funcionavam via `assertPermission`
  (RBAC tem bypass próprio) — não mudou.
- **Departamentos** — após selecionar a unidade (`torcida_ctx`), o super-admin
  vê todos os departamentos daquele tenant (navbar `temDepartamentos`, hub
  portal, cockpit, módulo admin). Gestão (equipe, áreas, projetos, cor) exige
  RBAC/`DepartamentoGestor` real — `assertPodeGerirArea` e pares **não**
  fazem early-return para SA. Dual-hat (SA + `roles:manage` / gestor na
  própria torcida) continua gerindo pelo cargo. Ver
  `lib/departamentos-portal-access.ts` e `docs/data/modulo-departamentos.md`.

## Suporte da plataforma — configurações “Somente owner” (2026-08-03)

Entrar numa torcida não dá ao super admin as configurações reservadas ao
presidente. `assertPermission` tem bypass, mas `assertTenantOwner` sempre foi um
gate à parte — o super admin via o formulário em `/admin/configuracoes` e a
gravação estourava com “Apenas o owner pode alterar esta configuração”.

Regra atual, **isolada por unidade** (`Tenant.suportePlataforma`, sempre lido
por `apps/web/src/lib/suporte-plataforma.ts` — nunca o campo direto):

| Estado da unidade | Super admin edita as seções “Somente owner”? |
| --- | --- |
| Sem ninguém com cargo `owner` | **Sim** — não há quem configure a unidade |
| Com owner, suporte desligado (default) | Não — erro pedindo a liberação |
| Com owner, suporte ligado pela liderança | **Sim** |

- Gate único: `assertOwnerOuSuportePlataforma` (`lib/authz.ts`), usado por todas
  as ações “Somente owner” de `admin/(plataforma)/configuracoes/actions.ts`.
- Toggle: `salvarSuportePlataforma`, gate `assertTenantOwner` **estrito** — o
  super admin não liga a própria chave; ele só vê o estado (read-only) na seção
  `#suporte-plataforma`. Ligar/desligar grava `SUPORTE_PLATAFORMA_ATIVADO` /
  `SUPORTE_PLATAFORMA_DESATIVADO` no `AuditLog` da unidade.
- Escopo: cada tenant tem a própria chave. Ligar na Sede não libera nenhuma
  subsede/PDE, e vice-versa.
- UI: seção que o usuário não pode gerir **não aparece** — ver
  `ARCHITECTURE.md` §5.18. Invariantes:
  `apps/web/src/lib/__tests__/suporte-plataforma.test.ts`.

## Moderação vs criptografia (2026-08-07)

O super-admin lê conteúdo denunciado (posts em claro; DMs com minimização)
porque a plataforma ainda opera na **Fase A**: plaintext + ACL + filas. Não há
E2EE; “SA lê” e “servidor cego” são mutuamente excludentes. Evolução futura
(envelope com escrow, depois E2EE só em DM com moderação sem plaintext):
`docs/data/plano-criptografia-e-moderacao.md` e `ARCHITECTURE.md` §5.23.

## Pendências conhecidas

- **LGPD — exclusão/anonimização de conta (fase 2)**: só existe exportação
  read-only (`lib/super-admin/exportar-dados-usuario.ts`, botão em
  `/super-admin/usuarios`). Exclusão real foi deixada de fora deliberadamente:
  toca ~21 models com FK direta em `User` (identidade, comércio, comunidade,
  mensageria) e cruza tenants (um `User` pode ter `SaasMembro` em vários
  tenants ao mesmo tempo). Depende de resolver antes o furo de visibilidade
  cross-tenant já registrado em `docs/knowledge/contexto-legal.md`.
- **Badge de contagem no menu**: implementado só para "Unidades"
  (`SolicitacaoUnidade` PENDENTE) e "Moderação" (`Denuncia` +
  `DenunciaMensagem` PENDENTE). "Auditoria" não tem um conceito de
  pendência — não existe badge lá.

## Seletor de torcida — semente + busca (2026-09-02)

O switcher **não** recebe as torcidas todas. O layout manda
`listarTorcidasParaSelecaoSemente`: topo alfabético (30) mais a torcida ativa;
o resto chega por `buscarTorcidasParaSelecaoAction` conforme o operador digita.
Medido com 557 tenants: **142,6 KB → 7,9 KB** por navegação, em toda rota
`/super-admin/*` e em todo `/admin/*` navegado por super-admin.

Ao mexer aqui:

- **Não volte a chamar `listarTorcidasParaSelecao` num layout.** Ela é a lista
  completa e existe hoje só para o `<select>` de filtro de
  `/super-admin/auditoria`, que é HTML de uma página só. Cache de servidor não
  conserta payload: `unstable_cache` já cobria a query, e o custo era byte.
- **A semente precisa conter o item ativo.** Sem ele o input do combobox não
  tem como exibir o próprio rótulo, e o campo abre em branco sobre uma torcida
  selecionada.
- **Contar torcidas é `contarTorcidasDaPlataforma()`**, nunca
  `tenant.count({ ativo, sintetico: false })` — este último conta os portais
  Caso B como torcida (era a origem do "557 torcida(s) ativa(s)" sobre uma
  lista de 554). O recorte canônico é `whereTenantEhTorcida()`, fonte única de
  contar e de listar.

Decisão e medições: `ARCHITECTURE.md` §5.35.
