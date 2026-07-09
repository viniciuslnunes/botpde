# Módulo Salas (Meet) — videoconferência em tempo real

> Referência factual do módulo para consulta rápida (agentes e humanos). Fonte da verdade dos
> dados é `packages/db/prisma/schema.prisma`; do RBAC, `packages/types/src/permissions.js`.

## O que é

Salas de vídeo dentro de Comunidade, via WebRTC (LiveKit): chat, presença, enquetes ao vivo e
grid de chamada com moderação de mídia. Sem integração com o bot Discord — a única ponte é
`SalaReuniao.eventoId → Evento` (permite criar sala a partir de um evento).

## Entidades (`packages/db/prisma/schema.prisma`, linhas ~923–1037)

6 models, todos mapeados para tabelas `saas_*`:

| Model | Tabela | Papel |
|---|---|---|
| `SalaReuniao` | `saas_salas_reuniao` | raiz; `livekitRoomName` único (`"${tenantId}:${slug}"`), `linkConvite` único, `encerradaEm` = soft delete |
| `ParticipanteReuniao` | `saas_participantes_reuniao` | presença; `@@unique([salaId, userId])`, upsert por entrada/saída |
| `MensagemReuniao` | `saas_mensagens_reuniao` | chat; `destacada` (fixada pelo host), `excluidaEm` = soft delete |
| `EnqueteReuniao` | `saas_enquetes_reuniao` | pergunta + `encerradaEm` |
| `OpcaoEnqueteReuniao` | `saas_opcoes_enquete_reuniao` | opções ordenadas |
| `VotoEnqueteReuniao` | `saas_votos_enquete_reuniao` | `@@unique([enqueteId, userId])` — 1 voto por pessoa, upsert permite trocar |

Enums: `TipoSalaReuniao` (`EVENTO`/`ABERTA`/`DM_GRUPO`), `PapelParticipanteReuniao`
(`HOST`/`MODERADOR`/`PARTICIPANTE`).

**Dívida conhecida:** `DM_GRUPO` e `MODERADOR` existem no schema mas **nunca são gravados** pelo
código atual (`criarSala` só grava `EVENTO`/`ABERTA`; `participantes/route.ts` só grava
`HOST`/`PARTICIPANTE`). Não é bug — é capacidade não usada ainda. Não remover sem checar se há
plano de uso.

## RBAC

Uma única permissão dedicada: **`MEETINGS_HOST: 'meetings:host'`** (grupo Comunidade em
`packages/types/src/permissions.js`), rótulo "Criar salas de vídeo".

- **Exige `MEETINGS_HOST`**: criar sala (`criarSala`/`criarSalaDeEvento`), encerrar sala,
  moderar (editar/destacar/excluir mensagem, criar/encerrar enquete, aprovar pedido de
  mídia via `grantParticipantMedia`).
- **Exige só membro ativo** (`assertMembroAtivo`): entrar na sala, mandar mensagem, votar em
  enquete.
- Helpers de autorização (`apps/web/src/lib/salas-api.ts`): `assertSalaMembro(salaId)` e
  `assertSalaAnfitriao(salaId)` (idem + exige ser o host).

## Visibilidade e privacidade

Salas **não** está em `packages/types/src/visibility.js` — não tem sensibilidade
PÚBLICO/RESTRITO cross-tenant. O escopo é só `tenantId` + membro ativo (igual às demais
features intra-tenant).

A privacidade real do módulo é **privacidade de enquetes**: quem votou em quê só é exposto ao
host. Implementação em `apps/web/src/app/api/salas/[id]/enquetes/route.ts` — o `GET` inclui
`votantes[]` só quando `isHost`; para os demais, só o próprio voto. Refletido na UI em
`sala-enquete.tsx` (lista de votantes renderiza só `if (isHost)`).

## LiveKit é opcional

`env.ts` define as três vars do LiveKit como `.optional()`. `isLiveKitConfigured()` /
`requireLiveKitConfig()` (`apps/web/src/lib/livekit.ts`) fazem o gate. **Sem LiveKit configurado,
a sala ainda funciona** como chat + enquetes + presença — só o grid de áudio/vídeo fica
indisponível (`sala-ativa-client.tsx`).

Presença e chat/enquetes usam **polling** (3s/5s), não websocket próprio. Só áudio/vídeo e o
protocolo de "levantar a mão" (pedir para falar/compartilhar tela) usam o data channel do
LiveKit (`apps/web/src/lib/sala-moderacao.ts`).

## Rotas

- Páginas: `apps/web/src/app/portal/comunidade/salas/page.tsx` (lista) e `[id]/page.tsx` (sala
  ativa; gera o token LiveKit inline via `createRoomToken`).
- API (route handlers) em `apps/web/src/app/api/salas/[id]/`: `mensagens/`, `enquetes/`,
  `participantes/`, `midia/`. Note que as operações **dentro** de uma sala usam route handlers,
  não Server Actions (diferente do resto do produto) — motivo: polling e updates frequentes do
  client.
- Server Actions em `apps/web/src/app/portal/comunidade/salas/actions.ts` cobrem só o ciclo de
  vida da sala em si (`criarSala`, `encerrarSala`, `enviarMensagemSala`).

## Auditoria

`AuditLog` grava: `SALA_REUNIAO_CRIADA`, `SALA_REUNIAO_ENCERRADA`, `SALA_ENQUETE_CRIADA`,
`SALA_ENQUETE_VOTO`, `SALA_ENQUETE_ENCERRADA`.

## Diagrama

Ver `docs/data/schema.dbml` (seção "SALAS MEET").
