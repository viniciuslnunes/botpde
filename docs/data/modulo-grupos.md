# Módulo Grupos (Comunidade)

Comunidades temáticas criadas por membros — públicas ou privadas — com mural,
chat e injeção no feed pessoal dos membros ativos.

## Modelo

Reusa `Conversa` (`tipo: GRUPO`) + `MembroConversa` + `Post.conversaId`.

| Campo | Papel |
|---|---|
| `Conversa.comunidade` | `true` = grupo da Comunidade (lista/mural); `false` = só mensageria |
| `Conversa.publica` | Público (entrada imediata) vs privado (pedido + aprovação) |
| `MembroConversa.status` | `ATIVO` \| `PENDENTE` \| `REJEITADO` |
| `MembroConversa.saiuEm` | Soft leave |
| `MembroConversa.silenciada` | Exclui posts do grupo do feed do membro |

Membro ativo = `status: ATIVO` + `saiuEm: null`.

## Rotas

| Path | Comportamento |
|---|---|
| `/portal/comunidade/grupos` | Lista públicos + privados (metadados); criar; entrar / pedir |
| `/portal/comunidade/grupos/[id]` | Landing (não-membro) ou mural / chat / membros / pedidos / config (membro) |
| `/portal/comunidade?filtro=grupos` | Feed só dos murais dos grupos do viewer |

## Abas do detalhe (membro)

| Aba | Quem vê | Conteúdo |
|---|---|---|
| Mural | membros | Composer + posts do grupo |
| Chat | membros | Link para `/portal/mensagens?c=` |
| Membros | membros | Lista de ativos (admin em destaque) |
| Pedidos | admins | Aprovar / recusar entrada |
| Sobre | todos | Privacidade + descrição |
| Configurações | admins | Nome, descrição, privacidade, foto (`Conversa.avatarUrl`) |

## Actions

- `criarGrupo(nome, descricao?, publica)` — `comunidade: true`, criador `ADMIN`+`ATIVO`
- `atualizarGrupo` — admin; nome / descrição / `publica` / `avatarUrl` (Cloudinary)
- `entrarGrupoPublico` — só públicos; backfill timeline
- `pedirEntradaGrupo` / `decidirPedidoGrupo` — privados; notifs `GRUPO_*`
- `sairGrupo` / `alternarSilencioGrupo`
- `publicarPostGrupo` — fan-out `FeedTimeline` para membros ativos não silenciados

## Feed

- Descobrir: posts sem conversa **+** murais dos grupos do viewer (não silenciados)
- Seguindo: entradas de timeline incluem posts de grupo via fan-out/backfill
- Busca: posts de grupo só se o buscador for membro ativo

Badge no card: `em {nome do grupo}` → detalhe do grupo.

## Notificações

| Tipo | Quando |
|---|---|
| `GRUPO_PEDIDO` | Pedido de entrada (admins) |
| `GRUPO_APROVADO` | Pedido aceito |
| `GRUPO_REJEITADO` | Pedido recusado |

## Separação de produto

| Superfície | Papel |
|---|---|
| **Grupo** | Comunidade de membros (este módulo) |
| **Canal** | Institucional / admin (`tipo: CANAL`) |
| **Grupo de mensagens** | Chat por convite (`comunidade: false`) |

## Fora de escopo (próximos)

Pins, vínculo a evento/departamento, link de convite, “aprovar entradas” em público, CRUD admin global.
