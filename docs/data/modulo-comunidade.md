# Módulo Comunidade — perfil social e feed

Hub social multi-tenant em `/portal/comunidade`: feed de posts de membros,
comunicados oficiais, perfis unificados, seguimento com aprovação, busca de
membros, enquetes, repost, hashtags, grupos públicos e destaques no perfil.

## Modelo de dados

| Entidade | Tabela | Papel |
|---|---|---|
| `Post` | `saas_posts` | Publicações (`MEMBRO` ou `INSTITUCIONAL`); `visibilidade`: `PUBLICO`, `TENANT`, `PRIVADO`; `postOrigemId` (repost de post), `comunicadoOrigemId` (repost de comunicado), `eventoId` (post sobre evento) |
| `PerfilMembro` | `saas_perfis_membro` | Bio, banner, avatar social, privacidade, toggles de exibição (por tenant) |
| `PerfilDestaque` / `PerfilDestaqueItem` | — | Destaques estilo stories no perfil |
| `Seguimento` | `saas_seguimentos` | Grafo social; status `PENDENTE` / `APROVADO` / `REJEITADO` |
| `Comentario` / `Reacao` | — | Engajamento (`CURTIR`, `FORCA`, `VAMOS`, `PRESENTE`) |
| `EnquetePost` / `OpcaoEnquetePost` / `VotoEnquetePost` | — | Enquetes embutidas em posts |
| `Hashtag` / `PostHashtag` | — | Hashtags por tenant |
| `PostSalvo` | `saas_post_salvos` | Bookmarks privados por usuário |
| `MomentoStory` | `saas_momentos_story` | Momentos efêmeros (24h) no feed |
| `FeedTimeline` | `saas_feed_timeline` | Timeline materializada por viewer (fan-out on write) para feed de rede/seguindo |
| `Conversa` (`publica: true`) | `saas_conversas` | Grupos temáticos abertos; posts do mural via `Post.conversaId` |
| `Conversa` (`tipo: CANAL`) | `saas_conversas` | Canais institucionais e comunidades temáticas (M3); mural só-admin opcional |
| `SaasMembro` | — | Dados operacionais (cidade, sede) exibidos no perfil com opt-in |

## Privacidade

Função central: `podeVerConteudoSocial` em `apps/web/src/lib/perfil-social.ts`.
Permalink de posts usa também `podeVerPost` em `apps/web/src/lib/feed.ts` (perfil +
visibilidade do post).

- **Perfil público** (`perfilPrivado: false`): posts públicos visíveis no feed e perfil.
- **Perfil privado** (default): só o próprio usuário e seguidores com status `APROVADO` veem publicações, fotos e atividade.
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
| `GET /api/comunidade/feed/stream` | SSE — ping de novos posts (sem payload) |
| `GET /api/comunidade/notificacoes?filtro=` | Lista notificações sociais com filtro |
| `GET /api/conversas/resumo` | Badge de mensagens + bloqueio de inbox (sem lista de conversas) |
| `POST /api/upload/sign` | Assinatura Cloudinary (`purpose`: comunidade, perfil-banner, perfil-avatar) |

## Server Actions (`comunidade/actions.ts`)

- `publicarPost`, `publicarEnquete`, `publicarPostEvento`, `editarPost`, `excluirPost`, `repostarPost`, `repostarComunicado`
- `solicitarSeguir`, `deixarDeSeguir`, `aprovarSeguimento`, `rejeitarSeguimento`
- `atualizarPerfilSocial`, `criarDestaquePerfil`
- `comentarPost`, `reagirPost`, `votarEnquetePost`, `encerrarEnquetePost`, `listarComentariosPost`, `denunciarPost`
- `fixarPostPerfil`, `salvarPost`, `removerPostSalvo`
- `marcarNotificacaoLida`, `marcarTodasNotificacoesLidas`
- `criarGrupoPublico`, `entrarGrupoPublico`, `publicarPostGrupo`, `publicarMomentoStory`
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

## Integração torcida (Sprint 4)

- **Repost de comunicados**: botão "Compartilhar" nos comunicados oficiais; embed no feed via `PostComunicadoEmbed`.
- **Post sobre evento**: composer com modo evento; card com RSVP embutido (`PostEventoEmbed`).
- **Badges no feed**: sede e cargo do autor nos cards (`autor-badges.ts`).
- **Moderação**: link "Ver post" na fila em `/admin/comunidade/moderacao`.

## Engajamento e lives (Sprint 5)

- **Central de notificações** — `/portal/comunidade/notificacoes` com filtros (menções, reposts, reações, seguimento) e marcar todas como lidas.
- **Badges na nav** — contadores em Notificações e Solicitações no menu lateral da Comunidade.
- **Recap de sala** — ao encerrar uma live, publica post automático no feed com total de participantes.
- **Limite de menções** — máximo de 10 menções por post/comentário; rate limit ao notificar.
- **Ao vivo no aside** — widget de salas ativas no aside desktop (mobile já tinha).

## Grupos, stories e vídeos (Sprint 6)

- **Transferência de admin** — `PATCH /api/conversas/[id]/membros` promove outro membro e rebaixa o admin atual; botão "Tornar admin" no painel de membros.
- **Mural do grupo** — posts com `conversaId` ficam só no mural (`/portal/comunidade/grupos/[id]`); não entram no feed principal.
- **Momentos 24h** — `MomentoStory` com `expiraEm`; anéis no topo do feed; viewer fullscreen.
- **Reels** — `/portal/comunidade/videos` com modo vertical (snap scroll + autoplay) e grade.

## Canais institucionais (M3 mensageria)

- **Perfil oficial por unidade** — `/portal/comunidade/unidade/[tenantId]` agrega comunicados, mural institucional, eventos e canal oficial auto-provisionado.
- **Canal oficial** — um `Conversa` `tipo: CANAL` com `canalOficial: true` por tenant; publicação restrita a admins (`CHANNELS_MANAGE`, `COMMUNITY_MANAGE` ou `ANNOUNCEMENTS_PUBLISH`).
- **Comunidades temáticas** — admins criam canais com visibilidade `TENANT` / `HIERARQUIA` / `ALIADOS` / `PUBLICO`.
- **Busca** — `/api/comunidade/busca` inclui canais e unidades da hierarquia visível.
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
  própria); `Post.alcanceNacional` faz o post **bypassar o gate de seguir** —
  qualquer torcedor da mesma afiliação vê, mesmo sem seguir o autor. Publicar
  com `alcanceNacional` exige `COMMUNITY_POST_NACIONAL`.
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

**Documentação completa, pós-deploy, ganhos estimados (%) e plano futuro:**
[`docs/data/modulo-comunidade-performance.md`](modulo-comunidade-performance.md).

**Padrões a preservar:** batch de privacidade/visibilidade, separar cache público
de overlay por usuário, inbox completa só ao expandir chat, ping SSE pós-fan-out
(não na action de publicar), tipos explícitos em queries Prisma. Agente:
`performance` (ver `docs/agents/README.md`). Teto zero-custo (~85–95%); reabrir
plano só com gatilho do doc.
