# Módulo Comunidade — perfil social e feed

Hub social multi-tenant em `/portal/comunidade`: feed de posts de membros,
comunicados oficiais, perfis unificados, seguimento com aprovação, busca de
membros, enquetes, repost, hashtags, grupos públicos e destaques no perfil.

## Modelo de dados

| Entidade | Tabela | Papel |
|---|---|---|
| `Post` | `saas_posts` | Publicações (`MEMBRO` ou `INSTITUCIONAL`); `visibilidade`: `PUBLICO`, `TENANT`, `PRIVADO`; `postOrigemId` para repost |
| `PerfilMembro` | `saas_perfis_membro` | Bio, banner, avatar social, privacidade, toggles de exibição (por tenant) |
| `PerfilDestaque` / `PerfilDestaqueItem` | — | Destaques estilo stories no perfil |
| `Seguimento` | `saas_seguimentos` | Grafo social; status `PENDENTE` / `APROVADO` / `REJEITADO` |
| `Comentario` / `Reacao` | — | Engajamento (`CURTIR`, `FORCA`, `VAMOS`, `PRESENTE`) |
| `EnquetePost` / `OpcaoEnquetePost` / `VotoEnquetePost` | — | Enquetes embutidas em posts |
| `Hashtag` / `PostHashtag` | — | Hashtags por tenant |
| `PostSalvo` | `saas_post_salvos` | Bookmarks privados por usuário |
| `Conversa` (`publica: true`) | `saas_conversas` | Grupos temáticos abertos |
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
| `/portal/comunidade/busca` | Busca de membros |
| `/portal/comunidade/seguindo` | Solicitações pendentes recebidas |
| `/portal/comunidade/salvos` | Publicações salvas pelo usuário |
| `/portal/comunidade/hashtag/[tag]` | Posts com a hashtag |
| `/portal/comunidade/grupos` | Grupos públicos (criar/entrar) |
| `/portal/comunidade/videos` | Posts com vídeo |
| `/portal/perfil` | Redireciona para o perfil social do usuário logado |

## API

| Endpoint | Uso |
|---|---|
| `GET /api/comunidade/membros?q=` | Busca membros aprovados em tenants visíveis |
| `POST /api/upload/sign` | Assinatura Cloudinary (`purpose`: comunidade, perfil-banner, perfil-avatar) |

## Server Actions (`comunidade/actions.ts`)

- `publicarPost`, `publicarEnquete`, `editarPost`, `excluirPost`, `repostarPost`
- `solicitarSeguir`, `deixarDeSeguir`, `aprovarSeguimento`, `rejeitarSeguimento`
- `atualizarPerfilSocial`, `criarDestaquePerfil`
- `comentarPost`, `reagirPost`, `votarEnquetePost`, `encerrarEnquetePost`, `listarComentariosPost`, `denunciarPost`
- `fixarPostPerfil`, `salvarPost`, `removerPostSalvo`
- `criarGrupoPublico`, `entrarGrupoPublico`

Notificações de menção, comentário, reação e repost apontam para
`/portal/comunidade/post/[id]` via `linkPostComunidade()`.

## Formato de menções e hashtags

- Menção: `@[Nome](user:uuid)` — parser em `packages/types/src/comunidade-social.js`
- Hashtag: `#tag` (2–40 caracteres) — normalizada sem acentos

## Visibilidade cross-tenant

Comunidade é **público-na-hierarquia** (`packages/types/src/visibility.js`):
`getVisibleTenantIds(tenant, 'comunidade')` define o escopo de posts e busca.

## Upload de mídia

- Posts: `torcida/{tenantId}/comunidade`
- Perfil: `torcida/{tenantId}/perfis/{userId}/banner|avatar`
- Validação server-side com `isCloudinaryUrl` em `social-embed.ts`
