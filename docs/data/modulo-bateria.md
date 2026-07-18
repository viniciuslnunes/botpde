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
Admin: `/admin/eventos?tipo=ENSAIO`.

## Modelo

Reusa `Evento` + `EventoRsvp` com `tipo = ENSAIO`. Presença = `checkedInAt`.

## RBAC

- **Ver**: membro do depto `bateria` **ou** `events:create|manage` (painel)
- **Criar / check-in**: `events:create|manage`
- Operação admin: `/admin/eventos?tipo=ENSAIO`
