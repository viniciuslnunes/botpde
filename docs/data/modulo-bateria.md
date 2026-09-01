# Módulo — Bateria (compor Eventos)

> Plugin do departamento Bateria. Ensaios = `Evento.tipo = ENSAIO`.
> Agenda canônica: [modulo-eventos.md](./modulo-eventos.md).

## Escopo

| Inclui | Fora |
|--------|------|
| Modo Ensaio no hub `/portal/eventos?tipo=ENSAIO` | Partituras / instrumentos (→ Patrimônio) |
| Criar com `events:create\|manage` | Escala de instrumentos |
| Lista de presença (RSVP + check-in + QR) | App offline |
| Painel em `/portal/departamentos/bateria` | |

Rotas `/portal/bateria*` redirecionam para o hub / detalhe unificado.
Admin ops: `/admin/bateria` (thin wrapper; detalhe via alias → Agenda). Entrada:
`AdminTabs` no topo (`?tab=`): **Instrumentos** (default, cards com foto),
Ensaios (KPIs + semana da bateria), Precisa de você, **Histórico** (baixas e
exclusões de instrumentos). Acervo = inventário do Patrimônio, categoria
`INSTRUMENTO`.
Filtro legado `/admin/eventos?tipo=ENSAIO` segue válido.
Programa: [`programa-cockpit-admin-departamentos.md`](./programa-cockpit-admin-departamentos.md).
Cluster: [`modulo-eventos.md`](./modulo-eventos.md) § Dia operacional.

## Modelo

Reusa `Evento` + `EventoRsvp` com `tipo = ENSAIO`. Presença = `checkedInAt`.

## RBAC

- **Ver**: membro do depto `bateria` **ou** `events:create|manage` (painel)
- **Ver instrumentos**: `patrimony:view` (a grade com foto na primeira aba do cockpit)
- **Gerir instrumentos**: `patrimony:manage` (CRUD nos cards; membro só vê)
- **Criar / check-in**: `events:create|manage`
- Operação admin: `/admin/bateria` (`DEPARTAMENTO_MODULO_ADMIN_ROTA`)
