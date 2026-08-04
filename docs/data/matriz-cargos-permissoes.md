# Matriz de cargos e permissões

> Fonte de produto para o peso administrativo de cada cargo/perfil.
> Seed vivo: `packages/db/src/departamentos-canonicos.js`.
> Catálogo: `packages/types/src/permissions.js`. Menu: `packages/types/src/menu.js`.
> Complementa `modulo-departamentos.md`.

## 1. Cargos de sistema

Pacote **ao vivo** via `SYSTEM_ROLE_PERMISSIONS` (não depende do array gravado no `Role`).

| Cargo | Papel | Pacote |
|-------|-------|--------|
| **owner** (Presidente / Liderança em PDE) | Governança plena do tenant | `ALL_PERMISSIONS` |
| **vice** | Quase owner | Tudo exceto `settings:manage` e `members:purge` (mantém `torcida:global_view` + `affiliation:manage`) |
| **admin** | Operação ampla | Tudo exceto `settings:manage`, `torcida:global_view`, `affiliation:manage`, `members:purge` |
| **member** | Sócio padrão | `community:post`, `messages:send`, `groups:create` |

Rótulo na UI: `rotuloCargoSistema` — `member` aparece como **"Sócio"** (2026-08-03).
"Membro" é reservado a quem compõe departamento: perfis de área (`Membro · {Área}`),
`PAPEL_DEPARTAMENTO.MEMBRO` e o badge do feed (`rotuloCargoBadge` com área resolvida).

Bootstrap liga owner/admin/vice à **Diretoria** como GESTOR, mas o pacote efetivo é o de sistema.

**Caso B:** `owner` no tenant-filho = **Liderança da unidade** — opera o `/admin` local. Espelho na Sede costuma ser `member` (sem admin na Sede).

## 2. Classificação de permissões

| Classe | Exemplos | Superfície |
|--------|----------|------------|
| **view** | `*:view`, `store:view_orders`, `audit:view`, `reports:view` | Leitura portal e/ou admin |
| **operate** | `bar:operate`, `meetings:host`, `community:post`, DMs/grupos | Dia a dia sem gerir módulo |
| **mutate** | `*:manage`, `members:approve|…`, `announcements:publish`, `community:moderate`, `news:curate`, `events:create` | Operação admin / decisão |
| **governanca** | `settings:manage`, `roles:manage`, `torcida:global_view`, `alliances:manage`, `affiliation:manage`, `members:purge` | Presidência |

## 3. Áreas canônicas — MEMBRO vs GESTOR

GESTOR efetivo = `permissions ∪ permissionsGestor` (delta no banco após cascata).

### Diretoria (exceção de oversight)

| | Membro · Diretoria | Gestor · Diretoria |
|--|--------------------|--------------------|
| **Classe** | view + operate leve | + mutate transversal da unidade |
| **Admin** | Dashboard, Relatórios, Auditoria, Membros/Sócios (lista), Agenda, Loja (pedidos), Comunidade, Financeiro, Patrimônio, Estrutura (unidades) — **somente leitura** | + aprovar/reprovar/… membros, LGE, comunicados, eventos, mural/moderação/notícias, sedes, financeiro manage |
| **Não pode (membro)** | Aprovar/reprovar/desligar; criar/editar evento; publicar comunicado; moderar; gerir sedes; lançar caixa; catálogo loja; acessos; alianças; settings | — |

Perms membro: `reports:view`, `audit:view`, `members:view`, `finance:view`, `patrimony:view`, `store:view_orders`, `events:view`, `community:view`, `sedes:view`, + `meetings:host` / DMs / grupos / `community:post`.

### Demais áreas (Fase 2 intacta)

Colaborador **não** abre operação admin além de Relatórios (se tiver
`reports:view`) e PDV (`bar:operate` no Financeiro). `finance:view` /
`patrimony:view` sozinhos ficam no **portal**; no admin só abrem com
`*:manage` ou oversight (`view` + `audit:view`, pacote Diretoria).
Detalhe por área: matriz em `modulo-departamentos.md` § Matriz canônica.

## 4. Menu admin — gate × GET

| Item | Permissão(ões) que abrem | GET aceita view? | Mutação |
|------|--------------------------|------------------|---------|
| Dashboard | (null, após `hasAdminAreaAccess`) | sim | — |
| Membros / Sócios | `members:view` \| `members:approve` | `members:view` | approve/reject/… |
| Agenda | `events:view` \| `events:manage` | `events:view` | `events:manage` |
| Loja | `store:manage` \| `store:view_orders` | pedidos com view_orders | `store:manage` |
| Bar / PDV | `bar:operate` \| `bar:manage` | operate | manage |
| Comunidade | `community:view` \| manage \| publish \| moderate \| curate | `community:view` | manage/publish/… |
| Financeiro | `finance:manage` \| (`finance:view` ∧ `audit:view`) | `finance:view` (com audit) ou manage | `finance:manage` |
| Patrimônio | `patrimony:manage` \| (`patrimony:view` ∧ `audit:view`) | idem | `patrimony:manage` |
| Estrutura | `sedes:view` \| `sedes:manage` \| global_view \| roles \| affiliation | `sedes:view` (unidades) | `sedes:manage` etc. |
| Relatórios | `reports:view` | sim | — |
| Plataforma → Auditoria | `audit:view` | sim | append-only |
| Alianças / Settings / Acessos | manage respectivos | não (membro Diretoria) | governança |

## 5. Checklist Membro · Diretoria

**Vê:** indicadores; lista de membros/sócios; agenda; pedidos da loja; comunidade admin; lançamentos financeiros; patrimônio; unidades/estrutura; auditoria.

**Não faz:** aprovar cadastro; advertir/bloquear/desligar; importar LGE; criar/editar evento; publicar comunicado; moderar feed; curar notícia; editar sede/promover; lançar/editar financeiro; editar patrimônio; gerir catálogo/cupons; cargos; config; alianças.

## 6. Invariantes de teste (`rbac.test.ts`)

1. Colaborador de área **≠ Diretoria** → menu = `dashboard` (+ `relatorios` se
   `reports:view`, + bar/PDV se `bar:operate`). `finance:view` /
   `patrimony:view` sozinhos **não** abrem admin.
2. **Membro · Diretoria** → menu inclui itens de visão listados acima; **exclui**
   bar, alianças, e tabs que exigem só manage (catálogo loja, hierarquia sem
   roles, etc. conforme gate).
3. Mutações com `assertPermission(*_MANAGE | members:approve | …)` rejeitam
   pacote só-visão.
4. Gestor · Diretoria e system roles inalterados em poder de mutação.
5. Switcher “Torcida ativa” no admin lista só tenants com `hasAdminAreaAccess`
   (esconde espelho `member` na Sede).
