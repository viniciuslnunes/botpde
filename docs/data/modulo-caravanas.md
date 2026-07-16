# Módulo — Caravanas (compor Eventos)

> Plugin do departamento Caravanas. **Não** duplica Eventos: usa `Evento.tipo = CARAVANA`.

## Escopo MVP

| Inclui | Fora |
|--------|------|
| `/portal/caravanas` | Ônibus / assentos / pagamento |
| Criar caravana (`events:create\|manage`) | Custo automático no Financeiro |
| Lista de embarque (RSVP + check-in) | QR / app offline |
| Painel em `/portal/departamentos/caravanas` | Integração Sofascore |

## Modelo

Reusa `Evento` + `EventoRsvp`:

- `Evento.tipo = CARAVANA`
- Embarque = `checkedInAt` (independente do RSVP)

## RBAC

- **Ver**: membro do depto `caravanas` **ou** `events:create|manage`
- **Criar / check-in**: `events:create|manage`
- Operação admin: `/admin/eventos?tipo=CARAVANA`

## Superfícies

- Portal: `/portal/caravanas`, `/portal/caravanas/[id]`
- Home: `/portal/departamentos/caravanas`
- Lib: `apps/web/src/lib/eventos-tipo.ts`, `eventos-plugin-access.ts`
