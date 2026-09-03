# Programa Fundações de Operação (cockpit admin)

Planejamento e critérios de aceite das fundações F1–F7 e dos quatro módulos
da Onda 1 do programa cockpit admin.

## Fundações

| ID | Primitiva | Persistência | Status |
|----|-----------|--------------|--------|
| F1 | Dono operacional (`Evento.departamentoId` / `areaId`) | colunas | ✅ |
| F2 | Escala (`EventoEscala`) | tabela | ✅ |
| F3 | Resultado / rateio (`FinanceiroLancamento.eventoId`) | coluna | ✅ |
| F4 | Carga de operação (`PatrimonioEmprestimo.eventoId`) | coluna | ✅ |
| F5 | Procedimento / checklist | `meta` JSON | ✅ |
| F6 | Elegibilidade a benefício | regras puras | ✅ |
| F7 | Dia de Jogo (hub + partida) | `Evento.partidaId` | ✅ |

### F5 — Procedimento

- **Primitiva:** `packages/types/src/procedimento.js`
- **Consumidores:** barracão (`meta.barracao`), área de atuação (`meta.checklist`),
  caravana (`Evento.meta.procedimento` via `evento-procedimento.js`)
- **UI caravana:** aba Frota — `ProcedimentoCaravanaPainel`
- **Pendência ops:** checklist incompleto a ≤72h do embarque (inbox Caravanas)
- **Aceite:** toggle grava estado; progresso `done/total`; sem tabela ERP

## Módulos Onda 1

### Caravana multi-veículo ✅

- `CaravanaVeiculo` + `EventoRsvp.veiculoId`
- Capacidade por veículo; exclusão desaloca; manifesto `/admin/eventos/[id]/manifesto`
- Pendências frota no hub Caravanas

### Comunicado segmentado ✅

- `Announcement.audiencia` (JSON) — escopos em `comunicado-audiencia.js`
- Fan-out: `notificarComunicadoSegmentado` quando escopo ≠ `TODOS`
- UI: seletor de audiência no composer admin (`FeedComposer` modo comunicado)

### Previsão de consumo do bar ✅

- Puras: `bar-previsao.js` — média dos últimos N jogos com `partidaId`
- Correlação de venda: mesmo **dayKey** do evento (sem `BarVenda.eventoId`)
- UI: seção em `/admin/bar/desempenho`

### Ciclo financeiro automático ✅

- `Tenant.financeiroCiclo` (JSON) — `financeiro-ciclo.js`
- Cron: `GET /api/cron/financeiro-ciclo` (Bearer `CRON_SECRET`)
- Geração idempotente por competência `YYYY-MM` na descrição da cobrança
- Régua D+0, D+7, D+14 (configurável)
- UI: formulário em `/admin/financeiro/planos`

### Conformidade LGE na Diretoria ✅

- Puras: `lge-conformidade.js` — pendências de cadastro sócio
- Inbox + KPI «Cadastro LGE incompleto» em `/admin/diretoria`
- Link para `/admin/socios` — nunca expõe ficha completa na prancheta

## Schema pendente de deploy

Campos JSON novos (push HML → prod via workflow):

- `Evento.meta`
- `Announcement.audiencia`
- `Tenant.financeiroCiclo`

Mais colunas das fundações F1–F4 e frota já documentadas em `ARCHITECTURE.md`.

## Verificação

```bash
pnpm --filter @torcida/db db:generate
pnpm --filter @torcida/web test -- operacao-fundacoes
pnpm --filter @torcida/web lint
```

Testes de frota existentes: `caravana-veiculo.test.ts`. Suíte Loja (9 tabs) é
dívida de outra sessão — fora do escopo deste programa.
