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

| Departamento | Colaborador | Gestor+ |
|---|---|---|
| **Diretoria** | Ver membros, relatórios, financeiro e patrimônio; criar eventos; salas; DMs/grupos; postar; curar notícias; ver pedidos | Aprovar/reprovar/advertir/bloquear; comunicados; gerir eventos/mural/canais; sedes; gerir financeiro |
| **Financeiro** | Ver financeiro, relatórios, membros e pedidos; DMs | Gerir financeiro; importar base; gerir loja; comunicados; salas/grupos |
| **Social e eventos** | Criar eventos; postar; DMs/grupos/salas; ver membros e pedidos; curar | Gerir eventos/mural/moderação/canais; comunicados; sedes; ver financeiro e relatórios |
| **Materiais / Loja** | Ver pedidos; DMs/grupos; postar; relatórios; ver membros | Gerir produtos; ver financeiro; comunicados; criar eventos; canais; salas; ver patrimônio |
| **Comunicação** | Postar; curar notícias; salas/grupos; criar eventos; DMs; ver membros | Comunicados; mural/moderação/canais; moderar msgs; gerir eventos; relatórios; ver pedidos |
| **Patrimônio** | Ver patrimônio e relatórios; DMs/grupos; criar eventos; ver pedidos/membros | Gerir patrimônio e sedes; gerir eventos/loja; ver financeiro; comunicados; salas/canais |
| **Bateria** | Criar ensaios; postar; grupos/salas; ver membros e patrimônio; curar | Gerir eventos/canais/mural; comunicados; gerir patrimônio e sedes; ver pedidos |
| **Caravanas** | Criar viagens; ver membros/pedidos/financeiro/relatórios; DMs/grupos/salas; postar | Gerir eventos/canais/mural; comunicados; gerir loja e financeiro; sedes; advertir |
| **Feminino** | Postar; criar eventos; DMs/grupos/salas; ver membros; curar; ver pedidos | Gerir eventos/mural/moderação/canais; comunicados; moderar msgs; sedes; relatórios; advertir |
| **Carnaval** | Eventos + comunidade + pedidos + ver financeiro/patrimônio/relatórios/membros; salas/grupos; curar | Gerir eventos/mural/loja/financeiro/patrimônio/sedes; canais; moderação; comunicados; advertir |

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

## Decisões fechadas

1. Perfil de área **vincula** departamento (membro/gestor); pacote é ao vivo.
2. Atribuir perfil sincroniza membership (projeção).
3. Torcedor/Sócio **não** são departamento.
4. Overrides pontuais na pessoa são exceção; caminho feliz = novo perfil composto.
5. `member` permanece transversal (sem departamento).
