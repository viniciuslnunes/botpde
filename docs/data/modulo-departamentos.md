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
| **Diretoria** | Relatórios; ver financeiro/patrimônio; salas; DMs/grupos; postar | Ver/aprovar/reprovar/advertir/bloquear membros; auditoria; comunicados; eventos; mural/moderação/notícias; sedes; pedidos; gerir financeiro |
| **Financeiro** | Ver financeiro e relatórios; DMs | Gerir financeiro; comunicados; salas/grupos |
| **Social e eventos** | Postar; DMs/grupos/salas | Criar/gerir eventos; comunicados; mural/moderação/notícias; sedes; ver financeiro/relatórios/pedidos |
| **Materiais / Loja** | DMs/grupos; postar; relatórios | Ver/gerir pedidos e catálogo; ver financeiro; comunicados; criar eventos; canais; salas; ver patrimônio |
| **Comunicação** | Postar; salas/grupos; DMs | Curar notícias; comunicados; mural/moderação/canais; moderar msgs; eventos; relatórios; ver pedidos |
| **Patrimônio** | Ver patrimônio e relatórios; DMs/grupos | Gerir patrimônio e sedes; eventos; loja; ver financeiro; comunicados; salas/canais |
| **Bateria** | Postar; grupos/salas; ver patrimônio | Criar/gerir eventos; canais/mural/notícias; comunicados; gerir patrimônio e sedes; ver pedidos |
| **Caravanas** | DMs/grupos/salas; postar; ver financeiro/relatórios | Criar/gerir eventos; canais/mural; comunicados; gerir loja e financeiro; sedes; advertir |
| **Feminino** | Postar; DMs/grupos/salas | Eventos; notícias; mural/moderação/canais; comunicados; sedes; relatórios; advertir; ver pedidos |
| **Carnaval** | Postar; salas/grupos; ver financeiro/patrimônio/relatórios | Eventos; mural/loja/financeiro/patrimônio/sedes; canais; moderação; notícias; comunicados; advertir |

**Princípio Fase 2:** colaborador **não** recebe permissões que abrem o menu `/admin`
(`members:view`, `events:manage`, `store:*`, `news:curate`, `finance:manage`, etc.).
`finance:view` / `patrimony:view` / `events:create` ficam no portal ou no pacote gestor;
itens admin de Financeiro/Patrimônio/Eventos exigem `*:manage`.

**Presidência** (`settings:manage`, `roles:manage`, `torcida:global_view`, `alliances:manage`)
entra via extras de `owner` / `vice` (Diretoria + GESTOR), não no pacote base da área.

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

**Anti-padrões (não reintroduzir):**
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

**Onda 4 (MVP):** canal da área (vínculo a `Conversa` CANAL), vaga paga em caravana
(`valorVaga` + cobrança AVULSA), checklist barracão no Carnaval (`Departamento.meta`).

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
   `rbac.test.ts`). Para restringir a gestores, remover `reports:view` dos
   pacotes colaborador no seed.
