# Módulo Comunidade — perfil social e feed

Hub social multi-tenant em `/portal/comunidade`: feed de posts de membros,
comunicados oficiais, perfis unificados, seguimento com aprovação, busca de
membros, enquetes, repost, hashtags, grupos públicos e destaques no perfil.

## Modelo de dados

| Entidade | Tabela | Papel |
|---|---|---|
| `Post` | `saas_posts` | Publicações (`MEMBRO` ou `INSTITUCIONAL`); `visibilidade`: `PUBLICO`, `TENANT`, `PRIVADO`; `postOrigemId` (repost de post), `comunicadoOrigemId` (repost de comunicado), `eventoId` (post sobre evento) |
| `PerfilMembro` | `saas_perfis_membro` | Bio, banner, privacidade, toggles de exibição (por tenant); `avatarUrl` na tabela é legado — ver nota de avatar abaixo |
| `PerfilDestaque` / `PerfilDestaqueItem` | — | Destaques estilo stories no perfil |
| `Seguimento` | `saas_seguimentos` | Grafo social; status `PENDENTE` / `APROVADO` / `REJEITADO` |
| `Comentario` / `Reacao` | — | Engajamento (`CURTIR`; valores legados `FORCA`/`VAMOS`/`PRESENTE` no banco contam como curtida) |
| `EnquetePost` / `OpcaoEnquetePost` / `VotoEnquetePost` | — | Enquetes embutidas em posts |
| `Hashtag` / `PostHashtag` | — | Hashtags por tenant |
| `PostSalvo` | `saas_post_salvos` | Bookmarks privados por usuário |
| `MomentoStory` | `saas_momentos_story` | Momentos efêmeros (24h) no feed |
| `FeedTimeline` | `saas_feed_timeline` | Timeline materializada por viewer (fan-out on write) para feed de rede/seguindo |
| `Conversa` (`comunidade: true`) | `saas_conversas` | Grupos temáticos (público/privado); posts do mural via `Post.conversaId` |
| `Conversa` (`tipo: CANAL`) | `saas_conversas` | Canais institucionais e comunidades temáticas (M3); mural só-admin opcional |
| `SaasMembro` | — | Dados operacionais (cidade, sede) exibidos no perfil com opt-in |

## Avatar (2026-07-21)

Identidade única do usuário: avatar sempre lido/gravado em `User.avatarUrl`
(global), nunca por torcida. `getAvatarAtualDoUsuario(userId)` (sem
`tenantId`) é o ponto único de leitura (cache `unstable_cache`, invalidado por
`revalidateTag` no upload/sync OAuth). `PerfilMembro.avatarUrl` existia como
override por tenant e causava 3 fotos divergentes para o mesmo usuário
(torcida A, torcida B e feed cada um lendo uma fonte diferente); descontinuado
como fonte de exibição — a coluna segue no schema, mas a aplicação não lê nem
escreve nela. Banner (`bannerUrl`/`bannerPos`) e bio continuam por torcida.

## Privacidade

Função central: `podeVerConteudoSocial` em `apps/web/src/lib/perfil-social.ts`.
Permalink de posts usa também `podeVerPost` em `apps/web/src/lib/feed.ts` (perfil +
visibilidade do post).

- **Perfil público** (`perfilPrivado: false`): posts visíveis no feed conforme a visibilidade do post (`PUBLICO` / `TENANT` / `PRIVADO`). Com perfil **privado**, o composer lista `PUBLICO` desabilitado e oferece modal para abrir `/portal/comunidade/perfil/{userId}?aba=sobre&foco=privacidade` (destaque no checkbox); o servidor rejeita tentativa de bypass.
- **Perfil privado**: só o próprio usuário e seguidores com status `APROVADO` veem publicações, fotos e atividade — a visibilidade do post não abre o conteúdo para quem não segue.
- **Sócio**: default privado (aprovação + create sem preferência). Pode tornar público na aba Sobre e salvar; upload de capa/foto não altera a privacidade.
- **Torcedor**: permanece sempre público.
- O feed principal (`/portal/comunidade`) prioriza **descoberta** (posts públicos de fora da rede).
- **Minha rede** (`/portal/comunidade/rede`) mostra só posts de quem você segue + os seus.

## Rotas portal

| Rota | Descrição |
|---|---|
| `/portal/comunidade` | Feed descoberta + composer + aside |
| `/portal/comunidade/rede` | Feed só da sua rede (quem você segue) |
| `/portal/comunidade/post/[id]` | Permalink de uma publicação |
| `/portal/comunidade/perfil/[userId]` | Perfil unificado (abas + destaques) |
| `/portal/comunidade/perfil/[userId]/seguidores` | Lista de seguidores |
| `/portal/comunidade/perfil/[userId]/seguindo` | Lista de quem segue |
| `/portal/comunidade/busca` | Busca unificada (membros, hashtags, posts) |
| `/portal/comunidade/seguindo` | Solicitações pendentes recebidas |
| `/portal/comunidade/salvos` | Publicações salvas pelo usuário |
| `/portal/comunidade/hashtag/[tag]` | Posts com a hashtag |
| `/portal/comunidade/grupos` | Grupos públicos (criar/entrar) |
| `/portal/comunidade/grupos/[id]` | Página do grupo (mural + link ao chat) |
| `/portal/comunidade/canais` | Canais oficiais e comunidades temáticas |
| `/portal/comunidade/canais/[id]` | Detalhe do canal (mural + chat) |
| `/portal/comunidade/unidade/[tenantId]` | Perfil institucional da unidade (sede/subsede/PDE) |
| `/portal/comunidade/notificacoes` | Central de notificações sociais |
| `/portal/comunidade/videos` | Reels e posts com vídeo (grade ou vertical) |
| `/portal/perfil` | Redireciona para o perfil social do usuário logado |

## API

| Endpoint | Uso |
|---|---|
| `GET /api/comunidade/membros?q=` | Busca membros aprovados em tenants visíveis |
| `GET /api/comunidade/busca?q=&modo=` | Busca unificada (membros + hashtags + posts); `modo=rapida` (dropdown do feed) pula canais/unidades, badges e enrich de follow; `modo=completa` (default) na página `/busca` |
| `GET /api/comunidade/feed?cursor=&take=&filtro=` | Paginação do feed (Descobrir / Seguindo) |
| `GET /api/comunidade/rede?cursor=&take=` | Paginação de Minha rede |
| `GET /api/comunidade/feed/stream` | Long-poll — ping de novos posts (sem payload) |
| `GET /api/comunidade/notificacoes?filtro=` | Lista notificações sociais com filtro |
| `GET /api/conversas/resumo` | Badge de mensagens + bloqueio de inbox (sem lista de conversas) |
| `POST /api/upload/sign` | Assinatura Cloudinary (`purpose`: comunidade, perfil-banner, perfil-avatar) |

## Server Actions (`comunidade/actions.ts`)

- `publicarPost`, `publicarPostNacional`, `publicarEnquete`, `publicarPostEvento`, `editarPost`, `excluirPost`, `repostarPost`, `repostarComunicado`
- `solicitarSeguir`, `deixarDeSeguir`, `aprovarSeguimento`, `rejeitarSeguimento`
- `atualizarPerfilSocial`, `criarDestaquePerfil`
- `comentarPost`, `reagirPost`, `votarEnquetePost`, `encerrarEnquetePost`, `listarComentariosPost`, `denunciarPost`
- `fixarPostPerfil`, `salvarPost`, `removerPostSalvo`
- `marcarNotificacaoLida`, `marcarTodasNotificacoesLidas`
- `criarGrupo`, `entrarGrupoPublico`, `pedirEntradaGrupo`, `decidirPedidoGrupo`, `sairGrupo`, `alternarSilencioGrupo`, `publicarPostGrupo`, `publicarMomentoStory`
- `criarCanalTematico`, `entrarCanal`, `publicarPostCanal`

Notificações de menção, comentário, reação e repost apontam para
`/portal/comunidade/post/[id]` via `linkPostComunidade()`.

### Engajamento (`reagirPost` / `comentarPost`) — invariantes (2026-07-17)

O feed (torcida **e** Comunidade Nacional) lista posts cujo `tenantId` pode ser
o tenant sintético do clube (`Tenant.sintetico`) ou outra unidade da mesma
afiliação — **não** só o tenant ativo do viewer. Mutações de overlay devem
cobrir o mesmo conjunto.

| Regra | Detalhe |
|-------|---------|
| Contexto | `resolverContextoEngajamento()` — sócio `APROVADO` com `COMMUNITY_POST`, **ou** torcedor global / preview sem vínculo (escopo = `afiliacaoId` do clube). Não usar só `assertPermission` + `tenantId` do viewer. |
| Gate do post | `podeEngajarPostVisivel` — fast-path: próprio tenant, ou mesmo clube (sintético / `PUBLICO`); fallback: `resolveVisibleTenantIdsForFeed` (exportado de `feed.ts`). |
| Leitura de comentários | `listarComentariosPost` — gate pela **visibilidade do post**, sem exigir tenant do viewer (torcedor global lê comentários de posts `PUBLICO`). |
| UI | `PostEngagement` é otimista; o servidor confirma / reverte no catch. |
| Sintoma clássico de regressão | POST em `/portal/comunidade` com *“An error occurred in the Server Components render”* ao curtir post da CN → lookup com `tenantId: tenant.id` ou authz sem tenant. |

Helpers e actions: `apps/web/src/app/portal/comunidade/actions.ts`.
Performance do hot path: `docs/data/modulo-comunidade-performance.md` § engajamento.

### Publicar post — invariantes (2026-07-17)

O feed infinito é **estado client** (TanStack Query). Publicar com sucesso
**não** depende de `revalidatePath` / `router.refresh` para o card aparecer.

| Regra | Detalhe |
|-------|---------|
| UI imediata | Composer dispara `comunidade:post-publicado` (+ preview); o infinite faz prepend otimista. |
| Action | Sem `revalidatePath('/portal/comunidade')`; caminho crítico = create + timeline do autor; resto em `after()`. Tags via `invalidarLeituraComunidade`. |
| SSE / live | Banner **não** faz `router.refresh` perto do topo — só refetch Query. |
| Descobrir | Ranking unificado; resposta usa `feed.posts` (não preferir só `postsSugeridos` e dropar o post do autor). |
| Medir | `e2e/publish-latency.measure.ts` — baseline local ~520 ms até o card; não micro-otimizar abaixo disso sem regressão. |

Detalhe: `docs/data/modulo-comunidade-performance.md` § “Publicar + feed client”.

### Busca (`buscarComunidade`) — invariantes (2026-07-17)

Typeahead no feed e página `/portal/comunidade/busca` compartilham
`GET /api/comunidade/busca` + `apps/web/src/lib/comunidade-busca.ts`.

| Regra | Detalhe |
|-------|---------|
| Modos | `modo=rapida` (dropdown do feed) vs `modo=completa` (default, página Buscar). Rápida: sem canais/unidades, sem badges, sem follow/contagens; posts via `postIncludeBusca` / `projetarPostBusca`; limites menores. |
| SQL membros + `pg_trgm` | **Nunca** `SELECT DISTINCT … ORDER BY similarity(...)`. Postgres `42P10` (“ORDER BY expressions must appear in select list”) derruba a API inteira. Usar `GROUP BY m.user_id, u.nome` + `MAX(similarity(bio))`. |
| Fallback | Sem extensão: `isPgTrgmUnavailableError` → `null` → ILIKE Prisma. Outros erros **não** viram “lista vazia”. |
| UX dropdown | `comunidade-search-bar.tsx` chama `?modo=rapida`; **erro HTTP ≠ vazio** — mostrar mensagem de erro (a página completa já fazia isso). |
| Canais (completa) | `buscarCanaisEUnidades`: gate `podeVerCanal` em **paralelo** (`Promise.all`), não em série. |
| Escopo | `resolveVisibleTenantIdsForFeed` (mesmo do feed): na CN (tenant sintético) inclui TOs do clube — `getVisibleTenantIds` sozinho deixa sugestões/membros vazios. **Membros/hashtags/canais** usam esse conjunto largo de TOs direto. **Posts na CN** usam um gate extra (`orFeedNacionalDescobrir`, igual ao feed nacional): só `tenant.sintetico` ∪ `alcanceNacional` ∪ autor em `Seguimento APROVADO` do viewer — nunca todo `tenantId IN visibleTenantIds`, senão PUBLICO de qualquer TO (ex.: Gaviões) vaza pra CN. Vale no path `pg_trgm` (`buscarPostIdsPorTrgm` com `opts.nacional`) e no fallback ILIKE (`OR: orFeedNacionalDescobrir(seguidos)`). Sempre `PUBLICO` + `tipo=MEMBRO` + sem `conversaId`. **Sugestões CN:** `PerfilTorcedor` da afiliação é a fonte principal (ranking `torcedorDoClube`); sócios de TO entram depois. `?escopo=nacional` na página/API. Canais na CN: só `PUBLICO`. |
| Sintoma clássico | Digitar 2+ chars → “Nenhum resultado” para nomes que existem → checar Network: 400 com `42P10` / Prisma raw, ou UI engolindo `!res.ok`. |

Performance / ganhos: `docs/data/modulo-comunidade-performance.md` § busca (B6.1).
Pós-deploy: `pnpm --filter @torcida/db db:enable-pg-trgm`.

## Integração torcida (Sprint 4)

- **Repost de comunicados**: botão "Compartilhar" nos comunicados oficiais; embed no feed via `PostComunicadoEmbed`.
- **Post sobre evento**: composer com modo evento; card com RSVP embutido (`PostEventoEmbed`).
- **Badges no feed**: sede e cargo do autor nos cards (`autor-badges.ts`). Rótulo
  de cargo é contextual por `tipoSede` (`rotuloCargoBadge`/`rotuloCargoSistema` em
  `packages/types/src/permissions.js`: `OWNER` → "Presidente" na Sede, "Liderança"
  em subsede/PDE). **Fallback de `tipoSede` (2026-07-21)**: quando o `SaasMembro`
  não tem `sedeId` (torcida com Sede única no cadastro), `getBadgesPorAutorTenant`
  usa o tipo da Sede raiz do próprio tenant (`Sede.sedeId: null`) em vez de assumir
  `'SEDE'` — sem isso, uma subsede/PDE promovida a tenant próprio (Caso B) exibia
  "Presidente" para o dono. **Card do sócio na Comunidade (2026-07-21)**: o mesmo
  cargo (via `getBadgesPorAutorTenant`) agora aparece em
  `ComunidadeUserCardSection` (`_components/comunidade-user-card-section.tsx`),
  computado por `getComposerContext` — reage ao `tenantId` ativo (troca junto com
  o tenant, inclusive ao abrir um canal de outra unidade).
- **Moderação**: link "Ver post" na fila em `/admin/comunidade/moderacao`.

## Engajamento e lives (Sprint 5)

- **Central de notificações** — `/portal/comunidade/notificacoes` com filtros (menções, reposts, reações, seguimento) e marcar todas como lidas.
- **Badges na nav** — contadores em Notificações e Solicitações no menu lateral da Comunidade.
- **Recap de sala** — ao encerrar uma live, publica post automático no feed com total de participantes.
- **Limite de menções** — máximo de 10 menções por post/comentário; rate limit ao notificar.
- **Ao vivo no aside** — widget de salas ativas no aside desktop (mobile já tinha).
- **Canais sugeridos no rail direito (2026-07-22)** — entre "Salas ao vivo" e
  "Mensagens": até 4 canais visíveis em que o viewer ainda não está inscrito
  (`getSugestoesCanaisParaAside` em `lib/canais.ts`, UI em
  `_components/canais-sugeridos-aside.tsx`, montado em `ComunidadeLayoutChrome`).
  Prioriza canais do tenant ativo, depois oficiais, depois por nº de membros.
  Inclui abertos (Entrar) e fechados (Pedir), inclusive cross-tenant quando
  `podeVerCanal`. Botão "Ver canais" no rodapé → `/portal/comunidade/canais`. "Para seguir"
  permanece no aside esquerdo (→ `/portal/comunidade/busca`).
- **Scroll independente dos rails (2026-07-22)** — colunas esquerda e direita usam
  `sticky` + `max-h-[calc(100dvh-5.5rem)]` + `overflow-y-auto`
  (`COMUNIDADE_RAIL_SCROLL`); o feed central continua no scroll da página.

## Grupos, stories e vídeos (Sprint 6)

- **Transferência de admin** — `PATCH /api/conversas/[id]/membros` promove outro membro e rebaixa o admin atual; botão "Tornar admin" no painel de membros.
- **Mural do grupo** — posts com `conversaId` ficam só no mural (`/portal/comunidade/grupos/[id]`); não entram no feed principal.
- **Momentos 24h** — `MomentoStory` com `expiraEm`; anéis no topo do feed; viewer fullscreen.
- **Reels / Vídeos** — `/portal/comunidade/videos` lista posts MEMBRO **PÚBLICO** com
  vídeo nativo (Cloudinary `/video/upload/` ou `.mp4`/`.webm`/`.mov`/`.m4v`) no feed
  e nos murais de grupos do viewer.
  - **UI** — modo Reels (snap vertical, autoplay mudo, barra de progresso, tap pausa,
    double-tap curte) e Grade (poster Cloudinary + contagens; toque abre fullscreen
    no índice). Ordenação **Recentes** / **Em alta** (mesma heurística do Descobrir).
  - **Engajamento in-player** — rail Curtir / Comentários (sheet) / Salvar / Compartilhar
    reusa actions do feed (`reagirPost`, `comentarPost`, `salvarPost`); sem entidade Reel.
  - **Criação** — empty state e dock (`+` em `/videos`) → `?compose=1&media=video`.
  - Embeds (YouTube/TikTok/Instagram/X) e stories (`MomentoStory`) **não** entram.
  - Loader: SQL com `unnest(midia_urls)` (`getPostsComVideo`); helpers em `lib/videos.ts`.

## Canais institucionais (M3 mensageria)

**Redesenho 2026-07-21 — canal como feed, não como tela própria:**
`/portal/comunidade/canais/[id]` é a única rota de visualização (`canal-feed-view.tsx`
+ `canal-feed-composition.tsx`); `/portal/comunidade/unidade/[tenantId]` virou um
resolver que checa `podeVerCanal` (hierarquia/aliados), provisiona o canal oficial
(`getOrCreateCanalOficial`) e redireciona para `/canais/[canalOficialId]` — sem tela
de "perfil institucional" própria (cabeçalho grande + abas Mural/Comunicados/Eventos
foi removido; `Announcement`/eventos da unidade não aparecem mais nessa tela — Agenda
cobre eventos separadamente; comunicados oficiais continuam globais/fora do canal —
não são `Post`, então nunca entram no mural nichado). O canal reusa os mesmos blocos
visuais do feed principal: `ComunidadePostsSection`/`ComunidadeFeedInfinite` ganharam
um modo `filtro: 'canal'` + `conversaId` que chama `getPostsDoCanal` (paginado por
cursor, mesmo formato de `getPostsParaFeed`/`getPostsDaRede`), renderizado com o
mesmo `ComunidadePostsAnimated`/`FeedPostCard` de sempre. A página ganhou a mesma
coluna esquerda do feed (`ComunidadeAsideRail`, extraída de `ComunidadeFeedShell` —
card do sócio + nav + widgets); cabeçalho do canal continua fino (escudo + nome +
badge Oficial/Temático + membros).

**Redesenho 2026-07-21 (cont.) — composer único:** o canal publica com o **mesmo**
`FeedComposer` do feed principal (`canal-composer-section.tsx`), não uma caixa de
texto própria — mídia, menções, emoji e sticker idênticos. A prop `canal={{
conversaId, nome }}` troca o alvo da publicação (`publicarPostCanal`, mesmo
`useActionState`/`PublicarPostState`/preview otimista de `publicarPost`) e some com
enquete/evento/seletor de alcance (visibilidade do canal é sempre "membros do
canal", não escolha do autor). `publicarPostCanal` ganhou suporte a `midias` e
passou a invalidar o cache do feed (`invalidarLeituraComunidade`) — mesmo caminho de
pós-publicação (`agendarPosPublicacaoFeed`: hashtags, menções, audit) do post normal.
O contexto do composer (`getComposerContext` — perfil privado, bloqueio de
publicação) é resolvido pelo **tenant ativo de quem publica**, não por
`canal.tenantId` — é o que `publicarPostCanal`/`assertPermission` checam de fato
(publicar num canal só funciona com o tenant ativo igual ao dono do canal).

- **Dois fluxos distintos de identidade ao abrir um canal**:
  - **Vínculo próprio** (o usuário é sócio aprovado do tenant dono do canal) → troca
    real de tenant via `TorcidaContextSwitcher`/`trocarTorcidaAction` (torcida/lib
    de troca já existente) — leva pro portal real daquela torcida, sem overlay.
  - **Demais casos** (hierarquia sem vínculo próprio, canal temático) → override
    cosmético: `NavbarBrandOverrideProvider`/`useNavbarBrandOverride`
    (`apps/web/src/lib/navbar-brand-override.tsx`) + `CanalNavbarOverride`
    (montado dentro de `canal-feed-composition.tsx`) trocam nome/escudo/cor no
    canto esquerdo da `PortalNavbar` enquanto a rota está ativa, sem tocar sessão,
    tenant ativo real ou permissões — reverte ao sair da rota.
- **Canal oficial** — um `Conversa` `tipo: CANAL` com `canalOficial: true` por tenant
  (`getOrCreateCanalOficial`); publicação restrita a admins (`CHANNELS_MANAGE`,
  `COMMUNITY_MANAGE` ou `ANNOUNCEMENTS_PUBLISH`); avatar resolvido com fallback
  `Sede.fotoUrl` (sede raiz) → `Tenant.logoUrl` quando `Conversa.avatarUrl` é nulo
  (`resolveAvatarCanalOficial` em `lib/canais.ts`) — não depende de setar
  `Conversa.avatarUrl` manualmente. Governança segue o RBAC do tenant da unidade
  (sem cascata especial de permissão por `Sede.tipo`). **Topbar (2026-07-24)**:
  `resolveTenantLogoUrl` / `resolverContextoComunidade` priorizam
  `Sede.fotoUrl` da raiz sobre `Tenant.logoUrl` (Design), depois canal oficial —
  a foto da unidade em `/admin/sedes` atualiza header e canais; Street View
  fica só nas listagens de localização.
- **Listagem e visibilidade (2026-07-22):**
  - Gate puro em `decidePodeVerCanal` (`canais-shared.ts`): `PUBLICO` = vitrine
    (sócio **e** torcedor no alcance comunidade); `TENANT`/`HIERARQUIA`/`ALIADOS`
    = **só sócio** (mesmo no tenant do canal). Aliados só entram com
    `ALIADOS` ou `PUBLICO`.
  - Default de canal oficial/temático novo: `visibilidadeCanal: ALIADOS` (antes
    `HIERARQUIA`, que escondia aliados). `ensureCanaisOficiaisHierarquia` também
    promove oficiais ainda em `HIERARQUIA` → `ALIADOS` na worktree do viewer
    (temáticos não são tocados; liderança pode fechar de novo em Configurações).
  - `/portal/comunidade/canais` chama `ensureCanaisOficiaisHierarquia(tenantId, viewerId)`:
    materializa oficial do tenant ativo + descendentes Caso B + unidades Caso A
    (SUBSEDE/PDE sem `Sede.canalConversaId`) em toda a worktree. Não cria canal de
    ancestral/aliado por efeito colateral. **Regra (2026-07-22):** SUBSEDE/PDE
    nascem com canal oficial **privado** (`publica: false`) e **sem** admin
    local — `criadoPorId` só preenche FK (liderança do tenant ou viewer); a
    propriedade é atribuída depois em Configurações / membros. Criação em
    `/admin/sedes` (`criarSede`) e backfill
    `pnpm --filter @torcida/db db:ensure-canais-oficiais-unidades` usam o mesmo
    helper `ensureCanalOficialParaSede`. **Torcidas (nacional, 2026-07-22):**
    toda `Tenant` ativa da plataforma também tem mural oficial privado
    (ligado à `Sede` tipo SEDE) via
    `pnpm --filter @torcida/db db:ensure-canais-oficiais-torcidas` (ou
    `db:ensure-canais-oficiais` = torcidas + unidades); o seed
    `seed:torcidas-tenants` já provisiona o canal na criação. Abrir na
    listagem vai a `/canais/[id]` (não `/unidade/[tenantId]`), para Caso A
    não colidir no mural do portal-mãe.
  - `pedirEntradaCanal` aceita canal fechado de **qualquer** tenant desde que
    `podeVerCanal` (antes filtrava só `tenantId` ativo — listagem mostrava Pedir
    e a action falhava).
  - **Grupos** (`tipo: GRUPO`) criados por torcedores **não** entram nesta
    listagem — ficam em `/portal/comunidade/grupos` (superfície distinta).
- **Comunidades temáticas** — sócios com `CHANNELS_MANAGE`/`COMMUNITY_MANAGE` criam
  canais (`criarCanalTematico`, aceita `avatarUrl` opcional) com visibilidade
  `TENANT`/`HIERARQUIA`/`ALIADOS`/`PUBLICO`; criador vira `MembroConversa` ADMIN.
  **Delegação de admin**: `alterarAdminCanal(conversaId, targetUserId, papel)`
  (só para canais não-oficiais; quem chama precisa ser ADMIN do canal ou ter
  `CHANNELS_MANAGE`/`COMMUNITY_MANAGE` no tenant; alvo precisa já ser membro ativo)
  — exposta no menu "..." do cabeçalho do canal, grava `AuditLog`.
- **Edição de canal (2026-07-21) — duas superfícies, RBAC diferente:**
  - **Canal oficial** — seção "Canal oficial" em `/admin/configuracoes`
    (`CanalOficialForm` em `config-forms.tsx` + `salvarCanalOficial` em
    `admin/configuracoes/actions.ts`, gate `PERMISSIONS.SETTINGS_MANAGE`).
    Edita `nome`/`descricao`/`avatarUrl`/`visibilidadeCanal`/
    `somenteAdminPublica`/`publica` do canal do **tenant ativo de quem
    acessa** (`getOrCreateCanalOficial(tenant.id)` — só resolve/cria quando
    `isOwner`, pra não materializar o canal como efeito colateral de uma
    visita sem a permissão real). Para uma subsede/PDE promovida a tenant
    próprio (Caso B), é a liderança logada no próprio painel admin da unidade
    que edita o canal dela — não o admin da Sede-mãe mexendo numa linha de
    `Sede`.
  - **Canal temático** — modal "Configurações do canal" no menu "..." do
    próprio canal (`CanalConfigModal` em `canal-feed-composition.tsx` +
    `atualizarCanalTematico` em `comunidade/actions.ts`), visível pra quem já
    vê "Gerenciar administradores" (`canal.souAdmin && !canal.canalOficial`);
    a action rejeita `canal.canalOficial` no servidor como segunda camada.
    Mesmos campos do canal oficial; formulário nativo (`useActionState` +
    `<form action={...}>`, sem `preventDefault`/`FormData` manual).
  - Schemas compartilhados: `editarCanalOficialSchema`/
    `atualizarCanalTematicoSchema` em `packages/types/src/comunidade-social.js`
    (`canalEditavelBase` comum; o temático soma `conversaId`).
- **Canal fechado + pedido de entrada (2026-07-21):** `Conversa.publica: false`
  agora significa "entrada mediante pedido", mesmo modelo já usado por Grupos
  — reaproveita o enum `StatusMembroConversa` (`ATIVO`/`PENDENTE`/`REJEITADO`)
  em vez de uma tabela de solicitação separada. `CanalItem` ganhou
  `pedidoPendente` (deriva do `status` do `MembroConversa` do viewer;
  `souMembro`/`souAdmin` agora exigem `status: 'ATIVO'`, não só existência da
  linha).
  - **Canal oficial** — `getOrCreateCanalOficial` cria com `publica: false`
    por padrão (fechado); a liderança abre em `/admin/configuracoes` (mesmo
    form `CanalOficialForm`/`salvarCanalOficial` da seção anterior).
  - **Canal temático** — `criarCanalTematico` ganhou parâmetro `publica`
    (checkbox "Canal privado" no form de criação em `canais-client.tsx`,
    default aberto).
  - **Pedir entrada**: `pedirEntradaCanal(conversaId)` — upsert de
    `MembroConversa` em `PENDENTE`, notifica (`CANAL_PEDIDO`) os admins locais
    do canal (temático) + quem tem `CHANNELS_MANAGE`/`COMMUNITY_MANAGE` no
    tenant. Botão "Pedir para entrar" no cabeçalho do canal
    (`canal-feed-composition.tsx`) e na listagem (`canais-client.tsx`);
    `canal.pedidoPendente` mostra "Pedido enviado" (desabilitado) em vez de
    duplicar o pedido.
  - **Decidir pedido**: `decidirPedidoCanal(conversaId, userId, aprovar)` —
    autoridade via `podeGerenciarPedidosCanal` (`lib/canais.ts`): admin local
    do canal (temático) OU `CHANNELS_MANAGE`/`COMMUNITY_MANAGE` no tenant;
    canal oficial soma `ANNOUNCEMENTS_PUBLISH` (não delega admin via
    `MembroConversa` — ver nota em `alterarAdminCanal`). Aprovar seta
    `status: ATIVO`; recusar seta `REJEITADO` (linha persiste, permite novo
    pedido depois via upsert). Notifica `CANAL_APROVADO`/`CANAL_REJEITADO`.
  - **UI de aprovação**: modal "Pedidos pendentes" no menu "..." do canal
    (`PedidosCanalModal`), com badge de contagem; lista vem de
    `listPedidosCanal(conversaId)` (sem gate próprio — quem chama já checou
    `podeGerenciarPedidosCanal`, mesmo padrão de `listMembrosCanal`).
  - **Notificações**: `TipoNotificacao` ganhou `CANAL_PEDIDO`/
    `CANAL_APROVADO`/`CANAL_REJEITADO` (enum Prisma — exigiu `db:generate` +
    `db:push`); registradas em `notification-item-visual.tsx` (ícone/título) e
    `notificacoes-routing.ts` (`escopo: 'social'`, mesmo de `GRUPO_*`).
  - **Publicar no canal exige membership** (`publicarPostCanal`): quem ainda
    não é membro só auto-entra se `canal.publica`; canal fechado retorna erro
    ("aguarde aprovação") em vez de inscrever — sem isso, o gate de
    pedido/aprovação virava decoração (qualquer torcedor com `COMMUNITY_POST`
    podia publicar direto).
- **Remover / adicionar membro do canal (2026-07-21):** mesma autoridade de
  `decidirPedidoCanal` (`podeGerenciarPedidosCanal`) — mas **independe** de o
  canal ser aberto ou fechado (moderação e convite direto valem pros dois).
  - **Remover** (`removerMembroCanal`): kick de um membro `ATIVO` — seta
    `saiuEm: now()` + `status: REJEITADO`. Isso distingue de um pedido
    recusado (`REJEITADO` com `saiuEm: null`) e **não é um ban permanente**:
    a pessoa pode pedir entrada de novo e passa pelo mesmo fluxo de
    aprovação. Bloqueia remover a si mesmo (`ExpectedError`).
  - **Adicionar direto** (`adicionarMembroCanal`): convite ativo da
    liderança sem esperar pedido — upsert direto pra `ATIVO`, notifica
    reaproveitando `CANAL_APROVADO` (mesmo efeito prático de "foi aceito").
    Candidatos vêm de `listCandidatosMembroCanal(tenantId, conversaId)`
    (sócios `APROVADO` do tenant, exceto quem já está ativo no canal, capado
    em 200 — mesmo padrão do seletor de responsável em `admin/sedes`).
  - **Histórico de recusados**: `listPedidosCanal(conversaId, status)` ganhou
    o segundo parâmetro (`'PENDENTE' | 'REJEITADO'`, default `PENDENTE`);
    aba "Recusados" no mesmo `PedidosCanalModal` (só leitura, sem novo
    fetch/rota).
  - **UI**: modal "Gerenciar membros" (renomeado de "Gerenciar
    administradores") no menu "..." — some pro canal oficial que já tinha
    `souAdmin` do criador original mas nunca teve delegação real; agora abre
    sempre que há qualquer autoridade de governança (`podeGerenciarAdmins ||
    podeGerenciarMembros`). Toggle admin continua exclusivo do canal
    temático. Cross-link novo: item "Editar canal oficial" no menu do canal
    oficial, apontando pra `/admin/configuracoes#canal-oficial` — antes não
    havia NENHUM caminho da tela do canal até suas configurações.
  - **Bug corrigido nesta rodada**: `listMembrosCanal` filtrava só
    `saiuEm: null`, sem checar `status` — pedidos `PENDENTE` vazavam pra
    dentro da lista de "membros" no modal de admin. Corrigido pra exigir
    `status: 'ATIVO'`, mesmo cuidado que `souMembro`/`souAdmin` já tinham em
    `CanalItem`.
  - **Gerenciar membros (2026-07-21)**: modal "Gerenciar membros" (renomeado
    de "Gerenciar administradores" — `GerenciarMembrosModal` em
    `canal-feed-composition.tsx`) ganha duas abas de autoridade independentes:
    `podeGerenciarAdmins` (só temático — promover/rebaixar ADMIN, como antes)
    e `podeGerenciarMembros` (== `podeGerenciarPedidosCanal`, vale pra oficial
    e temático — remover membro ativo ou adicionar direto sem esperar
    pedido). Actions: `removerMembroCanal`/`adicionarMembroCanal`
    (`comunidade/actions.ts`), mesma autoridade de `decidirPedidoCanal`;
    remover seta `saiuEm` + `status: REJEITADO` (sem bloqueio permanente —
    pedir entrada de novo passa pelo fluxo normal). Candidatos pra adicionar
    direto vêm de `listCandidatosMembroCanal` (`SaasMembro` aprovados do
    tenant, exclui quem já está ativo no canal). `PedidosCanalModal` ganhou
    aba "Recusados" (`listPedidosCanal(conversaId, 'REJEITADO')`).
- **Busca** — `/api/comunidade/busca` (`modo=completa`) inclui canais e unidades da hierarquia visível; typeahead do feed usa `modo=rapida` (sem canais). Invariantes: § busca acima.
- **Permissão** — `channels:manage` (owner/admin por padrão; rodar `repair-system-role-permissions` em produção).

## Formato de menções e hashtags

- Menção: `@[Nome](user:uuid)` — parser em `packages/types/src/comunidade-social.js`
- Hashtag: `#tag` (2–40 caracteres) — normalizada sem acentos

## Visibilidade cross-tenant

Comunidade é **público-na-hierarquia** (`packages/types/src/visibility.js`):
`getVisibleTenantIds(tenant, 'comunidade')` define o escopo de posts e busca.

- **Seguimento é um grafo GLOBAL, não por tenant**: `@@unique([seguidorId, seguidoId])`
  em `Seguimento` **não** inclui `tenantContextoId` — um usuário só pode seguir
  outro uma única vez em toda a plataforma, mesmo que o encontre em contextos
  de tenant diferentes (o contexto é só guardado, não faz parte da unicidade).
  Enum de status inclui `BLOQUEADO` além de `PENDENTE`/`APROVADO`/`REJEITADO`.
- **Comunidade Nacional / alcance por afiliação**: `Tenant.sintetico` marca o
  tenant-container onde vivem os posts de torcedores globais (sem organizada
  própria); posts `PUBLICO` de quem tem `COMMUNITY_POST_NACIONAL` gravam
  `Post.alcanceNacional` e **bypassam o gate de seguir** — qualquer torcedor da
  mesma afiliação vê no feed nacional, mesmo sem seguir o autor. No composer,
  “Público” e o antigo “Torcida e torcedores” são a mesma opção.
- **Shell dual Nacional × Torcida (2026-07-22)**: query `?escopo=nacional|torcida`.
  Torcedor (sem sócio `APROVADO`) só vê a aba Nacional; sócio aprovado alterna
  as duas. Chrome (menu, salas, chat, canais sugeridos) monta nos dois escopos.
  No Nacional: feed `getPostsFeedNacional` / `getPostsFeedNacionalSeguindo` /
  `getPostsFeedNacionalGrupos` com infinite scroll via
  `/api/comunidade/feed?escopo=nacional&afiliacaoId=…&filtro=`; SSE em
  `/api/comunidade/feed/stream?escopo=nacional&afiliacaoId=…`; salas = sintético CN ∪ `ABERTA` das
  TOs do clube (`listSalasNacionais`); canais sugeridos = só `PUBLICO`
  (`listCanaisPublicosPorAfiliacao`); DMs/grupos stampam `tenantId` sintético
  com gate `mesmaAfiliacaoComunidade` / `assertComunidadeNacional`. **Nunca**
  vazam canais `TENANT`/`HIERARQUIA`/`ALIADOS`, salas `EVENTO`/`DM_GRUPO` nem
  posts `TENANT`/`PRIVADO` para o escopo Nacional. Authz CN:
  `apps/web/src/lib/authz.ts` (`assertComunidadeNacional`,
  `assertPodeAcessarSalaNacional`).
- **Composer único Nacional (2026-07-23)**: a aba Nacional usa o mesmo
  `FeedComposer` da torcida com prop `nacional` (mídia/vídeo, emoji, stickers,
  menções; sempre `PUBLICO`; sem enquete/evento/alcance). Action
  `publicarPostNacional` → tenant sintético. Typeahead de menções:
  `/api/comunidade/membros?escopo=nacional`.
- **Torcedor global pode publicar mesmo PENDENTE**: `assertAutorPublicacaoPost`
  (`apps/web/src/lib/authz.ts`) diferencia sócio de torcedor — um torcedor com
  onboarding concluído na mesma afiliação publica posts com visibilidade
  `PUBLICO` mesmo com `StatusMembro = PENDENTE` (ainda não aprovado como sócio);
  só o sócio `APROVADO` pode publicar em qualquer visibilidade.

## Canais e mensageria (M3) — candidato a doc próprio

O bloco "Canais institucionais" acima cobre só a superfície de produto. O
modelo de dados subjacente é maior e ainda não tem doc dedicado:
`Conversa.tipo = CANAL` + `canalOficial` + `institucional` + `VisibilidadeCanal`
(`TENANT` / `HIERARQUIA` / `ALIADOS` / `PUBLICO`, default `HIERARQUIA`) +
`somenteAdminPublica`. Se o módulo crescer além de canal oficial + temáticos,
vale extrair para `docs/data/modulo-mensageria.md`.

## Upload de mídia

- Posts: `torcida/{tenantId}/comunidade`
- Perfil: `torcida/{tenantId}/perfis/{userId}/banner|avatar`
- Validação server-side com `isCloudinaryUrl` em `social-embed.ts`

## UI e animações

Feed, stories, engajamento e demais interações usam **Motion** (`motion` v12).
Presets e padrões de implementação: [`docs/frontend/motion.md`](../frontend/motion.md).
Shell atual: `apps/web/src/app/portal/comunidade/layout.tsx` (`MotionShell`).

## Performance e escalabilidade

Otimização entregue em **2026-07-16**: infinite scroll com cursor, timeline
materializada (`FeedTimeline`), ranking heurístico do Descobrir, busca `pg_trgm`,
caches por escopo, SSE de feed (ping **após** fan-out), auto-refetch no topo /
banner se rolado, resumo leve de mensagens e leitura única de salas ao vivo.

**2026-07-22 (dual Nacional × Torcida):** filtros reais Seguindo/Grupos no
Nacional, prepend otimista + pull-to-refresh, cache Nacional 45s, SSE por
afiliação, ranking Descobrir Nacional (1ª página), badges com tag de
invalidação, sugestões de busca com ranking por unidade/atividade.

**Documentação completa, pós-deploy, ganhos estimados (%) e plano futuro:**
[`docs/data/modulo-comunidade-performance.md`](modulo-comunidade-performance.md)
(§ ondas dual 2026-07-22).

**Padrões a preservar:** batch de privacidade/visibilidade, separar cache público
de overlay por usuário, inbox completa só ao expandir chat, ping SSE pós-fan-out
(não na action de publicar), feed client atualizado no publish (evento/prepend —
não só RSC), chrome salas/chat no layout ao sair do feed, `React.cache` em
`listSalasAtivas`/`getActiveTenant`, busca typeahead `modo=rapida` + SQL
`GROUP BY` (nunca `DISTINCT`+`similarity`), tipos explícitos em queries Prisma.
Agente: `performance` (ver `docs/agents/README.md`). Teto zero-custo (~85–95%);
reabrir plano só com gatilho do doc.

## Insights administrativos (2026-07-22)

Nova `lib/comunidade-insights.ts`: `resumirEngajamento` (posts/reações/
comentários no período vs anterior + interações por dia + denúncias abertas;
`Reacao`/`Comentario` escopam via `post: { tenantId }`) e
`resumirLeituraComunicados` (read-rate = leituras de `AnnouncementRead` ÷
membros aprovados). Superfícies: `InsightSection` no hub `/admin/comunidade`
(gates `COMMUNITY_MANAGE` / `ANNOUNCEMENTS_PUBLISH` respeitados) e seção
Comunidade em `/admin/relatorios`. Padrões: `docs/frontend/admin-ui-kit.md`.
