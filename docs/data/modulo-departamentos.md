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

**Diretoria (gestor):** a home `/portal/departamentos/diretoria` lista solicitações
`PENDENTE` e permite aprovar/reprovar ali (mesmas Server Actions de `/admin/membros`).
Também exibe KPIs leves (pendentes, ativos, reprovados, carteirinhas).

**Thin wrappers** (`portalPanel: generico`): Feminino, Carnaval, Social e eventos,
Materiais/Loja e Comunicação não ganham app próprio — copy + CTA para o módulo
portal (`departamento-thin.js`) e, em Social/Carnaval, prévia de próximos eventos.

## Decisões fechadas

1. Perfil de área **vincula** departamento (membro/gestor); pacote é ao vivo.
2. Atribuir perfil sincroniza membership (projeção).
3. Torcedor/Sócio **não** são departamento.
4. Overrides pontuais na pessoa são exceção; caminho feliz = novo perfil composto.
5. `member` permanece transversal (sem departamento).
