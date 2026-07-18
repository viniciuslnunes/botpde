# Módulo — Caravanas (compor Eventos)

> Plugin do departamento Caravanas. **Não** duplica Eventos: usa `Evento.tipo = CARAVANA`.
> Agenda canônica: [modulo-eventos.md](./modulo-eventos.md).

## Escopo

| Inclui | Fora |
|--------|------|
| Modo Caravana no hub `/portal/eventos?tipo=CARAVANA` | Ônibus / assentos |
| Criar com `events:create\|manage` | Bilheteria multi-categoria |
| Lista de embarque (RSVP + check-in + QR) | App offline |
| `valorVaga` + cobrança AVULSA | |
| Painel em `/portal/departamentos/caravanas` | |

Rotas `/portal/caravanas*` redirecionam para o hub / detalhe unificado.
Admin: `/admin/eventos?tipo=CARAVANA`.

## Modelo

Reusa `Evento` + `EventoRsvp`:

- `Evento.tipo = CARAVANA`
- Embarque = `checkedInAt` (independente do RSVP)
- Lotação via `capacidade` efetiva (evento ou sede)

## RBAC

- **Ver**: membro do depto `caravanas` **ou** `events:create|manage` (painel)
- **Criar / check-in**: `events:create|manage`
- Operação admin: `/admin/eventos?tipo=CARAVANA`
