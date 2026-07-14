# Módulo — Departamentos como unidade de acesso

> Como uma torcida organiza acesso por departamentos (Financeiro, Social, Batucada,
> Caravanas, Comunicação, Feminino, Carnaval, Patrimônio, Diretoria...). Complementa
> `docs/knowledge/estrutura-governanca.md` (o vocabulário real) com a mecânica de RBAC.

## Conceito

O **Departamento** concede acesso. Carrega duas listas do vocabulário canônico
(`packages/types/src/permissions.js`):

| Campo | Quem recebe | Papel |
|-------|-------------|--------|
| `permissions[]` | **Membro** (`UserDepartamento`) | Ver / agir leve (equipe) |
| `permissionsGestor[]` | **Gestor** (`DepartamentoGestor`, também membro) | Gerir a área (a mais) + staffing |

```
efetivas = ∪ perfis  ∪  (membro ? dept.permissions : [])
                     ∪  (gestor ? dept.permissionsGestor : [])
                     ±  overrides
```

## Hierarquia territorial (worktree)

Onboarding e Sedes usam a **árvore de `Sede`** no mesmo tenant (`sedeId` +
`tipo` ∈ SEDE|SUBSEDE|PONTO_ENCONTRO). A **Visão da torcida** (`/admin/torcida`)
consolida essa worktree (KPIs por `SaasMembro.sedeId`) e, quando existirem,
Tenants filhos promovidos (Caso B) aninhados sob a raiz.

Promoção Subsede→Tenant continua script manual
(`promover-subsede-para-tenant.js`) — a worktree visual **não depende** dela.

## Hierarquia de governança (Presidente × Liderança × Vice)

- **Presidente** — `owner` do tenant cuja Sede é `tipo: SEDE`. Console global
  read-only `/admin/torcida` (`TORCIDA_GLOBAL_VIEW` + tipo SEDE explícito).
- **Liderança** — `owner` de tenant SUBSEDE/PDE (quando promovido). Sem console global.
- **Vice** — só no tenant SEDE, ≤2 (`MAX_VICE_PRESIDENTES`).

## Onde fica cada coisa

- Modelo: `Departamento { permissions, permissionsGestor, slug, moduloPortal }`
- Vocabulário: `permissions.js` — `canManageDepartamento`, `DEPARTAMENTO_MODULO_ROTA`,
  `DEPARTAMENTO_MODULO_ADMIN_ROTA`
- Admin CRUD: `/admin/configuracoes` → `DepartamentosManager`
- Admin atribuição: `/admin/acessos` — estados **Membro** / **Gestor** + origem na matriz
- Staffing do gestor: `adicionarMembroDepartamento` / `removerMembroDepartamento`
- Portal hub: `/portal/departamentos` — Abrir módulo / Só organização / Administrar→rota admin
- Seed: `pnpm --filter @torcida/db seed:departamentos` (remove legado socio/torcedor)

## Decisões fechadas

1. Departamento carrega permissões (membro vs gestor em listas distintas).
2. Torcedor/Sócio **não** são departamento.
3. Portal é hub que reusa módulos.
4. Visão da torcida = worktree de Sede (Caso A) + Tenants filhos (Caso B).
5. Uma torcida = um Presidente; Vice só na Sede.
6. Diretoria/Patrimônio podem ter `permissions: []` (organizacional / stub).
