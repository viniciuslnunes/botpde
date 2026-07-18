# Módulo — Agenda (Eventos)

> Hub único de agenda da torcida. Caravanas e Bateria são **modos tipados**
> (`Evento.tipo`), não apps separados. Painéis de departamento continuam com KPIs
> e deep-link para o hub filtrado.

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
- `Partida` — **global por `Afiliacao`** (sem `tenantId`): adversário, mando,
  competição, data/hora, placar opcional, status.
- `EventoRsvp` — `CONFIRMADO` \| `RECUSADO` \| `LISTA_ESPERA`; `criadoEm` (fila);
  `checkedInAt` = presença real.

**Capacidade efetiva** = `Evento.capacidade` senão `Sede.capacidade`. Lotação cheia
→ `LISTA_ESPERA`. Saída de `CONFIRMADO` → `promoverProximoDaEspera` (ordem
`criadoEm`).

**Recorrência:** `recorrenciasSemanas` cria N+1 com o mesmo `serieId`. Edit/delete:
escopo **esta** ou **futuras**.

**Partida:** select no form (ou “cadastrar nova”). Requer `Tenant.afiliacaoId`.
Queries de `Partida` **não** filtram por tenant.

## Plugins / lembretes / RBAC / performance

Ver histórico do hub: modos CARAVANA/ENSAIO, cron `eventos-lembretes`,
`events:create|manage`, cache de escopo/sedes, calendário por janela + cores por tipo.

## Ações de valor

- ICS, copiar link, publicar no mural (`?eventoId=` + foco composer)
- RSVP inline, QR câmera, **fila offline** (localStorage → sync ao voltar online)
- Mapa embutido (OSM) + Ver no mapa / Como chegar
- Card da partida vinculada no detalhe
- Badge **Série** + escopo esta/futuras

## Horizonte

- Sync de calendário externo (Sofascore / API) para popular `Partida`
- Placar ao vivo / status AO_VIVO automático
- PWA completa de check-in (hoje: fila local no browser)
- Ônibus/assentos e bilheteria
