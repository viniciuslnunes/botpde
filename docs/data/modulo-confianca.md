# Módulo — Confiança na torcida (recortes 1–4)

Motor de confiança **local ao tenant**. Ledger append-only + saldo materializado.
Confiança **não concede permissão**: `assertPermission` continua o único critério
de autorização. O score é um segundo eixo, sempre AND restritivo.

Distinto do `scoreConfianca` do brechó (P2P) e do `ForumScoreSaldo` (ranking
da praça). Não misturar.

## Decisões fechadas (2026-08-30)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Local e/ou global | **Só local no MVP.** Grupo/canal/sala são por tenant. Eixo global (antifraude cross-tenant) fica para quando DM/busca de aliados pedirem. |
| 2 | Visibilidade | **Score numérico privado; nível visível no perfil** (badge). Sem ranking público / leaderboard. Progresso (“faltam N”) só no próprio perfil. |
| 3 | Incentivo vs abuso | **Conter abuso primeiro.** Sinais caros (presença, dinheiro, laudo). Post/reação peso zero. Queda rápida, subida lenta. |

## O que está ligado

| Recorte | Entrega |
|---|---|
| 1 | Ledger + saldo + 3 sinais (check-in, mensalidade, aprovação/reprovação). |
| 2 | `groups:create` **e** `temCapacidade(nivel, 'grupo:criar')`. Tenant só; Comunidade Nacional não entra. |
| 3 | Canais (`canal:criar`) e salas (`sala:hospedar`) no mesmo AND. Encerrar sala existente e grupos já criados **não** são revogados. |
| 4 | Badge de nível no perfil (Novato / Conhecido / De casa / Referência). Progresso privado no próprio “Sobre”. |

Comunidade Nacional (tenant sintético) **não** usa o eixo local: criar grupo
nacional exige `nacional: true` na action (a página de grupos CN passa isso).
Inbox de mensagens na CN também fica livre. O caminho da torcida **não** cai
mais em silêncio para a CN se a permissão ou a confiança recusar.

## Modelo

| Tabela | Papel |
|---|---|
| `ConfiancaEvento` | Append-only: `(userId, tenantId, sinal, peso, origemTipo, origemId)`. Unique `(sinal, origemTipo, origemId)` = idempotente. |
| `ConfiancaSaldo` | `(userId, tenantId)`: `score` 0–100, `nivel` 0–3. O que as queries leem. O **nível efetivo** no gate é recalculado ao vivo (piso de cargo no request — promover a owner vale na hora). |

R5: o sinal fica no tenant onde aconteceu. Unidade isolada não vaza para
saldo de outro tenant (não há eixo global neste recorte).

Gravação: origem conferida (pessoa + tenant + estado), lock por
`(userId, tenantId)`, unique idempotente. Retry de PIX/check-in reenfileira
o sinal (não só na primeira vez).

## Sinais

| Sinal | Origem | Peso | Quem dispara |
|---|---|---|---|
| `CHECKIN` | `EventoRsvp` | +15 (teto 45 / 30 dias; antigo conta metade) | `registrarCheckIn` / `registrarCheckInPorQr` (só 1ª vez). Só membro APROVADO no tenant. |
| `MENSALIDADE` | `CobrancaAssociacao` tipo `MENSALIDADE` | +20 (teto 20 / 30 dias; antigo conta metade) | `baixarCobrancaComoPaga` (não vaga de caravana). Só membro APROVADO. |
| `APROVACAO` | `SaasMembro` | +20 | `aprovarMembro` |
| `REPROVACAO` | `SaasMembro` | −40 | `reprovarMembro` |

Post, reação e comentário **não entram**.

## Níveis

| Nível | Score | Label | Capacidades |
|---|---|---|---|
| 0 | 0 | Novato | — |
| 1 | 20 | Conhecido | — |
| 2 | 50 | De casa | `grupo:criar`, `canal:criar`, `sala:hospedar` |
| 3 | 80 | Referência | as mesmas |

Cargo `owner` / `admin` / `vice` dá **piso de nível 2** (liderança opera no
dia 1). O piso exige `Role.isSystem` — perfil customizado com o mesmo nome
não conta. O piso não infla o score.

## Gate (AND)

```
podeCriarGrupo  = groups:create     E  temCapacidade(nivel, 'grupo:criar')
podeCriarCanal  = channels:manage
                  (ou community:manage)  E  temCapacidade(nivel, 'canal:criar')
podeCriarSala   = meetings:host      E  temCapacidade(nivel, 'sala:hospedar')
```

Runtime: `assertCapacidadeConfianca` / `temCapacidadeConfianca` em
`apps/web/src/lib/confianca.ts`. Recusa vira `ExpectedError` com copy humano
(não o número do score). A UI esconde o botão de criar; quem tem a permissão
RBAC mas não o nível vê o motivo.

Grupos, canais e salas **já existentes** continuam. Rebaixamento não é
retroativo.

## Fora deste módulo

- Override manual de liderança (piso 2 já cobre owner/admin/vice).
- Eixo global / antifraude cross-tenant.
- Ranking público, leaderboard, missões visíveis para terceiros.
- PIX/escrow do brechó, patrimônio oficial, Discord.

Regras puras: `packages/types/src/confianca.js`. Runtime: `apps/web/src/lib/confianca.ts`.
Proposta e riscos: `docs/data/proposta-confianca-gamificacao.md`.
