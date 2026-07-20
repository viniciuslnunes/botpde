# Proposta — Governança Hierárquica (Sede → Subsede → PDE)

> Status: **planejamento** (Opus). Ainda não implementado.
> Objetivo: transformar subsedes e pontos de encontro em **portais de gestão
> local** governáveis, dando à Sede visibilidade top-down da administração das
> afiliadas, sem que a base possa gerir a Sede. Complementa
> `modulo-departamentos.md` (worktree da Visão) e `ARCHITECTURE.md` §5 (hierarquia
> de tenants / visibilidade cross-tenant).

## 1. Regras de negócio (travadas com o Presidente do produto)

- **R1 — Visão de cima para baixo (leitura total, sem interferência).** O Presidente
  pode **visualizar o admin completo** de todas as subsedes e PDEs — todos os
  módulos e funcionalidades, não só agregados. O que **não** pode, neste MVP, é
  **editar/interferir diretamente** na operação da unidade. Leitura total +
  mutação zero. (Pode mudar no futuro; por ora é regra dura — é o que justifica o
  sistema de permissionamento complexo.)
- **R2 — Sem gestão de baixo para cima.** Subsede/PDE **não** pode gerir a Sede.
- **R3 — Hierarquia completa é opt-in.** Uma subsede/PDE só enxerga a hierarquia
  completa da Sede se o **Presidente habilitar** isso nas configurações. Padrão:
  **desabilitado** (a unidade vê só a si mesma + o conteúdo público do ancestral).
- **R4 — Afiliação é acionada por suporte, decidida por governança.** O vínculo
  (promoção a portal próprio / afiliação de uma unidade a uma Sede) nasce quando um
  administrador **contata o suporte** e solicita o vínculo. Então:
  - Se a **Sede já existe** na plataforma como administradora → **Presidente e
    Vice decidem a afiliação, com peso final do Presidente**.
  - Se **não existe** Sede administradora → a **administração do sistema
    (super-admin)** realiza a adesão.
  - O processo de afiliação é **editável administrativamente** tanto pela **Torcida
    (Sede)** quanto pelo **super-admin**.

## 2. Estado atual (o que já existe — não reinventar)

O modelo já é **híbrido** e prevê dois jeitos de uma unidade existir:

- **Caso A — Sede intra-tenant** (leve): linha em `Sede`
  (`tipo` SEDE/SUBSEDE/PONTO_ENCONTRO), ligada por `Sede.sedeId` (árvore),
  **dentro** do tenant principal. Membros fixados por `SaasMembro.sedeId`; bar e
  estoque isolados por `sedeId`. **Compartilha o RBAC do tenant** — sem diretoria
  própria. (`schema.prisma` model `Sede`; comentário de `responsavelUserId`:
  *"liderança local — identidade; poder vem via Caso B"*.)
- **Caso B — Tenant próprio** (pesado): a unidade vira um `Tenant`, encaixado na
  árvore via `Sede.sedeId`. Tem `Role`/`UserRole`/`SaasMembro`/financeiro/loja
  próprios. `Sede.tenantId` é **opcional** de propósito — a infra de **promoção
  A→B** já está prevista.

Espinhas já construídas:

- `apps/web/src/lib/hierarquia.ts` — resolve `ancestor`/`descendant`/`allied`/
  `rival`; `getDescendantTenantIds`, `getAncestorTenantIds`, `getTorcidaWorktree`
  (funde Sedes Caso A + Tenants Caso B), `getVisibleTenantIds` (descendente vê
  público do ancestral).
- `/admin/torcida` ("Visão da torcida") — **console de leitura** do Presidente/Vice
  (`assertPresidenteGlobal`), já lista a worktree inteira com contagens de
  afiliados/sócios/torcedores por unidade. *"Nenhuma ação de gestão aqui."*
- `/admin/configuracoes` — settings do tenant, gate `SETTINGS_MANAGE` + `owner`.
- RBAC por `tenantId` (`Role`/`UserRole` **sem** `sedeId`).

## 3. Decisão de arquitetura

**A unidade governável (com diretoria própria) = Caso B (tenant próprio).**
Justificativa direta das regras travadas:

- "Diretor de subsede sem ser diretor da Sede" **exige RBAC isolado**, que hoje só
  o tenant entrega → Caso B.
- **R2 sai de graça**: RBAC é por tenant, então o diretor da subsede não tem papel
  no tenant da Sede — estruturalmente não gere a Sede.
- **R1** reusa a visibilidade `descendant`/`ancestor` + o console `/admin/torcida`.

**Caso A permanece como "unidade leve"** (endereço físico + engajamento via canal
oficial da unidade), para pontos de encontro que ainda não precisam de diretoria.
O ciclo de vida é **promoção A→B** quando a unidade amadurece.

**Escopar RBAC por `sedeId` (governança dentro do tenant) fica FORA deste plano** —
é o caminho mais arriscado (mexe no núcleo `assertPermission`) e desnecessário,
já que Caso B satisfaz R1/R2/R3. Registrado como opção futura em `ARCHITECTURE.md` §6.

## 4. Mudanças por camada

### 4.1 Modelo de dados (agente `data-model`)
- **Toggle R3** — novo campo no `Tenant` da Sede, ex.:
  `hierarquiaVisivelParaFilhos Boolean @default(false)` (`@map`). Só a raiz SEDE o usa.
- Avaliar se "ver administração" (R1) precisa de novos campos ou só de agregação
  read-only sobre o que já existe (provável: **só agregação**, sem schema novo).
- Documentar o gatilho de **promoção A→B** (Sede sem tenant → cria/vincula tenant),
  reusando o `Sede.tenantId` opcional.

### 4.2 RBAC / autorização (agente `rbac`)
- Confirmar que **nenhuma** Server Action de mutação aceita `tenantId` de
  ancestral vindo de um ator descendente (garantia de R2). Auditar `assertPermission`
  e o contexto de tenant (`tenant-context.ts`).
- Definir o **papel de leitura cross-tenant** do Presidente da Sede sobre
  descendentes (R1): estender `assertPresidenteGlobal` para autorizar drill-down
  **read-only** nas unidades da worktree — nunca escrita.
- Definir quem, na subsede, é a "diretoria local" (cargos de sistema do tenant-filho).

### 4.3 Visibilidade (agente `data-model` + `hierarquia.ts`)
- **R3 — NÃO gatear `getAncestorTenantIds`.** (Correção pós-validação `data-model`.)
  Essa função só devolve IDs de ancestrais; a limitação a PÚBLICO já vem de
  `canViewRecurso('descendant', recurso)` em `getVisibleTenantIdsImpl`
  (`hierarquia.ts:368`) — é justamente o "conteúdo público do ancestral" que R3 diz
  ser **sempre** permitido. Gatear ali **quebraria a cascata pública** de
  comunicados/eventos (regressão).
- **R3 — o que o toggle realmente libera** é uma capacidade **nova**: o descendente
  ver a **árvore inteira** (irmãos/worktree do root). Implementar com:
  - `getHierarquiaVisivelParaFilhos(rootTenantId)` (leitura por PK, cacheada com
    `HIERARCHY_CACHE_TAG` + `hierarchyCacheTag`);
  - `getWorktreeParaDescendente(actorTenantId)`: resolve o root pela cadeia de
    ancestrais, lê o toggle; `false` → `[self]`; `true` → delega a
    `getTorcidaWorktree(root)`.
  - `getTorcidaWorktree`/`getTenantHierarquia` seguem intactas para o console do
    Presidente (R1 top-down — não dependem do toggle).
  - Alternar o toggle → `invalidateHierarchyCache(rootTenantId)` (`hierarquia.ts:13`).
- **R1** não muda a visibilidade base (ancestral já agrega descendentes); muda a
  **profundidade** do console (ver 4.4).

### 4.4 UI / produto (agentes `product-strategy`, `ux-review`)
- **Console top-down (R1)** — evoluir `/admin/torcida` de "contagens" para
  **oversight read-only por unidade**: drill-down em membros, financeiro, eventos e
  saúde do bar de cada subsede/PDE, preservando *"cada unidade é gerida pela sua
  liderança"* (nenhum botão de mutação).
- **Configurações (R3)** — toggle "Permitir que subsedes vejam a hierarquia
  completa" em `/admin/configuracoes`, gate `SETTINGS_MANAGE`/owner, com `AuditLog`.
- **Portal da subsede** — a diretoria local opera seu próprio `/admin` (tenant-filho);
  quando R3 ligado, ganha uma visão (read-only) da árvore da Sede.
- **Promoção A→B** — fluxo guiado no console da Sede: "promover unidade a portal
  próprio" (cria tenant-filho + diretoria inicial).

## 5. Fases de entrega (sequenciamento reconciliado pós-validação)

Ajuste-chave dos três agentes: **R1/R3 só têm sujeito depois que existe Caso B na
árvore**, então a afiliação/promoção sobe de prioridade; e a fundação (schema +
permissão + contratos de authz) é aditiva e barata, entra cedo. Nota: o "bug de
cache simétrico em `getTenantRelation`" citado na validação **já está corrigido** no
código (`hierarquia.ts:334` usa chave direcional) — não é trabalho novo.

- **Fase 0 — Segurança (bloqueante, baixo custo).** Auditar a trava R2: varredura de
  Server Actions de mutação que aceitam `tenantId` de input; garantir que usam
  `ctx.tenant.id` do assert e descartam o input. Formalizar o invariante em
  `ARCHITECTURE.md §5.3` + testes de regressão. Blindar a assinatura de
  `assertMembroAtivo(tenantId, …)` (`authz.ts:159`).
- **Fase 1 — Fundação aditiva (schema + authz + contratos).** Tudo nullable/aditivo,
  seguro no `db push`:
  1. `Tenant.hierarquiaVisivelParaFilhos Boolean @default(false)` + helpers
     `getHierarquiaVisivelParaFilhos` / `getWorktreeParaDescendente` (ver §4.3).
  2. `Sede.canalConversaId String? @unique` + relação `SedeCanal` (espelha
     `Departamento.canalConversa`; **fecha o gap Caso A**, pois o ponteiro fica no
     nó `Sede` que existe em A e B).
  3. Permissão nova `AFFILIATION_MANAGE` em `permissions.js` (owner + vice; **não**
     admin — mesmo recorte de `TORCIDA_GLOBAL_VIEW`).
  4. Contrato de `assertPresidentePodeLerUnidade(targetTenantId)` (reusa
     `assertPresidenteGlobal` + valida `target ∈ getDescendantTenantIds(root)`).
  5. Toggle R3 na UI de `/admin/configuracoes` (gate `SETTINGS_MANAGE` + owner +
     `AuditLog`). Plumbing barato; valor de uso aparece quando há Caso B.
  6. Decisão LGE documentada: PII (RG/CPF/filiação/endereço) **mascarada** no modo
     leitura cross-tenant.
- **Fase 2 — Afiliação/promoção A→B (o que popula o Caso B).** Modelo
  `AfiliacaoUnidade` (1:1 fino com o nó `Sede`, **não** duplica a árvore); fluxo:
  suporte registra → Presidente/Vice decidem (peso final do Presidente = estado de
  workflow, não RBAC) ou super-admin adere; fila no super-admin e em `/admin/torcida`.
  Promoção = setar `Sede.tenantId` + provisionar diretoria + auto-provisionar canal
  oficial da unidade + auto-vínculo de membros via `MembroConversa` **em
  `aprovarMembro`** (nunca em GET/solicitação — anti-padrão write-on-GET já causou
  órfãos de departamento).
- **Fase 3 — Console top-down R1, read-only por módulo.** Ordem por valor×risco:
  **Financeiro → Eventos → Bar/Patrimônio → Membros** (Membros por último, com PII
  mascarada, por causa de LGE). Cada módulo reusa **loaders** (nunca as páginas de
  admin do filho, que embutem `<form action>`).
- **Fase 4 (futuro / avaliar)**: RBAC escopado por `sedeId` **sem** promover a tenant
  — só se o peso de "tenant por unidade" doer. `Sede.canalConversaId` já deixa o
  terreno preparado.

## 6. Riscos e questões abertas

Decisões já fechadas (não são mais dúvidas):
- **Limiar de promoção** → resolvido por **R4**: não é automático por "maturidade";
  é **acionado por suporte** e decidido por governança (Presidente/Vice, ou
  super-admin). Não multiplica tenants sem curadoria humana.
- **Escopo de R1** → **leitura total** de todos os módulos do admin da unidade,
  **sem edição** no MVP.

Riscos que continuam:
- **Vazamento cross-tenant (escrita)**: R1 dá leitura total, então o risco crítico
  vira **reuso de componentes/rotas de admin que têm ações de mutação**. O
  drill-down do Presidente precisa de um **modo somente-leitura garantido no
  servidor** (não só esconder botões). Núcleo do trabalho do `rbac`.
- **LGE / dados sensíveis**: `SaasMembro` tem RG/CPF. R1 permite ao Presidente ver
  o admin da unidade — validar com `rbac` se há base legal para o Presidente da
  Sede ver dado LGE de membro de outra unidade, ou se esses campos são mascarados
  no modo-leitura cross-tenant.
- **Fluxo de afiliação (R4)**: precisa de estado editável (quem afiliou, quando,
  status) manipulável por Sede **e** super-admin — modelar sem duplicar a árvore
  de `Sede`/`tenantId` que já existe.

## 7. Vínculo com a Comunidade (subsede/PDE ↔ feed)

**Recomendação: subsede/PDE = CANAL (não grupo), com auto-vínculo dos membros.**

- **Feed principal continua único e compartilhado** para todos os associados
  (torcedor↔torcedor, torcida principal, comunicados; abas Descobrir/Seguindo/Meus
  grupos). Não fragmentar a praça social — a unidade **adiciona** uma camada, não
  substitui o feed.
- **Cada subsede/PDE governável (Caso B) = um `Conversa` CANAL** com
  `canalOficial: true`, `institucional: true`, `visibilidadeCanal: HIERARQUIA`,
  `somenteAdminPublica: true`. Semântica bate: unidade institucional com diretoria
  → comunicação **top-down** (admin publica, membro consome) = canal. Grupo é
  horizontal/criado por membro → semântica errada.
- **Precedente no código**: `Departamento` já tem canal oficial
  (`Conversa.departamentoCanal`), com membership por `MembroConversa` (leitura
  chaveada por participação, não por tenant). O canal da unidade **espelha esse
  padrão** — zero conceito novo.
- **Auto-vínculo**: ao afiliar/aprovar um membro na unidade (`SaasMembro` do
  tenant-filho), inserir `MembroConversa` no canal oficial da unidade. O membro
  ganha seu canal institucional local **e** segue no feed global.
- **Ponto a validar (`data-model`)**: unidades **Caso A** (Sede intra-tenant, sem
  tenant próprio) não têm canal-oficial-por-tenant. Para o MVP, como o governável é
  Caso B, o canal oficial por tenant resolve; Caso A herda o canal da Sede. Decidir
  se algum dia se chaveia canal por `sedeId`.

## 8. Validação por agentes antes de codar

- `rbac` — trava R2, papel de leitura cross-tenant do Presidente, LGE no console.
- `data-model` — campo do toggle, gatilho de promoção A→B, impacto no schema.
- `product-strategy` — limiar de promoção A→B e escopo de R1.
- `ux-review` — jornada do console top-down e do portal da subsede.
- `qa-verification` — antes de dar por pronto (authz no servidor, estados, Vitest).
