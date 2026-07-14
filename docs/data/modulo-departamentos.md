# Módulo — Departamentos como unidade de acesso

> Como uma torcida organiza acesso por departamentos (Financeiro, Social, Batucada,
> Caravanas, Comunicação, Feminino, Carnaval, Patrimônio, Diretoria...). Complementa
> `docs/knowledge/estrutura-governanca.md` (o vocabulário real) com a mecânica de RBAC.

## Conceito

O **Departamento deixou de ser só rótulo** e passou a **conceder acesso**. Ele carrega
uma lista de permissões (`Departamento.permissions[]`) do mesmo vocabulário canônico dos
cargos (`packages/types/src/permissions.js`). Departamento tem **membros**
(`UserDepartamento`) e **gestores/responsáveis** (`DepartamentoGestor`):

- **Membro** recebe as permissões do departamento e vê o fluxo pelo **portal**.
- **Gestor/responsável** administra a área pelo **admin** (além de membro).

## Hierarquia de governança (Presidente × Liderança × Vice)

RBAC é **por tenant**, e a árvore de Sede (`Sede.tipo` ∈ `SEDE|SUBSEDE|PONTO_ENCONTRO`
+ `sedeId`) encadeia os tenants da torcida. A autoridade máxima de cada tenant continua
sendo o cargo de sistema `owner` (mantido interno para não quebrar checagens owner-only);
o que muda é o **rótulo e o alcance**, derivados do tipo da Sede:

- **Presidente** — `owner` do tenant cuja Sede é `tipo: SEDE` (a raiz da torcida). Um por
  torcida. Administra a Sede **e** tem o **console global de leitura** de toda a árvore.
- **Liderança** — `owner` de um tenant `SUBSEDE`/`PONTO_ENCONTRO` (PDE). Administra **só a
  própria unidade** (isolamento natural do RBAC per-tenant). Sem console global. No portal,
  "lideranças" no plural = a Liderança principal + os responsáveis de departamento da unidade.
- **Vice-presidente** — cargo de sistema `vice` (visão global, tudo menos `SETTINGS_MANAGE`),
  **só existe no tenant SEDE**, no **máximo 2** (`MAX_VICE_PRESIDENTES`). Provisionamento e
  atribuição bloqueados fora da Sede (`salvarAcessoUsuario`, setup/repair, promoção de subsede).
- **Reporte**: Liderança → Presidente é a cadeia de ancestrais do Sede tree
  (`getAncestorTenantIds`); todos → Departamentos é `DepartamentoGestor` + permissões do depto.

Helpers em @torcida/types: `rotuloCargoMaximo(tipoSede)`, `podeTerVice(tipoSede)`,
`rotuloCargoSistema(nome, tipoSede)`. Rótulos exibidos em `/admin/configuracoes` e
`/admin/acessos` conforme o `Sede.tipo` do tenant.

### Console global do Presidente (`/admin/torcida`)
Visão consolidada **read-only** de toda a torcida (Sede + subsedes/PDEs): totais de afiliados
e sócios e quebra por unidade. Gate `assertPresidenteGlobal` = `Sede.tipo === 'SEDE'` **e**
permissão `TORCIDA_GLOBAL_VIEW` (owner via `*`, e vice; **admin não tem**). Agrega a árvore via
`getDescendantTenantIds` (hierarquia.ts) + `groupBy` de `SaasMembro` aprovados. O item some do
menu em tenants não-SEDE. A gestão operacional de cada unidade permanece com sua Liderança.

## Permissões efetivas

Fórmula única, aplicada em todo o app:

```
efetivas(user) = ∪ perfis.permissions  ∪  departamentosDoUsuario.permissions  ±  overrides
```

A união de departamentos é feita em `fetchUserPermissionsImpl` (`apps/web/src/lib/tenant.ts`):
as permissões dos departamentos entram na chave `rolePermissions` retornada, então
`calculateEffectivePermissions(rolePermissions, overrides)` **não mudou de assinatura** e
todos os call-sites (authz, menu, layout) passaram a considerar departamento sem alteração.
Alterar/excluir um departamento invalida o cache de permissões de todos os seus membros.

## Padrão de permissão (herdado do vocabulário existente)

`AREA-AÇÃO` conceitual: `-PAG`/view = base do grupo (ver a tela), `-ADD` criar,
`-UPT` editar, `-DEL` excluir. A base do grupo (`PERMISSION_GROUPS[].base`) e a
cascata (`applyPermissionCascade`) garantem que nenhuma ação exista sem o "ver"
correspondente — mesma regra do sistema de referência (SCM). No portal, botões de
ação aparecem conforme a permissão do departamento (`-ADD/-UPT/-DEL`).

## Onde fica cada coisa

- **Modelo**: `Departamento { permissions[], slug, moduloPortal }`, `UserDepartamento`,
  `DepartamentoGestor` — `packages/db/prisma/schema.prisma`. `@@unique([tenantId, slug])`.
- **Vocabulário/constantes**: `packages/types/src/permissions.js` — `PERMISSIONS`,
  `PERMISSION_GROUPS`, `SYSTEM_ROLES.VICE`, `MAX_VICE_PRESIDENTES`, `DEPARTAMENTO_MODULOS`,
  `DEPARTAMENTO_MODULO_ROTA`, `slugifyDepartamento`.
- **Admin — CRUD + permissões do departamento**: `/admin/configuracoes` →
  `DepartamentosManager` (`components/admin/config-forms.tsx`) + actions em
  `app/admin/configuracoes/actions.ts`. Reusa o seletor de permissões do `RoleForm`.
- **Admin — atribuir a usuários**: `/admin/acessos` (`AccessManager`) — mostra cobertura
  por departamento (não grava override redundante do que o depto já concede).
- **Admin — visibilidade cross-área**: menu filtrado por permissão
  (`ADMIN_MENU`/`filterMenuByPermissions`, `menu.js`) + guard de rota
  (`assertPermission → redirect('/admin')`) em cada página do módulo. Owner/Vice veem tudo;
  responsável vê só a sua área (porque o departamento alimenta as efetivas).
- **Portal — hub**: `/portal/departamentos` lista os departamentos do usuário e direciona
  ao **módulo existente** (`DEPARTAMENTO_MODULO_ROTA`), gated pela permissão; `financeiro`
  e `patrimonio` são stubs ("Em breve"). Gestor tem atalho "Administrar" → `/admin`.
- **Seed global**: `packages/db/scripts/seed-departamentos.js` (script `seed:departamentos`)
  — 10 departamentos canônicos com permissões/slug/módulo por tenant.

## Decisões fechadas

1. Departamento **carrega permissões** (não aponta para um único perfil) — coexiste com
   perfis (Role) para papéis transversais (Presidente, Vice, cargos customizados).
2. Torcedor/Sócio **não** são departamento: derivam de `SaasMembro.tipo` (fonte da verdade),
   evitando dado duplicado. A distinção de visão fica na camada de portal.
3. Portal é **hub que reusa módulos**, não reimplementa gestão. Ações gated por `-ADD/-UPT/-DEL`.
4. Visibilidade cross-área: **ocultar no menu + bloquear na rota**.
5. **Uma torcida = um Presidente** (owner do tenant SEDE). Subsedes/PDEs têm **Lideranças**
   (owner do próprio tenant), confinadas à sua unidade pelo RBAC per-tenant. `owner` mantido
   interno; a distinção é por rótulo (`Sede.tipo`) + alcance (só o Presidente tem `TORCIDA_GLOBAL_VIEW`).
6. **Vice-presidente só na Sede** (≤2). Presidente global é **leitura consolidada**, não
   admin cross-tenant — a autonomia operacional das lideranças é preservada.
