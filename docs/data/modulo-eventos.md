# Módulo — Agenda (Eventos)

> Hub único de agenda da torcida. Caravanas e Bateria são **modos tipados**
> (`Evento.tipo`), não apps separados. Painéis de departamento continuam com KPIs
> e deep-link para o hub filtrado.
>
> **Decisão de produto (2026-07-17):** hub unificado (**1A**) + visão completa em
> fases (**2C**). Commit de referência: `36071fa`. Doc de plugins:
> [modulo-caravanas.md](./modulo-caravanas.md), [modulo-bateria.md](./modulo-bateria.md).

## Superfícies

| Superfície | Rota | Papel |
|------------|------|-------|
| Admin hub | `/admin/eventos` | Lista / semana / mês, filtros, criar em drawer |
| Admin detalhe | `/admin/eventos/[id]` | Cockpit: editar, KPIs, embarque/presença, QR, CSV |
| Portal hub | `/portal/eventos` | Agenda do membro (+ create se `events:create\|manage`) |
| Portal detalhe | `/portal/eventos/[id]` | RSVP, pagamento de vaga, embarque tipado |
| Legado | `/portal/caravanas*`, `/portal/bateria*` | **Redirect** para o hub / detalhe |

Filtros: `?tipo=CARAVANA\|ENSAIO\|GERAL`, `?vista=lista\|semana\|mes`, `?q=`, `?data=YYYY-MM-DD`.

## Modelo

- `Evento` — `tipo` GERAL \| CARAVANA \| ENSAIO; `sedeId`; `capacidade`; `valorVaga`;
  `lat`/`lng`; `serieId`; `partidaId` (jogo do clube); `fotoUrl`.
- `Partida` — **global por `Afiliacao`** (sem `tenantId`): adversário, mando
  (`CASA`\|`FORA`), competição, data/hora, placar opcional, `status`
  (`AGENDADA`\|`AO_VIVO`\|`ENCERRADA`\|`CANCELADA`), `fonteExternalId?`.
- `EventoRsvp` — `CONFIRMADO` \| `RECUSADO` \| `LISTA_ESPERA`; `criadoEm` (fila FIFO);
  `checkedInAt` / `checkedInPorId` = presença real (**RSVP ≠ check-in**).

**Capacidade efetiva** = `Evento.capacidade` senão `Sede.capacidade`. Lotação cheia
→ `LISTA_ESPERA`. Saída de `CONFIRMADO` → `promoverProximoDaEspera` (ordem
`criadoEm`). Lib: `apps/web/src/lib/eventos-waitlist.ts`.

**Recorrência:** `recorrenciasSemanas` cria N+1 com o mesmo `serieId`. Edit/delete:
escopo **esta** ou **futuras**. Lib: `eventos-serie.ts`.

**Partida:** select no form (ou “cadastrar nova” via `CriarPartidaRapidaSchema`).
Requer `Tenant.afiliacaoId`. Queries de `Partida` **não** filtram por tenant.
Libs: `partidas.ts`, `admin/partidas/actions.ts`.

## RBAC / cron / Zod

- Criar: `EVENTS_CREATE`; editar/gerir/check-in/CSV: `EVENTS_MANAGE`.
- Lembretes: `GET /api/cron/eventos-lembretes` (segredo de cron do projeto).
- Schemas: `packages/types/src/schemas/evento.js` (recorrência, lat/lng, partida,
  `MANDO_JOGO_LABEL`).

## Ações de valor (entregues)

- Calendário lista / semana / mês (cores por tipo)
- ICS, copiar link, publicar no mural (`?eventoId=` + foco composer)
- RSVP inline, QR câmera, **fila offline** (`checkin-offline.ts` → localStorage → sync)
- Mapa embutido (OSM) + Ver no mapa / Como chegar (`evento-mapa-links.tsx`)
- Card da partida vinculada (`evento-partida-card.tsx`)
- Badge **Série** + escopo esta/futuras
- Cockpit: KPIs, embarque/presença, export CSV

## Inteligência de dados externos (jogos)

`Partida` **não** depende de Google Sports. Painel SERP da Busca Google **não** tem
API oficial gratuita — ver `docs/knowledge/futebol-dados-publicos.md` § calendário.
Sync futuro: API de futebol / Wikidata / entrada manual (decisão aberta #7).
Widgets Sofascore na Comunidade são **display** (iframe), não ingestão de `Partida`.

## Horizonte

- Sync de calendário externo (API-Football ou equivalente) para popular `Partida`
- Placar ao vivo / status `AO_VIVO` automático
- PWA completa de check-in (hoje: fila local no browser)
- Ônibus/assentos e bilheteria

## Agentes

`product-strategy` (escopo Agenda), `data-model` (`Partida` / série / waitlist),
`research-dominio` (fontes de jogos), `implementation`, `ux-review`, `qa-verification`,
`rbac` (perms eventos).
