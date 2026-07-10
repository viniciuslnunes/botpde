# Módulo Comunidade — perfil social e feed

Hub social multi-tenant em `/portal/comunidade`: feed de posts de membros,
comunicados oficiais, perfis unificados, seguimento com aprovação e busca de
membros.

## Modelo de dados

| Entidade | Tabela | Papel |
|---|---|---|
| `Post` | `saas_posts` | Publicações (`MEMBRO` ou `INSTITUCIONAL`); `visibilidade`: `PUBLICO`, `TENANT`, `PRIVADO` |
| `PerfilMembro` | `saas_perfis_membro` | Bio, banner, avatar social, privacidade, toggles de exibição (por tenant) |
| `Seguimento` | `saas_seguimentos` | Grafo social; status `PENDENTE` / `APROVADO` / `REJEITADO` |
| `Comentario` / `Reacao` | — | Engajamento nos posts |
| `SaasMembro` | — | Dados operacionais (cidade, sede) exibidos no perfil com opt-in |

## Privacidade

Função central: `podeVerConteudoSocial` em `apps/web/src/lib/perfil-social.ts`.

- **Perfil público** (`perfilPrivado: false`): posts públicos visíveis no feed e perfil.
- **Perfil privado** (default): só o próprio usuário e seguidores com status `APROVADO` veem publicações, fotos e atividade.
- O feed (`getPostsParaFeed`) filtra autores privados fora da rede via `getAutoresSemAcesso`.

## Rotas portal

| Rota | Descrição |
|---|---|
| `/portal/comunidade` | Feed + composer + aside |
| `/portal/comunidade/perfil/[userId]` | Perfil unificado (abas Sobre, Publicações, Fotos, Atividade) |
| `/portal/comunidade/perfil/[userId]/seguidores` | Lista de seguidores |
| `/portal/comunidade/perfil/[userId]/seguindo` | Lista de quem segue |
| `/portal/comunidade/busca` | Busca de membros |
| `/portal/comunidade/seguindo` | Solicitações pendentes recebidas |
| `/portal/perfil` | Redireciona para o perfil social do usuário logado |

## API

| Endpoint | Uso |
|---|---|
| `GET /api/comunidade/membros?q=` | Busca membros aprovados em tenants visíveis |
| `POST /api/upload/sign` | Assinatura Cloudinary (`purpose`: comunidade, perfil-banner, perfil-avatar) |

## Server Actions (`comunidade/actions.ts`)

- `publicarPost`, `editarPost`, `excluirPost`
- `solicitarSeguir`, `deixarDeSeguir`, `aprovarSeguimento`, `rejeitarSeguimento`
- `atualizarPerfilSocial` (bio, banner, avatar, privacidade, toggles)
- `comentarPost`, `reagirPost`, `listarComentariosPost`, `denunciarPost`

Toda mutação administrativa grava `AuditLog`; engajamento usa rate limit em
`engagement-rate-limit.ts`.

## Visibilidade cross-tenant

Comunidade é **público-na-hierarquia** (`packages/types/src/visibility.js`):
`getVisibleTenantIds(tenant, 'comunidade')` define o escopo de posts e busca.

## Upload de mídia

- Posts: `torcida/{tenantId}/comunidade`
- Perfil: `torcida/{tenantId}/perfis/{userId}/banner|avatar`
- Validação server-side com `isCloudinaryUrl` em `social-embed.ts`
