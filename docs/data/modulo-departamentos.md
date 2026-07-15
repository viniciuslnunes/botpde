# Módulo — Departamentos como unidade de acesso

> Como uma torcida organiza acesso por departamentos (Financeiro, Social, Batucada,
> Caravanas, Comunicação, Feminino, Carnaval, Patrimônio, Diretoria...). Complementa
> `docs/knowledge/estrutura-governanca.md` (o vocabulário real) com a mecânica de RBAC.

## Fluxo recomendado: templates → atribuição

Há **três seções** no mesmo painel `/admin/acessos` (sem vínculo FK entre cargo e departamento):

| Seção | Função |
|------|--------|
| **Cargos** (`?secao=cargos`) | CRUD de papéis transversais (Presidente, Recrutador…) |
| **Departamentos** (`?secao=departamentos`) | CRUD de áreas com colaborador e gestor |
| **Pessoas** (`?secao=pessoas`) | Atribuição de cargos e departamentos a cada usuário |

Ordem sugerida:

1. Em **Cargos** / **Departamentos**, revise ou ajuste os templates. Novos tenants
   já nascem com roles de sistema + 10 departamentos canônicos.
2. Em **Pessoas**, quando houver membros, atribua cargo(s) e departamento(s)
   (membro e/ou gestor da área).

**Não** existe tabela `Role ↔ Departamento`. Os eixos **somam no usuário**:
efetivas = ∪ perfis ∪ permissões dos deptos onde é membro/gestor ± overrides.
Ganhar um cargo não coloca automaticamente a pessoa num departamento.

### Colaborador vs gestor

| Papel | Como entra | O que recebe |
|-------|------------|--------------|
| **Colaborador** (membro do depto) | `UserDepartamento` | `Departamento.permissions` |
| **Gestor** | `DepartamentoGestor` (+ também membro) | `permissions` + `permissionsGestor` + staffing da área |

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
  `DEPARTAMENTO_MODULO_ADMIN_ROTA`, `isDepartamentoCanonico`
- Admin CRUD (templates): `/admin/acessos?secao=cargos` e `?secao=departamentos`
- Admin atribuição: `/admin/acessos?secao=pessoas` — estados **Membro** / **Gestor** + origem na matriz
- Staffing do gestor: `adicionarMembroDepartamento` / `removerMembroDepartamento`
- Portal hub: `/portal/departamentos` — Abrir módulo / Só organização / Administrar→rota admin
- Bootstrap: setup de tenant + `seed.js` + scripts de provisionamento chamam
  `upsertDepartamentosCanonicos`; legado: `pnpm --filter @torcida/db seed:departamentos`

## Decisões fechadas

1. Departamento carrega permissões (membro vs gestor em listas distintas).
2. Torcedor/Sócio **não** são departamento.
3. Portal é hub que reusa módulos.
4. Visão da torcida = worktree de Sede (Caso A) + Tenants filhos (Caso B).
5. Uma torcida = um Presidente; Vice só na Sede.
6. Diretoria/Patrimônio podem ter `permissions: []` (organizacional / stub).
7. Sem FK perfil↔departamento — templates e atribuição ficam em Controle de acesso (3 seções).

## Planejado (ainda não implementado)

**Acesso do Presidente às afiliadas** — a worktree já descreve o relacionamento
Sede → Subsede → PDE. Em etapa futura, o Presidente (e eventualmente o Vice)
poderá navegar a partir dessa árvore e **acessar cada afiliada** para:

- ver afiliados/membros e sócios da unidade;
- consultar relatórios consolidados e por unidade;
- acompanhar financeiro (quando o módulo existir);
- abrir a visão operacional da unidade sem perder o contexto da Presidência.

Escopo e UX (drill-down na worktree vs. seletor de torcida vs. leitura
cross-tenant) ficam a definir na implementação; por hora o relacionamento
hierárquico na Visão da torcida já está correto.
