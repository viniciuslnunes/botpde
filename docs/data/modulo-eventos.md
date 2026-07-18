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

Menu admin: label **Agenda**. Caps de depto apontam para `?tipo=`.

## Modelo

- `Evento` — `tipo` GERAL \| CARAVANA \| ENSAIO; `sedeId` (escopo territorial);
  `capacidade` (override); `valorVaga` (caravana); `lat`/`lng` (horizonte).
- `EventoRsvp` — `CONFIRMADO` \| `RECUSADO` \| `LISTA_ESPERA`; `checkedInAt` =
  presença real (independente do RSVP).

**Capacidade efetiva** = `Evento.capacidade` se setado, senão `Sede.capacidade`.
Sem nenhum dos dois → lotação livre. Ao tentar `CONFIRMADO` com lotação cheia →
grava `LISTA_ESPERA`. Gestor promove via `promoverDaListaEspera`.

Visibilidade: `getEscopoEventosVisiveis` (global vs sede + ancestrais).

## Plugins (modos)

Ver [modulo-caravanas.md](./modulo-caravanas.md) e [modulo-bateria.md](./modulo-bateria.md)
para copy/KPIs de departamento. Comportamento tipado no detalhe:

- **CARAVANA** — valor da vaga + cobrança AVULSA; lista “Embarque”
- **ENSAIO** — lista “Presença”
- **GERAL** — RSVP + confirmados; embarque se gestor

## Lembretes

`GET /api/cron/eventos-lembretes` (Bearer `CRON_SECRET`):

- T−24h / T−2h → confirmados (`EVENTO_LEMBRETE`)
- ~08h no dia → gestores (`EVENTO_DIA_GESTOR`)
- Novo CONFIRMADO → criador (`EVENTO_RSVP`)

## RBAC

- `events:create` — criar (portal/admin drawer)
- `events:manage` — editar, excluir, check-in/QR, promover espera, CSV

## Performance

- `React.cache` em `getEscopoEventosVisiveis` e `listSedesAtivasParaEvento`
- Lista e calendário **não** carregam juntos — só a vista ativa
- Calendário filtra pela **janela** da semana/mês (não 200 eventos soltos)
- Próximos limitados (`take: 40`); RSVPs do membro só dos eventos futuros
- Toolbar sticky + busca com debounce (`AgendaBusca`)
- Prefetch nos cards/filtros; skeleton alinhado ao layout

## Ações de valor no detalhe

- **Adicionar ao calendário** (`.ics`)
- **Copiar link**
- **Publicar no mural** (deep-link Comunidade)
- Spotlight **Próximo** no hub



- **Partida:** entidade/`Partida` ou vínculo a calendário do clube — domínio ainda
  inexistente; UI não promete “partidas”.
- **Recorrência / data fim:** série de ensaios (RRULE simples ou “repetir N semanas”).
- **Mapa / lat-lng** no formulário (já no Zod/schema).
- **Câmera QR** nativa; modo offline de check-in.
- **Ônibus/assentos** e bilheteria completa — fora do escopo atual.

