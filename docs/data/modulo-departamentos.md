# Módulo — Departamentos como unidade de acesso

> Como uma torcida organiza acesso por departamentos (Financeiro, Social, Bateria,
> Caravanas, Comunicação, Feminino, Carnaval, Patrimônio, Diretoria…). Complementa
> `docs/knowledge/estrutura-governanca.md` (o vocabulário real) com a mecânica de RBAC.

## Fluxo: perfil vinculado ao departamento

Há **três seções** em `/admin/acessos`:

| Seção | Função |
|------|--------|
| **Cargos** (`?secao=cargos`) | Templates de perfil — opcionalmente ligados a um departamento (membro/gestor) + extras |
| **Departamentos** (`?secao=departamentos`) | Template da área: pacote colaborador e gestor |
| **Pessoas** (`?secao=pessoas`) | Atribui **perfis**; a área de atuação é projeção do perfil |

Ordem sugerida:

1. Em **Departamentos**, revise o pacote de cada área.
2. Em **Cargos**, cada área canônica nasce com `Membro · {Área}` e `Gestor · {Área}`.
   Presidente / Vice / Admin vinculam-se à **Diretoria** (gestor) com extras de governança.
3. Em **Pessoas**, marque o perfil — isso já coloca a pessoa na área e concede o pacote.

### Composição

```
efetivas = ∪ permissionsOfRole(perfil, depto)
         ± UserPermission (overrides pontuais)
```

`permissionsOfRole`:

- Com `departamentoId`: pacote do depto (membro ou gestor) ∪ `permissionsExtras`
- Sem departamento (transversal, ex. `member`): `permissions` ∪ `permissionsExtras`

`UserDepartamento` / `DepartamentoGestor` são **projeção** ao salvar os perfis
(`syncMembershipFromRoles`).

**Elegibilidade obrigatória:** só `SaasMembro` canônico do próprio tenant,
`SOCIO`, `APROVADO` e sem desligamento pode receber perfil ou projeção de área.
`TORCEDOR`, pendente/reprovado, desligado e registro espelhado não pertencem a
departamento. O sincronizador remove projeções inelegíveis; o desligamento
também remove atomicamente os perfis de área, preservando perfis transversais.

### Permissões adicionais → novo perfil

Na aba **Permissões adicionais** da pessoa, deltas além do pacote dos perfis podem ser
salvos como **novo perfil** reutilizável (`salvarPerfilComposto`).

### Colaborador vs gestor

| Papel no perfil | Projeção | Pacote |
|-----------------|----------|--------|
| **MEMBRO** | `UserDepartamento` | `Departamento.permissions` |
| **GESTOR** | membro + `DepartamentoGestor` | `permissions` ∪ `permissionsGestor` |

**Delegação sem virar admin geral**: `canManageDepartamento` (`permissions.js`)
libera a gestão de pessoas de um departamento para quem tem `ROLES_MANAGE`
global **ou** está registrado como `DepartamentoGestor` daquele departamento
específico — um Gestor de Bateria, por exemplo, administra os colaboradores da
Bateria sem precisar de `ROLES_MANAGE` (que abriria todos os departamentos).
É o mecanismo central de delegação pontual do módulo.

### Matriz canônica (seed)

Fonte: `packages/db/src/departamentos-canonicos.js` — `bootstrapAcessoTenant` /
`upsertPerfisDepartamentoCanonicos`.

| Departamento | Colaborador (portal) | Gestor+ (portal + operação admin) |
|---|---|---|
| **Diretoria** | **Oversight admin (leitura)** + portal: relatórios, auditoria, membros/sócios, agenda, pedidos, comunidade, financeiro, patrimônio, estrutura/unidades; salas; DMs/grupos; postar | Aprovar/reprovar/advertir/bloquear/importar/desligar membros; LGE; comunicados; criar/gerir eventos; mural/moderação/notícias; canais; sedes; gerir financeiro |

| **Financeiro** | Ver financeiro e relatórios; operar PDV do bar; DMs | Gerir financeiro e catálogo/estoque do bar; comunicados; salas/grupos |
| **Social e eventos** | Postar; DMs/grupos/salas | Criar/gerir eventos; comunicados; mural/moderação/notícias; ver financeiro/relatórios/pedidos |
| **Materiais / Loja** | DMs/grupos; postar; relatórios | Ver/gerir pedidos e catálogo; ver financeiro; comunicados; criar eventos; canais; salas; ver patrimônio |
| **Comunicação** | Postar; salas/grupos; DMs | Curar notícias; comunicados; mural/moderação/canais; post nacional; moderar msgs; eventos; relatórios; ver pedidos |
| **Patrimônio** | Ver patrimônio e relatórios; DMs/grupos | Gerir patrimônio; eventos; ver financeiro; comunicados; salas/canais |
| **Bateria** | Postar; grupos/salas; ver patrimônio | Criar/gerir eventos; canais/mural/notícias; comunicados; gerir patrimônio (instrumentos) |
| **Caravanas** | DMs/grupos/salas; postar; ver financeiro/relatórios | Criar/gerir eventos; canais/mural; comunicados; advertir |
| **Feminino** | Postar; DMs/grupos/salas | Eventos; notícias; mural/moderação/canais; comunicados; relatórios; advertir |
| **Carnaval** | Postar; salas/grupos; ver financeiro/patrimônio/relatórios | Eventos; mural/moderação/notícias; comunicados; canais; advertir |

**Princípio Fase 2:** colaborador **não** recebe permissões que abrem operação
`/admin` (`members:view`, `events:manage`, `store:*`, `news:curate`,
`finance:manage`, etc.), exceto:
- PDV do Bar (`bar:operate` no colaborador Financeiro);
- **`reports:view` → Dashboard + Relatórios** (demais áreas);
- **exceção Diretoria:** Membro · Diretoria é **oversight read-only** no admin
  (ver `docs/data/matriz-cargos-permissoes.md`) — vê módulos com `*:view` /
  `store:view_orders` / `events:view` / `community:view` / `sedes:view`, sem
  mutações (`*:manage`, approve, publish, moderate).

`finance:view` / `patrimony:view` no colaborador de outras áreas continuam
orientados ao **portal**; no admin só abrem com `*:manage` ou com oversight
(`view` + `audit:view`, típico da Diretoria).

**Presidência** (`settings:manage`, `roles:manage`, `torcida:global_view`,
`alliances:manage`, e `community:post_nacional` via cargo de sistema) entra via
`owner` / `vice` (Diretoria + GESTOR). `post_nacional` também no gestor de
Comunicação. Bar (`bar:*`) fica sob Financeiro — sem departamento canônico próprio.
Gestores de área operacional **não** levam `finance:manage` / `store:manage` /
`sedes:manage` fora da missão da área.

Após deploy em tenants existentes:

```bash
pnpm --filter @torcida/db seed:departamentos
pnpm --filter @torcida/db db:repair-system-roles
```

## Hierarquia territorial (worktree)

Onboarding e Sedes usam a **árvore de `Sede`** no mesmo tenant. A **Visão da torcida**
(`/admin/torcida`) consolida a worktree.

### Departamento no onboarding (preferência ≠ membership)

> Decisão fechada **2026-07-17** (`b0a5e3a`). Bug corrigido: onboarding antigo
> fazia `UserDepartamento.upsert` no cadastro — sócio **reprovado** aparecia na
> equipe (ex.: Comunicação).

No cadastro de **sócio**, o wizard pergunta o **departamento pretendido**. Isso
grava só `SaasMembro.departamentoId` (FK opcional, `onDelete: SetNull`). É
informativo para a fila em `/admin/membros` (coluna Departamento) e na home da
Diretoria. **Não** cria `UserDepartamento` nem perfil `Membro · {Área}` enquanto
o status for `PENDENTE` ou `REPROVADO`.

| Momento | O que acontece |
|--------|----------------|
| `solicitarVinculo` (SOCIO) | Valida depto do tenant → grava `SaasMembro.departamentoId`; status `PENDENTE` |
| Equipe `/portal/departamentos/[slug]` | Lista só sócio canônico, aprovado e ativo (filtro de leitura; sem write-on-GET) |
| `aprovarMembro(id)` | Role `member` + (default) perfil `Membro · área` + `syncMembershipFromRoles` + `invalidatePermissionsCache` |
| `aprovarMembro(id, { incluirDepartamento: false })` | Aprova vínculo **sem** entrar na equipe — botão **Sem área** no admin |
| `reprovarMembro` / `reverterMembro` | `limparMembershipDepartamentos` (roles de área + UD + gestores) |

### Área na sede × área na unidade (2026-07-30)

`Departamento` é **por tenant**. Quem entra por uma Subsede/PDE promovida a
tenant próprio (Caso B) ganha **duas** linhas de `SaasMembro` — a origem na
unidade e o espelho na Sede — e pode atuar em áreas (e papéis) diferentes em
cada nível: membro da bateria na sede, gestor da bateria na unidade.

| Campo | Onde vive | Significa |
|---|---|---|
| `SaasMembro.departamentoId` | Toda linha | Área pretendida **neste tenant**: na origem, a área na unidade; no espelho, a área na Sede |
| `SaasMembro.departamentoSedeId` | Só na origem em tenant-filho | Área pretendida **na Sede**, declarada no onboarding. Carrega a preferência até o espelho existir |

- O wizard só mostra os dois selects quando `exigeDepartamentoDaSede(sede.tenantId,
  torcida.id)` (`lib/onboarding-unidade.ts`) — unidade do mesmo tenant, ou a
  própria Sede, compartilha um único conjunto de áreas e mantém um select só.
- `solicitarVinculo` valida `departamentoId` contra `tenantDestino` e
  `departamentoSedeId` contra a **raiz** (`resolverTenantRaizId`); recusa
  `departamentoSedeId` quando o vínculo já nasce na raiz.
- `criarOuAtualizarPendenciaEspelhoNaSede` e `sincronizarSocioNaSedeRaiz` semeiam
  o `departamentoId` do espelho a partir de `departamentoSedeId`
  (`departamentoSedeParaEspelho`), **só quando o espelho ainda não tem área** —
  re-sincronização nunca reverte decisão já tomada pela Sede. O departamento da
  origem nunca é copiado: é id de outro tenant.
- Continua valendo preferência ≠ membership: nenhum `UserDepartamento` sai daqui.

### Quem aprova a área é o próprio nível (2026-07-30)

> Regra: **a Sede aprova sua hierarquia nos departamentos da Sede; a Subsede/PDE
> aprova a dela nos departamentos da unidade.** Ninguém monta a equipe do outro.

O **vínculo de sócio** segue first-wins na torcida — a solicitação feita numa
unidade cai nas duas filas e quem decidir primeiro encerra a análise nos dois
lados. A **área não acompanha**: o departamento pedido para a Sede só entra em
vigor quando a Sede decide, e o da unidade só quando a unidade decide.

| Quem aprova | Vínculo | Área que entra em vigor |
|---|---|---|
| Unidade (linha de origem) | APROVADO nos dois níveis | Só a da **unidade** (`departamentoId` da origem) |
| Sede (espelho, exceção R1) | APROVADO nos dois níveis | Só a da **Sede** (`departamentoId` do espelho, semeado de `departamentoSedeId`) |

O nível que **não** decidiu fica com a área pretendida pendente e a coloca em
vigor depois com **`efetivarAreaPretendida(membroId)`**
(`app/admin/membros/actions.ts`): `assertPermission(MEMBERS_APPROVE)` resolve no
tenant ativo e a query filtra por ele, então o isolamento é estrutural — não há
como efetivar área fora do próprio nível. É idempotente e grava `AuditLog`
(`MEMBRO_AREA_EFETIVADA`).

Na UI, `getAreasEfetivadasPorUser` (`lib/area-efetivada.ts`) distingue
**pretendida** de **em vigor** — lê `UserDepartamento` **e** os `Role` de área,
porque `aplicarDepartamentoPreferido` prefere o Role e só cai em
`UserDepartamento` quando a torcida não tem esse Role; checar um só daria falso
"pendente". Dois pontos de entrada:

| Onde | O quê |
|---|---|
| `/portal/departamentos/[slug]` → **Pedidos para esta área** (`DepartamentoFilaArea`) | Fila própria do fluxo: sócios já aprovados que pediram **esta** área e não entraram. Para gestor da área com `MEMBERS_APPROVE`, em qualquer painel — a decisão é do gestor da área, no portal do seu nível |
| `MemberActions` → **Incluir em {área}** | Fila de Membros e detalhe de Membros/Sócios; aparece inclusive sobre o espelho já aprovado — efetivar a área local não é mutação do espelho |

A fila de admissão (`DepartamentoFilaMembros`, sócios `PENDENTE`) é **outro**
fluxo e fica vazia depois do first-wins; sem a fila de área, o pedido do outro
nível ficaria invisível.

**Anti-padrão crítico (era um bug, corrigido em 2026-07-30):** `aprovarMembro`
chamado pela Sede aplicava `aplicarDepartamentoPreferido(origem.tenantId, …)` —
a Sede efetivava a área **dentro da unidade**, montando a equipe da Subsede/PDE
sem a diretoria dela decidir.

**Exibição já resolve sozinha.** `getBadgesPorAutorTenant`
(`lib/autor-badges.ts`) chaveia por `(autorId, tenantId-do-post)`, então o badge
de cargo/área de um post reflete o tenant onde ele nasceu — post no canal da
unidade mostra a hierarquia da unidade; na sede, a da sede. A cascata
`resolverDepartamentoBadge` (membership real → área do cargo → preferência) faz
o resto: enquanto a Sede não efetivar, aparece a preferência semeada no espelho;
depois de efetivar, o cargo real. Não existe (nem deve existir) regra de canal
separada para isso — publicar é sempre no tenant ativo
(`podePublicarNoCanal` corta `canal.tenantId !== viewerTenantId`), e trocar de
nível é o `TorcidaContextSwitcher`.

**Anti-padrões (não reintroduzir):**
- Efetivar área de um tenant a partir da decisão de outro (ver acima).
- Copiar `departamentoId` da origem para o espelho (id de outro tenant).
- Resolver badge de cargo/área pelo usuário em vez de por `(autor, tenant do post)`.
- Upsert de `UserDepartamento` / `UserRole` de área em `solicitarVinculo`.
- `deleteMany` de órfãos no GET da página de equipe (cura só via script ou nas actions).
- Aprovar na fila sem mostrar o departamento pretendido.

Órfãos legados (membership criada no cadastro antes da correção):

```bash
pnpm --filter @torcida/db db:repair-departamento-orfaos -- --dry-run
pnpm --filter @torcida/db db:repair-departamento-orfaos
```

Código: `onboarding/actions.ts`, `admin/membros/actions.ts`,
`components/admin/member-actions.tsx`.

## Hierarquia de governança

- **Presidente** — `owner` + Diretoria; console `/admin/torcida`
- **Vice** — só tenant SEDE, ≤2
- **Liderança** — `owner` de SUBSEDE/PDE

## Onde fica cada coisa

- Modelo: `Role { departamentoId, papelNoDepartamento, permissionsExtras }` +
  `Departamento { permissions, permissionsGestor }`
- Helpers: `permissionsOfRole`, `PAPEL_DEPARTAMENTO`, `nomePerfilDepartamento` em
  `packages/types/src/permissions.js`
- Bootstrap: `bootstrapAcessoTenant` / `syncMembershipFromRoles` em `@torcida/db`
- Admin: `/admin/acessos` — cargos, departamentos, pessoas
- Mural: `/admin/hierarquia`

## Menu admin e segregação

O sidebar de `/admin` filtra por **permissão efetiva** (`filterMenuByPermissions`),
agrupada em seções alinhadas a `DEPARTAMENTO_MODULOS` (`ADMIN_MENU_SECOES`).

- Departamento **não** esconde itens por id: quem recebe a permissão (pacote, extra
  ou override) vê o módulo correspondente.
- Ex.: **Membro · Financeiro** (só `finance:view` + `reports:view`) vê Dashboard +
  Financeiro — não vê Pessoas, Loja, Comunidade nem Governança.
- Para abrir Pedidos ou Membros, atribua o perfil da área (Materiais / Diretoria) ou
  uma permissão adicional explícita.

Visão-alvo portal × admin (membros no portal, gestores com painel + operação):
ver `docs/data/proposta-departamentos-portal-admin.md`.

**Hub `/portal/departamentos`:** menu único de áreas. Membro vê só onde atua;
membro da **Diretoria** vê todas as áreas (somente leitura da home), e **Gestão**
só onde é `DepartamentoGestor` (ou permissão equivalente). Operação admin fica
no painel do domínio da área. Mensalidades, caravanas, bateria e financeiro
**não** ficam na topbar — abrem por este hub.

**Diretoria (gestor):** a home `/portal/departamentos/diretoria` lista solicitações
`PENDENTE` e permite aprovar/reprovar ali (mesmas Server Actions de `/admin/membros`).
Também exibe KPIs leves (pendentes, ativos, reprovados, carteirinhas).

**Thin wrappers** (`portalPanel: generico` / `kind: thin`): Feminino, Carnaval, Social e eventos,
Materiais/Loja e Comunicação não ganham app próprio — copy + CTA para o módulo
portal (`departamento-thin.js`) e widgets compostos (agenda, comunicados, pedidos).

**Fase 5 — Cockpit:** cada home de área tem missão (registry), nav de subáreas por
âncora, próxima ação só com urgência real e painel de domínio acima da equipe no
mobile. Detalhe: `proposta-departamentos-portal-admin.md` § Fase 5.

**Onda 4 (MVP):** canal da área (auto-provisionado + sync de roster), vaga paga em caravana
(`valorVaga` + cobrança AVULSA), checklist barracão no Carnaval (`Departamento.meta`).

## Áreas de atuação dentro do departamento (2026-08-03)

Departamento era lista plana: quem estava no Social estava em "tudo do Social".
Na prática não é assim — quem faz a Campanha do Agasalho normalmente não faz a
Escolinha da Bateria nem a Inclusão Digital. As **áreas de atuação** modelam
essas frentes.

### Modelo

- `DepartamentoArea` (`saas_departamento_areas`) — `tenantId`, `departamentoId`,
  `nome`, `slug`, `descricao`, `icone` (chave string), `ordem`, `ativa`,
  `sazonal`, `meta Json?`. Unique `(departamentoId, slug)`.
- `DepartamentoAreaMembro` (`saas_departamento_area_membros`) — `areaId`,
  `userId`, `papel: PapelAreaDepartamento (MEMBRO | RESPONSAVEL)`. Unique
  `(areaId, userId)`.

### Invariante central: **área não concede permissão**

RBAC continua inteiramente em `Departamento.permissions` /
`permissionsGestor`. Nenhum ponto de `permissionsOfRole` ou
`fetchUserPermissionsImpl` (`apps/web/src/lib/tenant.ts`) lê área.
`papel = RESPONSAVEL` é **accountability e filtro**, não delegação: quem gere
área é `canManageDepartamento` (gestor do departamento ou `roles:manage`
real no tenant), exatamente como `assertPodeGerirArea` em
`portal/departamentos/actions.ts`. Super-admin em modo operador **vê** todos
os departamentos da unidade selecionada (hub + cockpit + admin), mas **não**
gerencia — o bypass da plataforma não concede `podeGerir` / `isGestor`
(dual-hat com cargo real na torcida continua valendo pelo RBAC). A regra pura
vive em `apps/web/src/lib/departamentos-portal-access.ts`
(`resolverAreasDepartamento` — `podeGerir` nunca deriva de `isResponsavel`
nem de SA), travada por teste.

### Elegibilidade e cascata

Só entra em área quem já tem membership em vigor no departamento pai e continua
elegível como sócio (`isMembroElegivelDepartamento`). Sair do departamento
derruba as áreas dele: `limparMembershipDepartamentos`
(`admin/membros/actions.ts`) e `removerMembroDepartamento`
(`admin/(plataforma)/acessos/actions.ts`) apagam
`DepartamentoAreaMembro` no escopo correto. Arquivar área é `ativa: false`
(soft) — nunca delete.

### Conhecimento canônico e seed

`packages/types/src/departamento-areas-canonicas.js` guarda as áreas-padrão de
cada departamento canônico com descrição real do que a frente faz (Agasalho,
Festa das Crianças, Inclusão Digital, Escolinha da Bateria, Corrida de Rua,
Barracão, Escala de jogo…). Semeadas por
`pnpm --filter @torcida/db seed:departamento-areas` — idempotente por
`(departamentoId, slug)`; no update toca apenas `descricao`, `icone`, `ordem`
e `sazonal`, **nunca** `ativa`, `nome` ou `meta` (a torcida pode ter
renomeado/desativado). É semente, não trava: a torcida cria as próprias áreas.

### Superfícies

- **Portal** — `/portal/departamentos/[slug]`: o gate e as flags saem de um
  loader único `getDepartamentoContexto` (`[slug]/_lib/contexto.ts`), no mesmo
  padrão de `configuracoes/_lib/contexto.ts`. Blocos que a pessoa não pode
  gerir aparecem **`blocked` com motivo** (`DepartamentoSectionCard`), não
  somem — descoberta acima de invisibilidade. Bloco `#areas` e `#equipe`
  segmentada por área.
- **Hub** — o card mostra missão, chips das áreas em que a pessoa atua e um KPI
  contextual, cada um gateado pela permissão correspondente.
- **Admin** — módulo `/admin/departamentos` (tabs Visão / Áreas / Equipes),
  gate `roles:manage`. O pacote de permissão segue em `/admin/acessos` e **não**
  vira tab daqui — tab é etapa do próprio módulo (§5.12); o caminho para lá é um
  link na Visão, travado por `admin-modulos.test.ts`. Gestor de departamento
  **não** ganha rota
  admin nova: ele opera pelo cockpit do portal (mantém o item 7 das decisões).
  Listagens declaradas em `lib/listagem/specs.ts`
  (`LISTAGEM_DEPARTAMENTO_AREAS`, `LISTAGEM_DEPARTAMENTO_EQUIPES`).

### Checklist por frente (`area.meta`, 2026-08-03+)

Mesmo espírito do barracão Carnaval (`Departamento.meta`), sem tabela nova e
sem ERP: `DepartamentoArea.meta.checklist.items` é um array
`{ id, label, done }` (máx. 30). O gestor adiciona/remove/marca no card da
área; quem só participa vê o progresso. Modelos sugeridos por slug
(`AREA_CHECKLIST_MODELOS` em `departamento-area-checklist.js`) só
**acrescentam** itens faltantes (“Usar modelo”) — nunca apagam customizações.
O seed de áreas continua sem tocar `meta`. Actions:
`toggleChecklistItemArea` / `adicionarChecklistItemArea` /
`removerChecklistItemArea` / `aplicarModeloChecklistArea`.

### Canal por frente (2026-08-04)

Espelha o canal do departamento (`Departamento.canalConversaId`): ponteiro
`DepartamentoArea.canalConversaId` → `Conversa` tipo `CANAL`, deep-link
`/portal/mensagens?c=`. **Provisionado automaticamente** no bootstrap do portal
(`bootstrapAcessoTenant` / `ensureCanaisDepartamentosTenant`), no seed de áreas
e ao criar departamento/área na UI. Repair em tenants existentes:

```bash
pnpm --filter @torcida/db db:repair-canais-departamentos
```

Roster (sync contínuo via `syncMembershipFromRoles` e mutações de área):

| Canal | MEMBRO | ADMIN |
|---|---|---|
| Departamento | `UserDepartamento` | `DepartamentoGestor` |
| Área | `DepartamentoAreaMembro` | Gestores do departamento pai |

Segregação: `publica: false`, fora da vitrine da Comunidade (`listCanaisVisiveis`
só devolve se o viewer for `MembroConversa` ATIVO). Vínculo manual
(`vincularCanalDepartamentoArea`) continua válido; uma conversa não pode ser
sede + departamento + área ao mesmo tempo (`validarVinculoCanalArea`).

### Anti-padrões (novos)

- **Dar permissão ao responsável de área.** Se aparecer a necessidade, a
  resposta é tornar a pessoa gestora do departamento — não vazar RBAC para a
  área.
- Confundir `subareas` do registry de capabilities (âncoras de navegação da
  tela) com `DepartamentoArea` (organização de gente). São coisas diferentes e
  não devem ser fundidas.
- Sobrescrever `ativa`/`nome`/`meta` no seed de áreas.
- Transformar a checklist em task-tracker/ERP (assignees, prazos, subtarefas).
- Expor canal de depto/área na lista pública de canais da Comunidade.
## Projetos e campanhas (2026-08-03)

O que a área organiza (gente) ganhou o par: o que ela **executa**. `Projeto` é
o objeto de trabalho transversal do departamento — Campanha do Agasalho, Festa
das Crianças, Inclusão Digital, Escolinha da Bateria, Corrida de Rua,
Barracão. Serve Social, Bateria, Carnaval, Caravanas e Patrimônio igualmente:
não é feature do Social.

### Modelo

- `Projeto` (`saas_projetos`) — `tenantId`, `departamentoId`, `areaId?`,
  `titulo`, `slug`, `descricao`, `tipo: TipoProjeto`, `status: StatusProjeto`,
  `inicio`, `fim?`, `recorrenteAnual`, `metaQuantidade?`, `metaUnidade?`,
  `realizadoQuantidade`, `orcamentoPrevisto?`, `responsavelId?`.
  Unique `(departamentoId, slug)`.
- `ProjetoParticipante` (`saas_projeto_participantes`) — voluntários do
  projeto, unique `(projetoId, userId)`.
- `TipoProjeto`: `CAMPANHA | PROJETO | ACAO | PARCERIA`.
  `StatusProjeto`: `PLANEJADO | ATIVO | CONCLUIDO | CANCELADO`.
- `Evento.projetoId?` — a Festa das Crianças de 2026 na Agenda aponta para o
  projeto homônimo.
- `FinanceiroLancamento.departamentoId?` e `.projetoId?` — ambos nullable, sem
  migração de dado legado.

### Decisões que sustentam o módulo

- **Projeto não concede permissão**, como a área. `responsavelId` e
  participantes são accountability; quem gere é `canManageDepartamento`
  (`projetos-actions.ts` → `assertPodeGerirDepartamento`).
- **Realizado financeiro não é digitado.** `orcamentoPrevisto` é declarado, mas
  o gasto vem da soma das `DESPESA` vinculadas ao projeto (`groupBy` no
  cockpit). Campo de "quanto gastei" digitado à mão vira número que ninguém
  confia — o livro-caixa é a fonte.
- **`metaQuantidade` sem meta devolve `null`, não 0%.** `progressoMeta` e
  `saudeOrcamento` (`packages/types/src/projeto.js`) retornam `null` quando não
  há meta/orçamento declarado: 0% leria como fracasso, e gastar sem orçamento
  declarado é ausência de plano, não estouro. Travado em `projeto.test.ts`.
- **Campanha recorrente compara dia/mês.** `estaNaJanela` trata
  `recorrenteAnual` comparando só dia e mês — o registro do Agasalho de 2025
  marca "na janela" em 2026 sem duplicar linha —, e cobre janela que vira o ano
  (Natal 15/11 → 10/01).
- **Rateio valida escopo no servidor.** `resolverRateio`
  (`admin/financeiro/actions.ts`) confere que o departamento é do tenant e que
  o projeto pertence àquele departamento; projeto sem departamento explícito
  herda o do próprio projeto. Sem isso daria para pendurar gasto no
  departamento de outra torcida via id forjado.

### Superfícies

Portal: bloco `#projetos` no cockpit, com filtro por área, barra de meta, barra
de orçamento (vermelha no estouro), badge "Na janela" e **eventos da Agenda
vinculados** (deep-link). **Abrir campanha do ano** (2026-08-03+): em área
`sazonal` ativa, o gestor cria com um clique um `Projeto` `CAMPANHA` do ano
corrente (`slug` = `{área}-{ano}`, janela 1º jan–31 dez, `recorrenteAnual`,
status `ATIVO`/`PLANEJADO`) — sem auto-criar evento; idempotente. CTA no
bloco `#areas` e atalho em `#projetos`. A **próxima ação** do cockpit prioriza,
após filas: orçamento estourado → projeto na janela → área sazonal sem
campanha do ano → hooks de plugin (ensaio/caravana/financeiro).

Admin: tab **Projetos** em `/admin/departamentos`
(`LISTAGEM_DEPARTAMENTO_PROJETOS`), leitura consolidada — cadastro é do gestor,
no portal. Financeiro: seletores de departamento e projeto no formulário de
lançamento, só para quem tem `finance:manage`. Agenda: seletor de projeto no
criar/editar evento (`Evento.projetoId`).

### Plugins do dia a dia (2026-08-03+)

- **Bateria — escala de jogo:** aside `#escala` lista eventos futuros ligados ao
  projeto da área `escala-de-jogo` ou a uma `partidaId` (RSVP/presença da
  Agenda — sem lista paralela).
- **Social — nudge de rateio:** com projetos abertos, o gestor vê lembrete de
  vincular despesas no livro-caixa (`#rateio`); conta despesas do depto sem
  `projetoId` (90 dias).
- **Thin + agenda por projeto:** Social e Feminino priorizam eventos com
  `Evento.projetoId` do departamento; fallback é a agenda GERAL. Loja aponta
  pedidos para `/portal/loja/pedidos` (não admin).

## Decisões fechadas

1. Perfil de área **vincula** departamento (membro/gestor); pacote é ao vivo.
2. Atribuir perfil sincroniza membership (projeção).
3. Torcedor/Sócio **não** são departamento.
4. Overrides pontuais na pessoa são exceção; caminho feliz = novo perfil composto.
5. `member` permanece transversal (sem departamento).
6. **Preferência de onboarding ≠ membership** (2026-07-17): `SaasMembro.departamentoId`
   é intenção até `APROVADO`; equipe e RBAC de área só depois de `aprovarMembro`
   (ou inclusão manual em Acessos / portal). Ver seção acima.
7. **`reports:view` abre a área admin** (2026-07-22): com a página
   `/admin/relatorios`, colaborador de área canônica que tem `reports:view` no
   pacote passa a acessar a área admin com no máximo **Dashboard + Relatórios
   (leitura)** — nunca itens de operação (invariante testado em
   `rbac.test.ts`), **exceto Diretoria** (item 8).
8. **Membro · Diretoria = visão admin read-only** (2026-08-02): pacote colaborador
   da Diretoria inclui `members:view`, `finance:view`, `patrimony:view`,
   `store:view_orders`, `events:view`, `community:view`, `sedes:view`,
   `audit:view` (+ `reports:view`). Menu e GET dos módulos aceitam essas views;
   mutações seguem `*:manage` / approve / publish. Matriz completa:
   `docs/data/matriz-cargos-permissoes.md`. Demais áreas colaboradoras
   permanecem na regra do item 7.
9. **Área de atuação é organização, não RBAC** (2026-08-03): `DepartamentoArea`
   segmenta gente e trabalho dentro do departamento; permissão continua no
   departamento e `RESPONSAVEL` é accountability. Ver seção acima.
