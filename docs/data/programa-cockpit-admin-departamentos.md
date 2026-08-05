# Programa — Cockpit Admin dos Departamentos

> **Status:** Onda 1–5 ✓ · Piloto Pós-Onda 5 **P.1–P.5 fechado** (2026-08-04) —
> PWA / canal-por-área **HOLD** (R8). Relatório:
> `docs/ops/piloto-cockpit-pos-onda5-resultado.md`.
> Onda 4: Feminino `/admin/feminino`, Diretoria `/admin/diretoria`.
> Onda 3: Social `/admin/social`, Carnaval `/admin/carnaval`.
> **Navegação (2026-08-05):** hubs thin no `ADMIN_MENU` com `departamentoSlug` +
> `filterMenuByPermissionsAndGestoria` (gestor só vê o próprio módulo).
> **Agenda dia operacional (2026-08-05):** semana como entrada +
> `agruparDiaOperacional` + vincular partida; hubs thin com `DepartamentoSemanaOps`
> (critério ≤2 cliques até ops do próximo jogo).  

> **Complementa:** `modulo-departamentos.md`, `proposta-departamentos-portal-admin.md`  
> (esta virada **revisa** o foco “gestor opera só no portal”: o portal continua  
> execução; o **comando** passa a ter posto em `/admin` por domínio).  
> **Fonte de áreas:** `packages/types/src/departamento-areas-canonicas.js`.

---

## 0. Diagnóstico

### O que já existe (não reescrever)

| Camada | Estado |
|--------|--------|
| 10 departamentos canônicos + pacotes MEMBRO × GESTOR | `departamentos-canonicos.js` |
| Áreas de atuação e projetos (sem RBAC) | `DepartamentoArea`, `Projeto`; seed canônico |
| Portal cockpit `/portal/departamentos/[slug]` | Shell + registry + plugins/thin |
| `/admin/departamentos` | Consolidação institucional (`roles:manage`) — visão/áreas/equipes/projetos **leitura** |
| Domínios | Agenda (`Evento`), Financeiro, Patrimônio, Loja, Comunidade, Bar |

### Gap enunciado

Financeiro e Patrimônio são MVPs (livro-caixa + inventário estático) sem **direção**.
Caravana é plugin de Agenda (RSVP, vaga paga, embarque/QR) sem **ops de viagem**.
Vários departamentos não têm superfície admin de comando — o gestor vê pouco além do
portal e o membro às vezes esbarra em atalhos de admin.

### Virada de produto (fechada)

| Princípio | Decisão |
|-----------|---------|
| **Comando no Admin** | Gestor da unidade tem módulo(s) em `/admin` para dirigir o departamento. Membro **não** compartilha essas telas — só portal. |
| **Institucional separado** | `/admin/departamentos` + `/admin/acessos` continuam para `roles:manage` / Presidência. |
| **Caravana dedicada** | Rota `/admin/caravanas` (e navegação portal clara) **reusando** `Evento` — sem bounded context paralelo. |
| **Patrimônio com evidência** | Checkout com foto de retirada + foto de como ficou guardado; colaborador conclui sozinho; gestor audita e intervém em dano. |

---

## 1. Segregação Portal × Admin

### Personas

| Persona | Onde vive | O que faz |
|---------|-----------|-----------|
| **Colaborador (MEMBRO do depto)** | Só portal | Executa: checklist, presença, embarque, checkout com foto, próprios débitos |
| **Gestor (`canManageDepartamento` + perms de domínio)** | Portal (equipe/áreas/projetos) **+** Admin comando | Comanda: inbox, saúde, overrides, cadastro estrutural, régua, auditoria |
| **Presidência (`roles:manage`)** | Admin institucional | Pacotes, cargos, consolidação `/admin/departamentos`, hierarquia |
| **Oversight Diretoria** | Admin leitura | `*:view` / `audit:view` sem mutações indevidas |

### Regras não negociáveis

1. Menu admin filtra por **permissão efetiva**, nunca por `departamentoId`.
2. Membro **nunca** recebe deep-link “Abrir módulo” → `/admin/*`.
3. Portal = execução; Admin = comando/aprovação/auditoria/densidade operacional.
4. Área e Projeto **não** concedem RBAC. `RESPONSAVEL` = accountability.
5. Staffar gente da área permanece no portal (`canManageDepartamento`).
6. Mesma Server Action + `AuditLog` — UI muda; autorização e log não.

### Matriz rápida de superfície

| Ação | Superfície |
|------|------------|
| Ver colegas, checklist, projeto, próxima ação | Portal cockpit |
| Criar/arquivar área, designar responsável | Portal gestor (Presidência vê consolidado no admin) |
| Cadastro de item / baixa / marcar dano | **Admin** Patrimônio |
| Retirar / devolver com fotos | **Portal** (execução) → trilha no admin |
| Consultar saldo / pagar cobrança | Portal |
| Inbox inadimplência, rateio, fechamento | **Admin** Financeiro |
| RSVP / pagar vaga / status | Portal |
| Lotação, checklist ônibus, override embarque | **Admin** Caravanas |

---

## 2. Mapa dos 10 departamentos

Áreas canônicas (semente — a torcida pode criar/renomear/desativar).

### 2.1 Diretoria — Onda 4 ✓

| | |
|--|--|
| **Áreas** | Admissão · Governança · Jurídico/conformidade |
| **Missão admin** | Fila de sócios, LGE, oversight dos deptos |
| **Admin** | `/admin/diretoria` (`moduloPortal: diretoria`) — prancheta; `/admin/departamentos` segue `roles:manage` |
| **Portal membro** | Home da área; sem CRUD institucional |

### 2.2 Financeiro — **Onda 1**

| | |
|--|--|
| **Áreas** | Mensalidades · Caixa · Cobrança |
| **Missão admin** | Direção de caixa (inbox), não só CRUD de lançamentos |
| **Hoje** | `/admin/financeiro` (lançamentos, planos, cobranças, evolução) — MVP |
| **Evoluir** | Home **Direção** (inadimplência, projetos estourados, órfãos de rateio) |
| **Portal membro** | Consulta / próprios débitos / balanço se flag; sem régua massiva |
| **Perms** | `finance:view` / `finance:manage` (sem perm nova na Onda 1) |

### 2.3 Patrimônio — **Onda 1**

| | |
|--|--|
| **Áreas** | Instrumentos · Bandeirões e faixas · Sede e mobiliário |
| **Missão admin** | Inventário vivo + trilha de custódia com foto + auditoria de dano |
| **Hoje** | Inventário estático (`PatrimonioItem`); sem foto, sem checkout formal |
| **Evoluir** | Movimentos + fotos; vínculo a área; Inbox de anomalias no admin |
| **Portal membro** | Meus empréstimos; retirar/devolver com foto obrigatória |
| **Perms** | `patrimony:view` / `manage` + permitir execução do movimento a quem tem `view` (ver §4.1) |

### 2.4 Caravanas — **Onda 1**

| | |
|--|--|
| **Áreas** | Viagens · Embarque · Financeiro da viagem |
| **Missão admin** | Ops de viagem: lotação paga × embarque × checklist pré |
| **Hoje** | Plugin `Evento.tipo=CARAVANA` em `/admin/eventos`; painel portal |
| **Evoluir** | `/admin/caravanas` thin wrapper + detalhe ops-first (mesmo `Evento`) |
| **Portal membro** | RSVP, pagar vaga, status, QR no dia |
| **Perms** | `events:create` / `events:manage` (sem perm nova Onda 1) |

### 2.5 Bateria — Onda 2

| | |
|--|--|
| **Áreas** | Escolina · Ensaios · Escala de jogo · Instrumentos |
| **Missão admin** | Presença, escala, cruzamento com instrumentos `EM_USO` |
| **Hoje** | `?tipo=ENSAIO` + aside portal |
| **Evoluir** | `/admin/bateria` ou modo ENSAIO ops-first + link Patrimônio |
| **Portal membro** | Ensaios, presença, escolinha |

### 2.6 Social e eventos — Onda 3 ✓

| | |
|--|--|
| **Áreas** | Agasalho, Festa das Crianças, Páscoa, Natal, Sangue, Saúde, Inclusão digital, Corrida, Parcerias, Datas |
| **Missão admin** | Campanhas/projetos com orçamento + eventos ligados |
| **Admin** | `/admin/social` (`moduloPortal: social`); detalhe → `/admin/eventos/[id]` |
| **Portal membro** | Inscrição / checklist da frente; cockpit em `/portal/departamentos/social-e-eventos` |

### 2.7 Comunicação — Onda 2

| | |
|--|--|
| **Áreas** | Redes · Comunicados · Moderação · Cobertura de jogo |
| **Missão admin** | Inbox: denúncias + rascunhos + último comunicado |
| **Hoje** | `/admin/comunidade` (já operação pesada) |
| **Evoluir** | Home do módulo com pendências da área |
| **Portal membro** | Feed / post conforme pacote |

### 2.8 Materiais / Loja — Onda 2

| | |
|--|--|
| **Áreas** | Catálogo · Estoque · Pedidos e entrega |
| **Missão admin** | Inbox pedidos + ruptura de estoque |
| **Hoje** | `/admin/loja` completo |
| **Evoluir** | Posto de comando no topo do módulo (sem app novo) |
| **Portal membro** | Comprar / acompanhar pedido |

### 2.9 Carnaval — Onda 3 ✓

| | |
|--|--|
| **Áreas** | Barracão · Alegorias · Ensaios de rua · Cronograma |
| **Missão admin** | Checklist barracão + cronograma (Agenda) — **sem** ERP de escola |
| **Admin** | `/admin/carnaval` (`moduloPortal: carnaval`); barracão via `meta.barracao` |
| **Portal membro** | Progresso / presença; cockpit em `/portal/departamentos/carnaval` |

### 2.10 Feminino — Onda 4 ✓

| | |
|--|--|
| **Áreas** | Ações de acolhimento · Presença nos jogos |
| **Missão admin** | Thin sobre Agenda + Comunidade |
| **Admin** | `/admin/feminino` (`moduloPortal: feminino`); detalhe → `/admin/eventos/[id]` |
| **Portal membro** | Equipe + eventos da frente |

---

## 3. Padrão — Cockpit Admin reutilizável

Não são 10 apps. É **um shell + domínio pluggable** (espelho do registry portal).

```
AdminDepartamentoShell
├── Header (módulo / unidade / papel)
├── KpiStrip (3–5 KPIs baratos)
├── Inbox ("precisa de você")     ← coração
├── DomainPanel (slots do domínio)
├── EquipeResumo → deep-link portal staff
└── DeepLinks (Agenda, Relatórios, Auditoria)
```

UI: kit `components/admin/ui/` + tabs `ADMIN_MODULOS` / `montarTabsModulo`.

### Tipos de módulo admin

| Tipo | Exemplos | Regra |
|------|----------|--------|
| **Domínio rico** | Financeiro, Patrimônio, Caravanas, Loja, Comunidade | Inbox + operação |
| **Plugin de Agenda** | Bateria, Social (festa) | Shell fino + vista `Evento` filtrada |
| **Institucional** | Diretoria, `/admin/departamentos` | `roles:manage` / `members:*` |

### Anti-padrões

- Switch monstro de 10 cases num componente.
- Duplicar Loja/Comunidade/Eventos dentro do depto.
- Filtrar sidebar de **domínios** por nome do departamento (Financeiro some
  se você não é do depto Financeiro). Hubs thin usam `departamentoSlug` +
  gestoria — isso não é o mesmo anti-padrão.
- Segundo calendário paralelo ao hub Agenda (quebraria decisão **1A** no **modelo**).
- Dar `roles:manage` ao gestor “só para ver gente”.

---

## 4. Onda 1 — detalhe dos fluxos estrela

**ICP:** sede com patrimônio compartilhado + mensalidade + ≥1 caravana/temporada.  
**Fora da Onda 1:** mapa de assentos, conciliação bancária, ERP de carnaval, CRM.

**Ordem de implementação sugerida:**  
(1) Financeiro Direção → (2) Caravanas rota ops → (3) Patrimônio movimento+foto.

### 4.1 Patrimônio — custódia com foto × áreas

#### Dor

Instrumento some no ensaio; bandeirão volta rasgado; ninguém prova quem tirou nem
como ficou a sala de guarda.

#### Modelo (MVP)

| Peça | Papel |
|------|--------|
| `PatrimonioItem` | + `areaId?` → `DepartamentoArea` do depto Patrimônio; sugerir área pela categoria |
| `PatrimonioMovimento` (novo) | `SAIDA` \| `DEVOLUCAO`; fotos; ator; `eventoId?`; `status`; observação de dano |
| Status item | `DISPONIVEL` ↔ `EM_USO`; `MANUTENCAO` se gestor marcar dano |

#### Fluxo fechado (auto-aprovação + auditoria)

```text
Colaborador (portal)                    Gestor (admin)
─────────────────────                   ────────────────────────────
1. Escolhe item da área certa
2. Tira foto na retirada
3. Confirma saída → item EM_USO
   (AuditLog imediato)          →       Inbox / “Em uso”: trilha ao vivo
4. Na devolução: foto de como
   ficou guardado → DISPONIVEL
                                    5. Audita; se dano/foto ruim:
                                       MANUTENCAO + observação
                                       (+ opcional despesa categoria PATRIMONIO)
```

**Regra de produto:** foto de saída **e** foto de guarda são **obrigatórias**
(Instrumentos e Bandeirões). Mobiliário/sede: obrigatório na v1 se o item tiver
flag `exigeEvidencia` (default true para instrumentos/bandeirões via categoria).

**Permissão:** colaborador com `patrimony:view` **executa** saída/devolução própria
(com foto). `patrimony:manage` edita cadastro, baixa, marca dano, vê toda a trilha.
Não introduzir `patrimony:checkout` nesta decisão (auto-fluxo basta).

#### Superfícies

| Quem | Tela |
|------|------|
| Gestor | `/admin/patrimonio` — **Inbox anomalias** · Inventário · Em uso · Manutenção |
| Membro | `/portal/patrimonio` — Meus empréstimos · Retirar · Devolver |
| Bateria (Onda 2) | Deep-link instrumentos `EM_USO` |

#### Aceite

- [ ] Item vinculável a área; filtro por área no admin.
- [ ] Saída sem foto = bloqueio; devolução sem foto de guarda = bloqueio.
- [ ] Colaborador sem `manage` não edita cadastro nem baixa item.
- [ ] Gestor vê itens em uso > N horas / fotos recentes / danos.
- [ ] `AuditLog` em toda saída/devolução/dano; `tenantId` sempre.

---

### 4.2 Financeiro — direção inteligente

#### Dor

O sistema vende −50% de inadimplência. Livro-caixa sozinho não dirige: o
tesoureiro precisa de **inbox** (quem deve, o que venceu, projeto estourado).

#### Hub Direção (reusa dados existentes)

| Bloco | Fonte |
|-------|--------|
| Inadimplentes D+0 / D+7 | `CobrancaAssociacao` |
| Caixa 7 / 30 dias | agregados financeiros já existentes |
| Projetos em alerta orçamentário | `Projeto` + soma `DESPESA` (`saudeOrcamento`) |
| Lançamentos sem rateio | `departamentoId`/`projetoId` nulos |
| Atalhos | Planos, cobranças, CSV |

Home admin passa a abrir em **Direção**, não na lista crua.

| Admin (`finance:manage`) | Portal (`finance:view`) |
|--------------------------|-------------------------|
| Inbox + régua + rateio + export | Consulta / próprios débitos |
| CRUD lançamento | Sem CRUD no colaborador |
| Planos e cobranças | Pagar / 2ª via |

#### Aceite

- [ ] Home = Direção (inbox).
- [ ] Um clique D+7 → cobrança do sócio.
- [ ] KPI projetos usa regra pura existente.
- [ ] Colaborador não vê régua massiva.
- [ ] Rateio visível na listagem/CSV (fecha gap atual de UX).

---

### 4.3 Caravanas — módulo ops dedicado (reuso `Evento`)

#### Decisão de navegação (fechada)

| Opção | Veredito |
|-------|----------|
| Só `?tipo=CARAVANA` no hub | Insuficiente para percepção de produto |
| **`/admin/caravanas` thin → `Evento`** | **Adotado** |
| Domínio `Caravana` / `Viagem` separado | Rejeitado (quebra 1A, duplica RSVP/check-in) |

Detalhe:

- URL canônica do recurso: `/admin/eventos/[id]` (notificações / AuditLog estáveis)
  **ou** alias `/admin/caravanas/[id]` com `permanentRedirect` / layout compartilhado.
- `/admin/caravanas` = lista ops + Inbox + “Nova caravana” (`tipo` fixo).
- Agenda continua o calendário unificado (decisão **1A** no modelo).
- Portal: `/portal/eventos?tipo=CARAVANA` (+ hub depto).
- Atualizar `DEPARTAMENTO_MODULO_ADMIN_ROTA.caravanas`.

#### Inbox ops (sem ônibus/assentos na Onda 1)

| Alerta | Critério |
|--------|----------|
| Lotação crítica | `PAGA` ≥ 90% capacidade |
| Pagantes sem embarque (T−3h) | `PAGA` sem `checkedInAt` |
| Confirmados sem pagar | RSVP CONFIRMADO + cobrança aberta |
| Override de check-in hoje | AuditLog override |
| Checklist incompleto | `Evento.meta.checklistCaravana` |

Checklist sugerido (meta JSON, não tabela nova): documento/contato motorista,
horário concentração, materiais/bandeirão (link Patrimônio), água, kit.

Áreas do depto orientam UX (Viagens / Embarque / Financeiro da viagem) — **não**
viram entidades separadas de viagem.

#### Aceite

- [ ] Gestor chega em `/admin/caravanas` sem descobrir filtro da Agenda.
- [ ] Pagamento × embarque em 1 tela.
- [ ] Membro não vê override nem checklist de ops.
- [ ] Criar caravana **não** cria segunda tabela.
- [ ] Filtro legado `?tipo=CARAVANA` continua válido.
- [ ] KPI lotação do aside usa regra `PAGA` (alinhar gap atual confirmados≠pagos).

---

### 4.4 Entregáveis transversais Onda 1

1. Hub portal: botão **Operação / Comandar** só com manage do domínio.
2. Registry + rotas admin Caravanas / enriquecer Patrimônio e Financeiro.
3. Nota em `ARCHITECTURE.md` / proposta departamentos apontando esta virada.
4. Storage de fotos: **reusar** pipeline media do produto; sensibilidade RESTRITO;
   retenção LGPD documentada.
5. Testes RBAC: “Membro · X não muta admin indevido”.
6. Specs `modulo-patrimonio.md`, `modulo-financeiro.md`, `modulo-caravanas.md`
   atualizados na mesma entrega.

---

## 5. Ondas 2–4

### Onda 2 — Bateria + Loja + Comunicação

| Depto | Entrega |
|-------|---------|
| **Bateria** | Ops ENSAIO + instrumentos `EM_USO` (depende forte da Onda 1 Patrimônio) |
| **Loja** | Inbox pedidos + ruptura na home `/admin/loja` |
| **Comunicação** | Inbox denúncias + comunicados na raiz `/admin/comunidade` |

Entrada: Onda 1 estável em piloto (1–2 sedes), sem regressão Agenda.

### Onda 3 — Social + Carnaval ✓

| Depto | Entrega |
|-------|---------|
| **Social** | `/admin/social` — campanhas/projetos + eventos do depto; `moduloPortal: social` |
| **Carnaval** | `/admin/carnaval` — checklist barracão (`meta.barracao`) + cronograma; `moduloPortal: carnaval` |

Atalho "Operação" via `hrefOperacaoAdmin`. Detalhe de evento → `/admin/eventos/[id]`.
Sem ERP de escola (fantasia, harmonia, alas). Após deploy: `seed:departamentos`
para gravar `moduloPortal` novo nos tenants existentes.

### Onda 4 — Feminino + Diretoria ✓

| Depto | Entrega |
|-------|---------|
| **Feminino** | `/admin/feminino` — equipe + agenda thin; `moduloPortal: feminino` |
| **Diretoria** | `/admin/diretoria` — prancheta (filas + saúde deptos); `moduloPortal: diretoria` |
| **Transversal** | Canal por área / PWA check-in — **residual** (sem critério métrico nesta entrega) |

Atalho "Operação" via `hrefOperacaoAdmin`. Após deploy: `seed:departamentos`
para gravar `moduloPortal` novo nos tenants existentes.

### Onda 5 — Polimento piloto ✓

| Entrega | Status |
|---------|--------|
| `AdminInboxList` + ações (baixa, confirmar pedido, aprovar, embarcar) | ✓ |
| Financeiro: sem write no GET; botão “Atualizar vencidas”; baixa inline | ✓ |
| Caravanas: loader unificado (lista + inbox) + embarque 1º | ✓ |
| Loja: home = Comando; catálogo em `/admin/loja/produtos` | ✓ |
| Patrimônio: `patrimonio-direcao` (atrasos / manutenção) | ✓ |
| Diretoria: aprovar top da fila na prancheta | ✓ |
| Unificar loaders Bateria/Social/Feminino | ✓ |
| **Semana 3** (abaixo) | ✓ |

#### Semana 3 — fecho da Onda 5 (entregue 2026-08-04)

| # | Ticket | Status |
|---|--------|--------|
| **S3.1** | `slaLabel` + `sla` em `*-direcao` | ✓ |
| **S3.2** | Suspense KPIs / inbox+lista | ✓ |
| **S3.3** | `unstable_cache` TTL 45s + `invalidateAdminDirecao` | ✓ |
| **S3.7** | Carnaval `lista` unificada | ✓ |
| **S3.6** | Financeiro cache saldo/inad 45s | ✓ |
| **S3.4** | `meta.desfileEm` + urgência ≤14d | ✓ |
| **S3.5** | Comunidade top-3 denúncias com idade | ✓ |

**Critérios de pronto Onda 5:** decisão na fila sem sair da home; GET financeiro sem write;
thin Agenda com 1 `findMany` de eventos; SLA legível nos cards prioritários; TTFP com Suspense.

#### Pós-Onda 5 — piloto operacional (14 dias, não é onda de código)

Sedes âncora: **Gaviões** (`pde-gavioes-fiel`) + **Corinthians-teste** (lote
`seed:corinthians-teste`). Canvas: `canvases/cockpit-pos-onda5-piloto.canvas.tsx`.

| # | Fase | Dono | Saída |
|---|------|------|-------|
| **P.1** | Congelar 4 contas (Fin + Caravanas × 2 sedes) | Produto | ✓ 2026-08-04 — ver `docs/ops/piloto-cockpit-pos-onda5-resultado.md` |
| **P.2** | `seed:departamentos` nos tenants âncora | Ops | ✓ 2026-08-04 — 569 tenants, 0 falhas (~491s) |
| **P.3** | Baseline p95 `/admin/financeiro` e `/admin/caravanas` (`PERF_METRICS=1`, 1ª/2ª carga) | Perf | ✓ 2026-08-04 — payload cold (`piloto:cockpit`); Fin ~1.0–1.5s · Caravanas ~0.6–1.1s |
| **P.4** | Demo 15 min (baixa inline + embarcar 1º) | Produto | ✓ 2026-08-04 — smoke actions reais (baixa + check-in) |
| **P.5** | Revisão §7 + go/hold PWA check-in e canal-por-área | Produto+Perf | ✓ **fechado 2026-08-04** — PWA **HOLD** · canal-por-área **HOLD** (ver resultado.md §P.5) |

Reexecutar smoke: `pnpm --filter @torcida/web piloto:cockpit`.  
Relatório completo: `docs/ops/piloto-cockpit-pos-onda5-resultado.md`.

**Gates fechados:** PWA check-in / canal-por-área em HOLD até evidência (§ criterio no resultado).
Reabrir código de produto só com regressão p95 HTML, bug de demo ou go afirmativo.

Canvas Semana 3: `canvases/cockpit-onda5-semana3-plano.canvas.tsx`.

---

## 6. Decisões de arquitetura

| ID | Tema | Status | Decisão |
|----|------|--------|---------|
| **R1** | Comando no admin? | **Fechada** | Sim — gestor comanda em `/admin`; membro no portal |
| **R2** | Caravanas URL | **Fechada** | `/admin/caravanas` thin reusando `Evento` |
| **R3** | Checkout patrimônio | **Fechada** | Auto-aprovação com foto; gestor audita / dano |
| **R4** | Storage fotos | Recomendado | Pipeline media existente; RESTRITO |
| **R5** | `/admin/departamentos` | Recomendado | Continua `roles:manage` (não fundir com domínio) |
| **R6** | Multi-unidade | Recomendado | Tenant ativo (Caso B comanda o próprio patrimônio) |
| **R7** | Performance inbox | Recomendado | Agregados baratos + cache; agente `performance` se RSVP grande |
| **R8** | PWA check-in / canal-por-área (P.5) | **Fechada (HOLD)** | 2026-08-04: sem evidência no piloto técnico; reabrir só com critério no `piloto-cockpit-pos-onda5-resultado.md` §P.5 |

---

## 7. Critérios de sucesso (90 dias pós Onda 1 piloto)

| Métrica | Alvo |
|---------|------|
| Gestores Fin/Pat/Caravanas usando admin ≥1×/semana | ≥ 70% dos ativos no piloto |
| Movimentos Instrumentos/Bandeirões com duas fotos | ≥ 80% |
| Achar ops da próxima caravana a partir do menu | ≤ 2 cliques |
| Cobranças D+7 tocadas via inbox (30 dias) | ≥ 50% |
| Colaborador mutando admin indevido | **0** (teste automatizado) |

### Guardrails

- [ ] AuditLog em movimento patrimônio, override caravana, ações de régua.
- [ ] `tenantId` em toda query nova.
- [ ] Sem regressão e2e Agenda / create CARAVANA.
- [ ] Docs `modulo-*` na mesma PR da feature.

### O que não conta como sucesso

Mais telas por vaidade · ERP completo · segundo calendário · infra além Faixa A
sem métrica de piloto.

---

## 8. Próximo passo

Piloto Pós-Onda 5 (P.1–P.5) **fechado** (2026-08-04). Ondas 1–5 de código entregues.

1. Acompanhar 14d nas contas P.1 (adoção §7) — ops/produto, não implementação.
2. Medição HTML opcional: `PERF_METRICS=1` + DevTools em `/admin/financeiro` e `/admin/caravanas`.
3. Novas fatias de código só com: regressão p95, bug de demo, ou reabertura **R8** (GO P.5).

Relatório: `docs/ops/piloto-cockpit-pos-onda5-resultado.md`.

---

*Programa alinhado ao nicho (custódia de material, inadimplência, embarque) e à
segregação gestor × membro. Complementa a Fase 0–5 do portal; não a substitui —
o portal enriquece a **execução**; o admin ganha o **posto de comando**.*
