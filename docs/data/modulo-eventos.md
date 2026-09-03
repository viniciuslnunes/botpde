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

## Dia operacional / cluster (2026-08-05)

No mesmo dia civil (fuso SP) podem coexistir **partida do clube**, caravana,
ensaio e evento GERAL na unidade. A Agenda e os hubs thin usam
`agruparDiaOperacional` (`packages/types/src/eventos-cluster.js`):

- Agrupa por `dayKey` + vínculos fortes (`partidaId`, `projetoId`, `serieId`)
- Sugere “Vincular à partida do dia” quando há jogo e o evento ainda não tem
  `partidaId` (mutação: `vincularEventoAPartida`, `events:manage` + AuditLog)
- Sem tabela de relação entre eventos; sem segundo calendário

Entrada UX: faixa **Esta semana** / **Operação do dia** na lista da Agenda e
em `/admin/caravanas`, `/admin/bateria`, `/admin/social`, `/admin/feminino`,
`/admin/carnaval` (`DepartamentoSemanaOps`).

## Modelo

- `Evento` — `tipo` GERAL \| CARAVANA \| ENSAIO; `sedeId`; `capacidade`; `valorVaga`;
  `checkInExigePagamento` (caravana paga); `lat`/`lng`; `serieId`; `partidaId`
  (jogo do clube); `fotoUrl`; `projetoId?`; **`departamentoId?`/`areaId?`**
  (dono operacional — ver abaixo).
- `Partida` — **global por `Afiliacao`** (sem `tenantId`): adversário, mando
  (`CASA`\|`FORA`), competição, data/hora, placar opcional, `status`
  (`AGENDADA`\|`AO_VIVO`\|`ENCERRADA`\|`CANCELADA`), `fonteExternalId?`.
- `EventoRsvp` — `CONFIRMADO` \| `RECUSADO` \| `LISTA_ESPERA`; `criadoEm` (fila FIFO);
  `checkedInAt` / `checkedInPorId` = presença real (**RSVP ≠ check-in**).
- `EventoCheckin` (2026-09-02) — ledger de embarque por trecho
  (`IDA`\|`VOLTA`), com `metodo` (`QR_EVENTO`\|`QR_CARTEIRINHA`\|`MANUAL`),
  `registradoPorId` (nulo = auto-embarque), `override`, `lat`/`lng`. Único por
  `(evento, pessoa, trecho)`. **`checkedInAt` continua sendo a presença
  materializada** (KPIs, CSV, Confiança) e só a IDA a escreve — ver
  [modulo-caravanas.md](./modulo-caravanas.md) § embarque por trecho.
  Estado da porta: `Evento.embarqueTrechoAtivo` + `embarqueAbertoEm` +
  `embarqueAbertoPorId`. Evento que não é caravana nunca abre embarque, então
  tudo cai em IDA e nada muda.

**Capacidade efetiva** = `Evento.capacidade` senão `Sede.capacidade`. Em caravana
com `valorVaga`, ocupação = cobranças `PAGA` (`contarOcupacaoEvento`); demais
eventos = RSVP `CONFIRMADO`. Lotação cheia → `LISTA_ESPERA`. Saída de
`CONFIRMADO` → `promoverProximoDaEspera` (ordem `criadoEm`). Lib:
`apps/web/src/lib/eventos-waitlist.ts`.

**Dono operacional (2026-09-02):** `Evento.departamentoId`/`areaId` dizem **quem
opera** o evento — escala, monta e responde. Não confundir com `projetoId`, que é
**prestação de contas**: ensaio de quinta e escala de bandeira do domingo têm dono
e não têm projeto. Antes disso o hub thin só enxergava evento por
`projeto.departamentoId`, então quem não abria projeto ficava órfão (o Social
chegava a contar “eventos sem projeto” como pendência).

Resolução na Server Action, nesta ordem: **escolha explícita** no formulário →
**hub thin** de onde a criação partiu (`departamentoSlug`, hidden) → **herança do
projeto**. Sem nada disso, é evento da torcida (nulo). O valor do formulário vem
achatado (`departamentoId` ou `departamentoId::areaId`) para não precisar de dois
selects encadeados — parse puro em `lib/evento-dono.ts` (módulo lido pelo form
client **e** pela action: nunca marcar `'use client'` nele). O departamento tem de
ser do tenant e a área tem de ser daquele departamento; ambos vão para o
`AuditLog`. Como área e projeto, **dono não concede permissão** — RBAC segue no
`Departamento`.

Leitura: `slugDepartamentoDoEvento` prefere o dono e cai no projeto (compat);
Social/Feminino/Carnaval filtram `OR: [{departamentoId}, {projeto:{departamentoId}}]`.
Backfill do legado: `pnpm --filter @torcida/db db:repair-evento-dono-operacional`
(herda do projeto; `--dry-run` simula, e nunca sobrescreve dono já definido).

**Escala da operação (2026-09-02):** `EventoEscala` responde **quem trabalha** —
coordenação, condução, embarque, bandeira, bateria, bar, portaria, acolhimento,
cobertura, apoio (`FuncaoEscala`). `EventoRsvp` continua respondendo *quem vai*:
são perguntas diferentes, e misturá-las escondia o buraco de cobertura.

- **Uma pessoa, um posto por operação** (unique `[eventoId, userId]`): dois postos
  dobrariam a cobertura e esconderiam exatamente o que a escala existe para mostrar.
  Trocar a função reabre a pergunta (volta a `CONVOCADO`).
- **Presença NÃO é campo da escala** — é lida do `EventoRsvp.checkedInAt` do mesmo
  par (evento, pessoa). Uma verdade só sobre comparecimento.
- **Não concede permissão** (como área e projeto). Convocar é `events:manage`;
  **responder é da própria pessoa**, não de uma permissão.
- Regras puras em `packages/types/src/evento-escala.js` (`resumirEscala`,
  `pendenciasEscala`, `funcoesParaTipo`); leitura em `lib/escala.ts`.
- Pendências: sem coordenação (alta — ninguém responde pela operação), escala
  vazia, silêncio a ≤48h do evento, recusa a cobrir. Entram na inbox de
  Caravanas e Bateria.
- Notificações: `ESCALA_CONVOCADO` (para a pessoa) e `ESCALA_RESPONDIDA`
  (recusa sobe para `events:manage`).
- Superfícies: aba **Escala** em `/admin/eventos/[id]`; bloco "Você está na
  escala" no hero de `/portal/eventos/[id]`.

**Resultado da operação (2026-09-02):** `FinanceiroLancamento.eventoId` +
`sedeId`. A baixa da cobrança de vaga já carimba o `eventoId`, então a
arrecadação entra sozinha; a despesa (fretamento, pedágio) é lançada no
Financeiro escolhendo a operação. `lib/financeiro-operacao.ts` agrega por tipo
(`resultadoDaOperacao`) e lista as operações no vermelho. O bloco só aparece
para quem tem `finance:view`/`finance:manage` — é dado de caixa, não da agenda.

**Carga da operação (2026-09-02):** `PatrimonioEmprestimo.eventoId` amarra a
custódia com foto ao dia: "o que vai para domingo" e "voltou tudo?".
`lib/carga-operacao.ts`; material não devolvido de operação já encerrada vira
pendência na Direção do Patrimônio.

**Dia de Jogo (2026-09-02):** `/admin/eventos/jogo/[partidaId]` — a leitura que
junta o domingo: operações vinculadas àquela `Partida`, cobertura da escala,
material em campo e setor/portão da arquibancada. **Não é dono de dado nenhum**
e não é um segundo calendário: lê `Evento.partidaId`, `EventoEscala` e
`PatrimonioEmprestimo`, e cada ação volta para o módulo de origem. Entrada pelo
card da partida no cockpit do evento. Lib: `lib/dia-de-jogo.ts` (quatro
consultas fixas, nunca uma por operação).

**Elegibilidade (2026-09-02):** convocar para a escala passa por
`avaliarBeneficio(tenantId, 'ESCALA', userId)` — desligado e bloqueado não
assumem posto; inadimplência e carteirinha vencida viram **ressalva** (chip na
lista + mensagem ao escalar), nunca bloqueio automático. Regra pura em
`packages/types/src/elegibilidade.js`; ver `ARCHITECTURE.md` § elegibilidade.

**Recorrência:** `recorrenciasSemanas` cria N+1 com o mesmo `serieId`. Edit/delete:
escopo **esta** ou **futuras**. Lib: `eventos-serie.ts`.

**Partida:** select no form (ou “cadastrar nova” via `CriarPartidaRapidaSchema`).
Requer `Tenant.afiliacaoId`. Queries de `Partida` **não** filtram por tenant.
Libs: `partidas.ts`, `admin/partidas/actions.ts`.

## RBAC / cron / Zod

- Criar: `EVENTS_CREATE`; editar/gerir/check-in/CSV: `EVENTS_MANAGE`.
- Abrir/encerrar embarque e exibir o QR do evento: `EVENTS_MANAGE`.
  **Auto-embarque do sócio (`/embarque?t=`) tem gate próprio** — sessão +
  `assertMembroAtivo` + RSVP `CONFIRMADO` + janela do QR, nunca `EVENTS_MANAGE`.
- Lembretes: `GET /api/cron/eventos-lembretes` (segredo de cron do projeto).
- Schemas: `packages/types/src/schemas/evento.js` (recorrência, lat/lng, partida,
  `MANDO_JOGO_LABEL`).

## Ações de valor (entregues)

- Calendário lista / semana / mês (cores por tipo)
- ICS, copiar link, publicar no mural (`?eventoId=` + foco composer)
- RSVP inline, QR câmera, **fila offline** (`checkin-offline.ts` → localStorage → sync)
- **Painel de embarque/presença** (`painel-embarque.tsx`): QR rotativo do evento
  + contador ao vivo + abrir/encerrar; sócio confirma em `/embarque`.
  `modo: 'caravana'` tem ida e volta; `modo: 'presenca'` (ensaio, evento na
  sede) tem uma perna só — sem seletor de trecho, sempre `IDA`
- Mapa embutido (OSM) + Ver no mapa / Como chegar (`evento-mapa-links.tsx`)
- Card da partida vinculada (`evento-partida-card.tsx`)
- Badge **Série** + escopo esta/futuras
- Cockpit: KPIs, embarque/presença, export CSV
- **Caravana paga × embarque (2026-08-03+):** lista com badge de pagamento,
  lotação por `PAGA`, cobrança auto ao confirmar, check-in warn+allow ou
  hard-block opcional (`checkInExigePagamento` + override); ver
  `modulo-caravanas.md`

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
- **Capa + mapa (2026-07-24):** admin eventos já usa crop 16:9 +
  `LocationPickerFields` (link Maps / pin / Street View). Padrão e backlog
  restante: `docs/frontend/media-upload-crop.md`.

## Insights administrativos (2026-07-22)

Nova `lib/eventos-insights.ts`: `resumirComparecimento` (taxa de presença =
check-ins/confirmados — walk-in conta, pode passar de 1; no-show =
`CONFIRMADO` sem `checkedInAt`; ocupação média vs capacidade efetiva) e
`listarPresencaPorEvento` (confirmados×presentes dos últimos eventos).
Superfícies: `InsightSection` no hub `/admin/eventos` e seção Eventos em
`/admin/relatorios`. Padrões: `docs/frontend/admin-ui-kit.md`.

## Agentes

`product-strategy` (escopo Agenda), `data-model` (`Partida` / série / waitlist),
`research-dominio` (fontes de jogos), `implementation`, `ux-review`, `qa-verification`,
`rbac` (perms eventos).
