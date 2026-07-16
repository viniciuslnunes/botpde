# Módulo — Bateria (compor Eventos)

> Plugin do departamento Bateria. Ensaios = `Evento.tipo = ENSAIO`.

## Escopo MVP

| Inclui | Fora |
|--------|------|
| `/portal/bateria` | Partituras / instrumentos (ver Patrimônio) |
| Criar ensaio (`events:create\|manage`) | Escala de instrumentos |
| Presença via check-in | App de ensaio offline |
| Painel em `/portal/departamentos/bateria` | |

## Modelo

Reusa `Evento` + `EventoRsvp` com `tipo = ENSAIO`. Presença = `checkedInAt`.

## RBAC

- **Ver**: membro do depto `bateria` **ou** `events:create|manage`
- **Criar / presença**: `events:create|manage`
- Operação admin: `/admin/eventos?tipo=ENSAIO`

## Superfícies

- Portal: `/portal/bateria`, `/portal/bateria/[id]`
- Home: `/portal/departamentos/bateria`
