# Módulo — Caravanas (compor Eventos)

> Plugin do departamento Caravanas. **Não** duplica Eventos: usa `Evento.tipo = CARAVANA`.
> Agenda canônica: [modulo-eventos.md](./modulo-eventos.md).

## Escopo

| Inclui | Fora |
|--------|------|
| Modo Caravana no hub `/portal/eventos?tipo=CARAVANA` | Ônibus / assentos |
| Criar com `events:create\|manage` | Bilheteria multi-categoria |
| Lista de embarque (RSVP + check-in + QR) | App offline / PWA |
| `valorVaga` + cobrança AVULSA | Hard-block **sempre** ligado |
| Lotação por pagamento (PAGA ocupa) | |
| Check-in: warn+allow **ou** hard-block opcional (`checkInExigePagamento`) | |
| Cruzamento pagamento × embarque no dia | |
| Painel em `/portal/departamentos/caravanas` | |

Rotas `/portal/caravanas*` redirecionam para o hub / detalhe unificado.
Admin ops: `/admin/caravanas` (thin wrapper sobre `Evento`; detalhe em
`/admin/eventos/[id]` via alias). Entrada: **semana operacional**
(`DepartamentoSemanaOps`) com cluster do dia do jogo + CTA vincular partida +
atalho “Evento na sede”. Filtro legado `/admin/eventos?tipo=CARAVANA` segue válido.
Programa: [`programa-cockpit-admin-departamentos.md`](./programa-cockpit-admin-departamentos.md).
Cluster: [`modulo-eventos.md`](./modulo-eventos.md) § Dia operacional.

## Modelo

Reusa `Evento` + `EventoRsvp` + `CobrancaAssociacao`:

- `Evento.tipo = CARAVANA`
- Embarque = `checkedInAt` (independente do RSVP)
- Vaga paga = `Evento.valorVaga` + cobrança `AVULSA` com `eventoId`
  (unique `(eventoId, userId)`). Join natural com RSVP por `userId`.
- `Evento.checkInExigePagamento` (default `false`): na porta, bloqueia
  check-in/QR se a vaga não estiver `PAGA`; gestor libera com override
  (“Embarcar mesmo assim”) + AuditLog `override: true`.

## Lotação e cobrança (2026-08-03+)

Com `valorVaga` preenchido:

1. **Lotação** conta cobranças `PAGA` (`contarOcupacaoEvento`), não RSVP
   `CONFIRMADO`. Confirmar sem pagar = intenção; não enche o ônibus.
2. Ao confirmar (portal RSVP, waitlist ou promover na admin), cria-se a
   cobrança AVULSA automaticamente (`garantirCobrancaVagaCaravana`).
3. Baixar pagamento com lotação já cheia de PAGAs é rejeitado.
4. Baixa da vaga gera lançamento com categoria `CARAVANA`.

Sem `valorVaga`, lotação continua por `CONFIRMADO` (capacidade efetiva =
evento ou sede).

## Embarque × pagamento

- Contrato puro `resolverStatusVaga` / `resumirEmbarqueComPagamento` /
  `deveBloquearCheckInSemPagamento` (`packages/types/src/caravana-embarque.js`).
- Lista (portal/admin): badge, KPIs, filtro, CSV com coluna `pagamento`.
- Check-in manual: default **avisa e permite**; com flag, **bloqueia** até
  override. QR: mesma regra, sem override na câmera — use check-in manual.

## RBAC

- **Ver**: membro do depto `caravanas` **ou** `events:create|manage` (painel)
- **Criar / check-in**: `events:create|manage`
- Operação admin: `/admin/caravanas` (`DEPARTAMENTO_MODULO_ADMIN_ROTA`)
