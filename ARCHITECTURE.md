# Arquitetura — Torcida SaaS

> Documento vivo. Atualizar sempre que uma decisão estrutural mudar.
> Última revisão: 2026-07-10

## 1. Visão geral do produto

Plataforma para torcidas organizadas de futebol, com hierarquia de três níveis:

```
Sede (torcida principal)
 └─ Subsede
     └─ PDE (Ponto de Encontro)
```

Modelo de venda é **bottom-up**: qualquer nó pode assinar primeiro (ex: um PDE),
antes da sede-mãe aderir. Quando a sede aderir, os nós filhos se conectam a ela.

Canais do produto:
- **Discord bot** (`apps/bot`) — canal original, ainda em uso ativo.
- **Web** (`apps/web`) — portal (usuário final) + admin (gestão da torcida) + super-admin.
- **Mobile** (planejado) — React Native/Expo, reaproveitando o mesmo backend do web.

---

## 2. Arquitetura atual (as-is)

### 2.1 Repositório

```
botpde/ (monorepo pnpm + turborepo)
├── apps/
│   ├── bot/          Discord bot — JS puro, discord.js, pg direto (sem Prisma)
│   └── web/           Next.js 16 + React 19 — portal, admin, super-admin
└── packages/
    ├── db/            Prisma schema único, compartilhado por quem o importar
    ├── types/          Schemas Zod + permissões compartilhadas
    └── ui/             Componentes React + services (form, dialog, toast...)
```

### 2.2 Dados

- **Um único Postgres compartilhado** (Railway). Multi-tenancy é **lógica**,
  via coluna `tenantId` nas tabelas `saas_*`.
- **Duas gerações de schema coexistindo na mesma base:**
  - Tabelas legadas do bot (`membros`, `produtos`, `pedidos`, `bot_config`...)
    — lidas via `pg` puro pelo bot, e via Prisma (read-oriented) pelo web.
  - Tabelas novas `saas_*` (Tenant, User, Role, Sede, Evento, SaasProduto...)
    — usadas pelo web via Prisma. O bot ainda não escreve nelas.
- `Tenant.databaseUrl` **já tem o mecanismo implementado** —
  `getDbForTenant(tenant)` em `packages/db/src/index.js` retorna um
  `PrismaClient` isolado (com cache por tenant) quando `databaseUrl` está
  preenchido, ou o client compartilhado quando não está. *Correção
  (2026-07-02): revisão anterior deste documento dizia que não havia lógica
  nenhuma — havia, só não é **usada** em nenhuma query do `apps/web` ainda
  (tudo importa `db` direto, não `getDbForTenant`). Ou seja: o mecanismo de
  fuga pra banco dedicado já existe, só falta alguém chamá-lo.*
- Hierarquia de `Sede` já modelada corretamente: auto-relação `sedeId` (pai)
  / `filhos`, e `tenantId` **opcional** — permite um nó existir antes de
  virar tenant (`sedeReferenciaNome` / `sedeReferenciaSlug` guardam a
  referência à sede-mãe ainda não cadastrada).
- Não existe hoje nenhuma regra de **visibilidade cross-tenant** (o que uma
  subsede pode ver da sede, e vice-versa). Cada tenant é uma ilha.
- **Módulo Salas (Meet)**: videoconferência em tempo real dentro de Comunidade,
  via LiveKit/WebRTC — **opcional** (`isLiveKitConfigured()`; sem config, a sala
  ainda funciona como chat/enquetes/presença). Presença e chat/enquetes usam
  polling, não websocket próprio; só áudio/vídeo e o gesto de "levantar a mão"
  usam o data channel do LiveKit. Autorização de host é uma única permissão
  (`meetings:host`); votantes de enquete só são visíveis ao host (privacidade).
  Ver `docs/data/modulo-salas.md`.

### 2.3 Autenticação e autorização

- NextAuth v5 (JWT), providers Discord + Google, unificação de conta por
  e-mail/providerAccountId.
- RBAC por tenant: `Role` (com array de `permissions`), `UserRole`,
  `UserPermission` (overrides pontuais). Tudo escopado por `tenantId` —
  não existe hoje o conceito de papel/permissão que atravesse tenants
  (ex: "admin da sede vê tudo das subsedes").

### 2.4 API / integração mobile

- Não existe uma camada de API formal. O `apps/web` usa Server
  Components/Server Actions do Next.js falando direto com Prisma —
  a única rota de API real é `NextAuth` (`/api/auth/[...nextauth]`).
- **Consequência prática:** hoje não há nada reutilizável para o mobile.
  Qualquer app RN vai precisar de uma API nova, independente do formato
  escolhido (REST, tRPC, etc).
- **Catálogo da superfície de escrita** (as-is) mapeado em
  `docs/api/server-actions.html` — doc navegável (estilo Scalar) de cada
  Server Action: gate de permissão, validação Zod, escritas no banco e
  `AuditLog`. Regenerar quando novas actions forem criadas.
- **Achado de auditoria (2026-07-07, resolvido):** o catálogo expôs que
  `criarTenantInicial` e `atribuirOwnerAction` (super-admin,
  `app/super-admin/setup/actions.ts`) **não gravavam `AuditLog`**, violando a
  convenção "toda mutação administrativa grava AuditLog". Corrigido no mesmo dia
  (`TENANT_CRIADO` / `OWNER_ATRIBUIDO`) — ver §6.

### 2.5 Deploy / custo

- Railway, 4 serviços/projetos:
  - `torcida-web` — Next.js standalone (Nixpacks).
  - `bot-pde` (nome do serviço no Railway: `botpde`) — bot atual (`apps/bot`),
    Root Directory = `apps/bot`, build via `npm install` isolado (não vê o
    resto do monorepo). Funciona bem para o `pg` cru que o bot usa hoje —
    mas **não suporta dependências `workspace:*`** (ver item 4: tentativa de
    usar `@torcida/db` quebrou o deploy, revertida em 2026-07-06).
  - `dbo-bot-pde` — Postgres addon. **Confirmado (2026-07-01) que é o
    mesmo banco usado por `torcida-web`**: `dbo-bot-pde` expõe o host
    interno (`postgres.railway.internal`), `torcida-web` usa o proxy
    público (`*.proxy.rlwy.net`) — mesmas credenciais e mesmo database.
    Não é addon duplicado, sem custo morto aqui.
  - `bot-fivem` — produto anterior/paralelo, ainda ativo, sendo migrado
    aos poucos para o web/mobile atual.
- Hobby Plan: $5/mês incluídos, uso atual ~$2.45/mês estimado — dentro da
  margem, sem necessidade de trocar de provedor no MVP.

---

## 3. Arquitetura alvo (to-be)

### 3.1 Princípio geral

**Isolamento lógico agora, isolamento físico só onde for necessário depois.**
Nada de banco por torcida/subsede/PDE como regra — isso explode custo e
complexidade de query (uma sede consultando 20 PDEs em 20 bancos físicos é
uma operação distribuída cara). O `databaseUrl` no `Tenant` continua
reservado para o caso raro de uma torcida específica crescer sozinha a
ponto de justificar banco dedicado — migração pontual, não arquitetura padrão.

```mermaid
flowchart TD
    subgraph Postgres["Postgres único compartilhado"]
        T1[Tenant: Sede X]
        T2[Tenant: Subsede Y]
        T3[Tenant: PDE Z]
    end
    T2 -->|tenantId opcional em Sede| T1
    T3 -->|tenantId opcional em Sede| T2
    note1["Exceção futura: se um tenant crescer muito,\ntroca-se só o DATABASE_URL dele (Tenant.databaseUrl)"]
```

### 3.2 Hierarquia e visibilidade — resolvida por autorização, não por infra

Usar a árvore de `Sede` (já existe) para decidir acesso, com uma
classificação de dado em duas categorias:

- **Público-na-hierarquia**: loja, localização, comunidade/mural, eventos
  públicos — visível para ancestrais E descendentes.
- **Restrito**: membros, sócios, financeiro/pedidos, dados pessoais —
  visível apenas para o próprio tenant **e seus ancestrais** (sede vê tudo
  da subsede/PDE; subsede/PDE não vê o restrito de irmãos ou da sede).

```mermaid
flowchart LR
    Sede -->|acesso total: público + restrito| Subsede
    Subsede -->|acesso total: público + restrito| PDE
    PDE -.->|só dados públicos| Subsede
    Subsede -.->|só dados públicos| Sede
```

**✅ Implementado (2026-07-03).** Dividido em duas camadas:
- Regra pura em `packages/types/src/visibility.js` — `RECURSO_SENSIBILIDADE`
  (mapa recurso → `publico`/`restrito`) e `resolveVisibility(relation, sensibilidade)`
  / `canViewRecurso(relation, recurso)`, testado isoladamente (self/ancestor
  sempre veem tudo; descendant só vê público; unrelated não vê nada).
- Resolução de hierarquia (precisa de banco) em `apps/web/src/lib/hierarquia.ts`
  — `getTenantRelation(actorTenantId, targetTenantId)` sobe/desce a árvore de
  `Sede` a partir do `tenantId` de cada nó; `resolveVisibility()` (wrapper
  assíncrono) combina os dois; `getTenantHierarquia(tenantId)` monta a sede-mãe
  + lista de descendentes prontos pra exibir.
- Primeira superfície real: `/admin/hierarquia` — mostra a sede-mãe (só dados
  públicos) e as subsedes/PDEs (com métricas restritas — membros ativos,
  sócios — porque olhar descendente é a única direção em que a regra permite
  ver dado restrito). Gate por `SEDES_MANAGE` via `assertPermission`.

### 3.2b Controle de acesso — Departamentos, Perfis e Permissões

> Inspirado em cargos do Discord + revisão de um sistema de controle de
> acesso corporativo de referência. Atualizado 2026-07-14: departamento
> **concede** permissões; membro ≠ gestor.

Dois eixos independentes, escopados por tenant (contrato = sede/subsede/pde):

- **Departamento** (`Departamento`) — unidade de acesso **e** agrupamento
  organizacional (Diretoria, Financeiro, Comunicação…). Carrega
  `permissions[]` (membro/equipe) e `permissionsGestor[]` (a mais, para quem
  é gestor). Sócio/Torcedor **não** são departamento — são `SaasMembro.tipo`.
  Lista plana por tenant no MVP.
- **Perfil** (`Role`) — agrupamento transversal de permissões
  (`permissions: String[]`).
- **Permissões adicionais** (`UserPermission`) — override pontual
  (`granted: true/false`).

```
efetivas = ∪ Role.permissions
         ∪ (membro ? Departamento.permissions : [])
         ∪ (gestor ? Departamento.permissionsGestor : [])
         ± UserPermission overrides
```

```mermaid
flowchart LR
    User -->|N| UserDepartamento --> Departamento
    User -->|N| UserRole --> Role[Role / Perfil]
    User -->|N| UserPermission[Permissão adicional]
    Departamento -->|N gestores| DepartamentoGestor --> User
```

**Gestão delegada** (`DepartamentoGestor` + `canManageDepartamento`): quem tem
`ROLES_MANAGE` gerencia tudo; gestor de um departamento pode incluir/remover
membros **daquele** departamento (`adicionarMembroDepartamento` /
`removerMembroDepartamento` em `/admin/acessos/actions`).

**UI**: `/admin/acessos` com três seções — **Pessoas** (atribuição), **Cargos**
e **Departamentos** (CRUD de templates). **Sem** FK `Role ↔ Departamento` — os
eixos somam no usuário. Bootstrap de tenant semeia os 10 deptos canônicos
(`upsertDepartamentosCanonicos`). Hub portal: `/portal/departamentos`.

**Visão da torcida** (`/admin/torcida`): worktree híbrida = árvore de `Sede`
do tenant (onboarding) + Tenants filhos quando existentes; KPIs por
`SaasMembro.sedeId`. Gate: `TORCIDA_GLOBAL_VIEW` + Sede `tipo: SEDE`.
Ver `docs/data/modulo-departamentos.md`.

**Planejado:** o Presidente poderá, a partir da worktree, acessar afiliadas
(membros, sócios, relatórios, financeiro) — escopo/UX a definir; o
relacionamento hierárquico na Visão já está ok.### 3.3 Unificação bot ↔ web

- Bot para de falar Postgres cru via `pg` e passa a usar `@torcida/db`
  (Prisma), mesmo cliente e mesmo schema que o web.
- Tabelas legadas (`membros`, `produtos`, `pedidos`) migram gradualmente
  para as equivalentes `saas_*`, com script de migração de dados —
  até então seguem lidas em paralelo (como hoje).

**⚠️ Bloqueada por infraestrutura de deploy (2026-07-06)**: implementação
tentada (VIN-11/13/14) e **revertida** — o serviço `botpde` no Railway
builda com Root Directory=`apps/bot` e `npm install` isolado, sem acesso ao
resto do monorepo. `@torcida/db` (`workspace:*`) não resolve nesse contexto
(`npm error Unsupported URL Type "workspace:"`), quebrando 3 deploys
seguidos antes de ser identificado. Retomar só depois de decidir entre:
(a) mudar o Root Directory do `botpde` pra raiz do repo + `pnpm` (igual
`torcida-web` já faz — a correção "de verdade", mas exige mudança no
painel do Railway, possivelmente com "Config-as-code" apontando pro
`apps/bot/nixpacks.toml`/`railway.toml` específico, não testado ainda); ou
(b) vendorizar uma cópia do schema Prisma só pro bot (evita mexer no
Railway, mas reintroduz duplicação de schema — mesma classe de problema
que a remoção do `src/` legado, item 1, resolveu).

### 3.4 Camada de API para mobile

**Prioridade nº 1 é interna, não externa**: a API central existe primeiro
para fazer sede, subsede e PDE trocarem informação entre si (respeitando a
regra de visibilidade da seção 3.2) e para o `apps/mobile` consumir o mesmo
backend que o web. Integração com terceiros **não é objetivo do MVP**.

Formato escolhido: **tRPC**, dentro do monorepo (ex: rotas
`app/api/trpc/[trpc]/route.ts` em `apps/web`, ou pacote `packages/api`),
consumido por `apps/web` e pelo futuro `apps/mobile` (Expo). Motivo:

- Stack já é TypeScript ponta a ponta (Next.js, Prisma, Expo) — tipagem
  end-to-end sem escrever contrato manual.
- Reaproveita os schemas Zod que já existem em `packages/types`, que é
  exatamente o formato de validação que o tRPC espera.
- Não exige servidor/infra separada — roda dentro do `apps/web` atual.

```mermaid
flowchart TD
    subgraph apps
        web[apps/web]
        mobile[apps/mobile - Expo]
        bot[apps/bot]
    end
    subgraph packages
        api[API central - tRPC]
        db[(packages/db - Prisma)]
        types[packages/types - Zod]
    end
    web --> api
    mobile --> api
    bot --> db
    api --> db
    web --> types
    mobile --> types
    api --> types
```

**Fase futura (pós-MVP, fora de escopo agora):** expor uma camada REST fina
por cima do tRPC quando surgir demanda real de integração com terceiros
(ex: outra torcida parceira consumindo dados via webhook, integração de
pagamento externa, parceiros comerciais). Não antecipar isso agora —
adiciona superfície de API pública, versionamento e autenticação de
terceiros que o MVP não precisa.

### 3.5 Deploy / custo

- Manter Railway no MVP (dentro do Hobby Plan).
- Ação imediata: confirmar se `dbo-bot-pde` é o único Postgres em uso
  (comparar `PGHOST` com o que `torcida-web`/`bot-pde` realmente usam) e
  desligar addon duplicado se houver.
- Reavaliar hosting só quando o uso real se aproximar do limite do plano
  (sinal: estimated bill encostando nos $5, ou latência/RAM no limite).

---

## 4. Plano de convergência (as-is → to-be)

| # | Item | Ação | Bloqueia o quê |
|---|------|------|-----------------|
| 1 | ~~`src/` legado na raiz~~ | ✅ Removido em definitivo (2026-07-06, VIN-9), decisão conjunta após análise: confirmado idêntico a `apps/bot/src` (diff vazio), zero configs de build/deploy referenciando o `src/` da raiz (Railway do `bot-pde` roda com Root Directory `apps/bot`), nenhum dos dois tocado desde a migração pro monorepo. Remover não apaga histórico do Git (`git log --all -- src/` continua funcionando). Achado colateral corrigido junto: `apps/bot/src/assets/` estava no `.gitignore`, deixando `pdelogo.png` (usado em runtime por `apps/bot/src/events/ready.js`) sem nenhuma cópia versionada — corrigido antes da remoção (git detectou como rename, preservando o blob) | — |
| 2 | ~~`dbo-bot-pde`~~ | ✅ Confirmado: mesmo banco de `torcida-web`, sem ação necessária | — |
| 3 | ~~Visibilidade cross-tenant~~ | ✅ Feito (2026-07-03): `resolveVisibility`/`canViewRecurso` (`packages/types`) + `getTenantRelation`/`getTenantHierarquia` (`apps/web/src/lib/hierarquia.ts`) + página `/admin/hierarquia` provando o fluxo real | — |
| 22 | ~~Aplicar `resolveVisibility` em mais telas~~ | ✅ Feito (2026-07-05) para comunidade e eventos; ✅ Feito (2026-07-10) para loja: `/portal/loja` usa `getVisibleTenantIds(tenant.id, 'loja')`, actions validam `resolveVisibility` antes de sacola/checkout. Catálogo da sede-mãe cascadeia para subsedes/PDEs | — |
| 25 | ~~PRD "torcida organizada" — 8 regras de negócio~~ | ✅ Feito (2026-07-05), sem reescrever a arquitetura (decisão de escopo do usuário): (1) `SaasMembro.sedeId` — vínculo territorial explícito, escolhido no cadastro quando o tenant tem mais de uma `Sede`; (2)+(3)+(4) `Announcement`/`AnnouncementRead` (novo, distinto de `Post`) — comunicado oficial com prioridade/pin, gated por nova permissão `announcements:publish` (separada de `community:manage`), sempre ordenado acima do mural local em `getFeedComunidade()`; (5) moderação segue restrita ao próprio tenant (mesmo padrão de `tenantId` nas queries; itens herdados de ancestrais renderizam sem controles de edição); (6) eventos globais vs. restritos a uma unidade via `Evento.sedeId` + `SaasMembro.sedeId`; (7) `EventoRsvp.checkedInAt/checkedInPorId` — check-in real independente do status de RSVP, com botão dedicado em `/admin/eventos/[id]`; (8) `assertMembroAtivo()` (novo, `authz.ts`) bloqueia RSVP de membro pendente/reprovado ou sócio com carteirinha vencida. ⚠️ Nova permissão exige rodar `repair-system-role-permissions.js` depois do `db push` (mesmo padrão do item 18) | — |
| 23 | ~~Bug crítico: `usuarioId` em vez de `atorId` no AuditLog~~ | ✅ Corrigido (2026-07-03): `admin/eventos/actions.ts`, `admin/sedes/actions.ts` e `portal/cadastro/actions.ts` gravavam `auditLog.create({ data: { usuarioId: ... } })`, mas o campo do schema é `atorId`. Sem `try/catch`, isso quebrava em runtime (Prisma "unknown argument") **depois** do registro principal já ter sido salvo — ou seja, criar/editar evento, criar/editar/ativar sede e enviar cadastro de torcedor todos quebravam com erro 500 mesmo tendo escrito o dado. TypeScript não acusava por causa do mesmo teto de inferência descrito na seção 5.2 (o objeto `data` silenciosamente virava `any`) | — |
| 24 | ~~Ciclo na árvore de Sede~~ | ✅ Corrigido (2026-07-03): `editarSede` deixava escolher qualquer sede como pai, inclusive uma descendente da própria sede — isso criaria um ciclo que travaria para sempre `getTenantRelation`/`getTenantHierarquia` (recursão infinita). Adicionado `wouldCreateSedeCycle()` em `apps/web/src/lib/hierarquia.ts`, chamado em `editarSede` antes de gravar; `descendantTenantIds` também ganhou um guard de `visitados` como defesa em profundidade | — |
| 4 | Bot → Prisma | ⚠️ Tentado e **revertido** (2026-07-06): `@torcida/db` (`workspace:*`) quebra o build do serviço `botpde` no Railway (Root Directory=`apps/bot`, `npm install` isolado não resolve o protocolo `workspace:`). Revertido pra `pg` cru (ver seção 3.3). Bloqueado até decidir entre mudar Root Directory pra raiz + `pnpm`, ou vendorizar o schema | Unificação de dados, pré-requisito pra API central completa |
| 5 | Camada de API (tRPC) | Criar `packages/api` (ou rotas tRPC em `apps/web`) focada em uso interno entre hierarquia + mobile | App mobile e troca de dados sede/subsede/PDE |
| 6 | `apps/mobile` | Scaffold Expo, consumindo a API central | Lançamento mobile |
| 7 | API REST pública | **Fora de escopo do MVP** — só entra no roadmap quando houver demanda real de integração com terceiros | Integrações externas (futuro) |
| 8 | ~~Schema Departamento/Perfil~~ | ✅ Feito (2026-07-01): `Departamento`, `UserDepartamento`, `DepartamentoGestor` adicionados ao Prisma schema, `canManageDepartamento()` em `packages/types` | — |
| 9 | ~~UI de atribuição de acesso~~ | ✅ Feito (2026-07-02): `/admin/acessos` — edição por usuário (perfis, departamentos com gestor opcional, permissões efetivas/adicionais). `DepartamentosManager` (CRUD) adicionado em `/admin/configuracoes`. Ver nota de escopo abaixo | — |
| 10 | ~~Migração de banco~~ | ✅ Aplicada (2026-07-02) via `prisma db push` em produção: `saas_departamentos`, `saas_user_departamentos`, `saas_departamento_gestores` e todos os índices novos criados | — |
| 11 | ~~Coerência do schema~~ | ✅ Feito (2026-07-02): `Advertencia` sem relação de `Tenant` corrigido; índices adicionados em toda coluna `tenantId`/FK usada em query multi-tenant (`Sede`, `Evento`, `SaasProduto`, `SaasPedido`, `Post`, `AuditLog`, `UserRole`, `UserPermission`, `UserDepartamento`, `DepartamentoGestor`) | — |
| 12 | ~~Permissão desde o primeiro acesso~~ | ✅ Feito (2026-07-02): aprovar `SaasMembro` auto-concede Role `member` via `concederAcessoBasico()`. **Atualizado 2026-07-17:** departamento do onboarding é preferência (`SaasMembro.departamentoId`), não membership — só aplica em `aprovarMembro` | — |
| 13 | ~~Menu do admin gated por permissão~~ | ✅ Feito (2026-07-02): `ADMIN_MENU` + `filterMenuByPermissions`/`hasAdminAreaAccess` em `packages/types/src/menu.js`; `admin/layout.tsx` e `AdminSidebar` agora filtram por permissão efetiva em vez de nome de cargo hard-coded | — |
| 14 | ~~Cargos de sistema desalinhados~~ | ✅ Corrigido (2026-07-02): seed de `owner`/`admin`/`member` em `super-admin/setup/actions.ts` usava strings em português (`membros:ler`, `sedes:editar`...) divergentes do vocabulário canônico (`members:view`, `sedes:manage`...) usado pela UI de cargos e por `packages/types`. Agora usa `SYSTEM_ROLES`/`SYSTEM_ROLE_PERMISSIONS` compartilhados | ⚠️ ver nota de migração abaixo |
| 17 | ~~Gestão de perfis aprimorada~~ | ✅ Feito (2026-07-02), inspirado na tela de Perfis/Permissões de referência: cascata de dependência (`applyPermissionCascade` em `packages/types` — marcar permissão não-base puxa a base do grupo, ex. `members:view`; desmarcar a base derruba as irmãs), aplicada na UI E no servidor (cargos e acessos); diff visual verde/vermelho com contadores por grupo na edição; busca por nome/permissão; confirmação com resumo das mudanças; exclusão bloqueada para cargo em uso (contagem exibida); validação de ≥1 permissão | — |
| 15 | ~~Reparo de dados em produção~~ | ✅ Rodado (2026-07-02) via `packages/db/scripts/repair-system-role-permissions.js`: 0 correções necessárias — o único tenant existente (`pde-gavioes-fiel`) já tinha as 3 roles de sistema com permissões canônicas (foi criado via `prisma/seed.js`, que nunca teve o bug — só o wizard `super-admin/setup` tinha). Script fica registrado (`pnpm --filter @torcida/db db:repair-system-roles`) como rede de segurança idempotente para o futuro | — |
| 18 | ~~Sistema de comunidade~~ | ✅ Feito (2026-07-02): `/admin/comunidade` (CRUD de posts, fixar/desafixar, gate por `COMMUNITY_MANAGE`) + `/portal/comunidade` (feed somente-leitura, fixados primeiro). Usa o model `Post` que já existia no schema (nunca tinha UI). Nova permissão `community:manage` exigiu rodar `repair-system-role-permissions.js` de novo — owner/admin em produção ganharam a permissão retroativamente | — |
| 19 | ~~Sistema de comunidade — sem interação~~ | ✅ Feito (2026-07-10): feed social com posts de membros, comentários, reações (CURTIR/FORCA), perfil unificado (`/portal/comunidade/perfil/[id]`) com banner/avatar, abas (Sobre, Publicações, Fotos, Atividade), seguimento com aprovação, busca de membros, privacidade de perfil e visibilidade por post. Ver `docs/data/modulo-comunidade.md` | — |
| 20 | ~~`packages/ui` — design system real~~ | ✅ Feito (2026-07-02): extraídos `FieldError`, `Input`/`Select`/`Textarea`, `SubmitButton`, `Badge`, `PageHeader`, `Card` — eram copiados byte-a-byte em 6+ arquivos (`evento-forms`, `post-forms`, `sede-forms`, `cadastro-form`, `perfil-form`, parcialmente `produto-forms`). Build real com `tsup` (`dist/` com `.js`/`.mjs`/`.d.ts`), sem alterar como `apps/web` consome o pacote hoje (`exports` continua apontando pro `src`, o build é uso externo/futuro). Motivação: preparar pra sincronizar com claude.ai/design (`/design-sync`) depois — hoje não havia nada buildável pra sincronizar | — |
| 21 | Migrar admin/loja para os componentes do design system | `produto-forms.tsx` tem estilo de input divergente (sem focus ring, padding menor) — não migrado agora pra não arriscar regressão visual sem visualizar. Unificar quando alguém revisar a tela da loja | Consistência visual completa |
| 26 | ~~Roteamento por subdomínio real~~ | ✅ Preparado (2026-07-05): `ROOT_DOMAIN` validada em `apps/web/src/lib/env.ts`, `tenant.ts` já usava a lógica certa (só faltava a env var validada). Testável agora **sem domínio próprio** via `ROOT_DOMAIN=lvh.me` (`*.lvh.me` resolve pra `127.0.0.1`, sem DNS). `auth.ts` ganhou cookie de sessão compartilhado entre subdomínios (`cookies.sessionToken.domain = .${ROOT_DOMAIN}`) — sem isso, logar em `sede.lvh.me` não mantinha sessão em `subsede.lvh.me`. Script `promover-subsede-para-tenant.js` promove uma `Sede` de teste a `Tenant` de verdade, reaproveitando o mesmo usuário owner | Só falta domínio real — ver nota de produção abaixo |
| 27 | ~~Segundo método de login (e-mail/senha)~~ | ✅ Feito (2026-07-05): `User.senhaHash` (nullable, só contas com senha têm), provider `Credentials` em `auth.ts` (bcrypt.compare, erro genérico — não diferencia e-mail inexistente de senha errada), `/entrar/criar-conta` (cadastro) e formulário de senha em `/entrar`. Callback `jwt` ganhou ramo específico pra `account.provider === 'credentials'` (usa `user.id` direto, os ramos de discordId/googleId não se aplicam). **Decisão deliberada**: conta com senha NÃO mescla com conta OAuth existente do mesmo e-mail (evita takeover) | Reset de senha (item 28) |
| 28 | "Esqueci minha senha" | Fora de escopo por decisão do usuário — exige provedor de e-mail transacional (nenhum configurado no projeto ainda, ex: Resend). Enquanto não existir, reset é manual (direto no banco) | Fluxo de recuperação completo |
| 29 | ~~Rate-limit de login~~ | ✅ Feito (2026-07-06): `apps/web/src/lib/rate-limit.ts` (in-memory, sem Redis/Upstash — 5 tentativas/15min por e-mail, aceitável no estágio atual de baixo tráfego e única instância). Já existia desde antes desta revisão, mas só era chamado na Server Action de `/entrar` — uma chamada direta a `/api/auth/callback/credentials` (pulando a UI) contornava o limite. Corrigido movendo a aplicação real (`excedeuLimite`/`registrarTentativaFalha`) para dentro do `authorize()` do provider Credentials em `lib/auth.ts`, o único ponto por onde toda tentativa de login passa de fato. Server Action mantém só a checagem rápida (evita round-trip) | Reavaliar store compartilhado (Redis/Upstash) antes de escalar para múltiplas instâncias |
| 30 | ~~Loja SaaS — sacola, cupom, multi-item~~ | ✅ Feito (2026-07-10): modelos `SaasCategoria`, `SaasCupom`, `SaasCarrinhoItem`, `SaasPedidoItem`; `SaasPedido` refatorado como cabeçalho (subtotal, desconto, cupom, retirada/envio, `grupoCheckoutId`); portal com sacola + checkout; admin com categorias/cupons; `STORE_VIEW_ORDERS` para leitura de pedidos; seed Gaviões (`pnpm --filter @torcida/db seed:loja-gavioes`). Ver `docs/data/modulo-loja.md`. Fora de escopo: gateway de pagamento, frete por CEP, bridge Discord ticket | — |

## 5. Decisões fechadas nesta revisão

- API central = **tRPC**, com foco inicial em uso **interno** (hierarquia
  sede/subsede/PDE + mobile). REST para terceiros fica documentado como
  fase futura, não meta do MVP.
- `dbo-bot-pde` confirmado como o mesmo Postgres do `torcida-web` — sem
  banco duplicado, sem ação de custo pendente.
- Aprovação de `SaasMembro` concede Role `member` via `concederAcessoBasico()`.
  Departamento pretendido no onboarding (`SaasMembro.departamentoId`) **não** é
  membership: só vira perfil `Membro · {Área}` + `UserDepartamento` em
  `aprovarMembro` (default), ou fica de fora com `{ incluirDepartamento: false }`.
  Sócio/Torcedor **nunca** foram departamentos — ver `modulo-departamentos.md`
  (2026-07-17). Atribuições extras continuam manuais em `/admin/acessos`.
- Árvore de menu do admin fica **estática no código** (`packages/types`),
  não configurável via banco no MVP.
- Permissões efetivas são resolvidas **no servidor a cada request**
  (já era o comportamento de `getUserPermissionsInTenant`), não embutidas
  no JWT — evita permissão desatualizada sem novo login.

### 5.1 UI de atribuição de acesso (item 9) — o que entrou e o que ficou de fora

- `/admin/acessos`: lista os usuários do tenant (qualquer um com `SaasMembro`,
  `UserRole`, `UserDepartamento` ou `UserPermission` no tenant atual) e permite
  editar, por usuário: perfis (multi-select), departamentos (multi-select,
  com checkbox "gestor" por departamento selecionado) e **permissões
  efetivas** — uma lista única de checkboxes que representa o resultado
  final desejado (vem do perfil OU é concessão/revogação pontual); o server
  action (`salvarAcessoUsuario`) calcula o diff mínimo contra o estado atual
  e só grava overrides em `UserPermission` quando o efetivo desejado diverge
  do que o(s) perfil(is) já dariam — implementa exatamente a semântica de
  `calculateEffectivePermissions` (perfil ∪ overrides) de trás pra frente.
- Gate de acesso por **permissão granular** (`ROLES_MANAGE`) via helper
  `assertPermission()` em `apps/web/src/lib/authz.ts` — não por nome de
  cargo. **Atualização (2026-07-06, item 16): esse critério agora é o único
  em todo o admin** — ver seção 5.3.
- Também extraído: `assertAdmin`/`assertOwner` estavam duplicados em 2
  arquivos (`membros/actions.ts`, `configuracoes/actions.ts`) — agora vivem
  só em `apps/web/src/lib/authz.ts`. `PERMISSION_GROUPS` (labels de UI por
  permissão) também deixou de estar hard-coded em `config-forms.tsx` e virou
  export de `packages/types`.
- **Fora do escopo desta rodada** (fast-follow se precisar): grant/revoke em
  lote pra múltiplos usuários ao mesmo tempo (o v1 edita um usuário por vez).

### 5.2 Achado técnico: anotação explícita de tipo é obrigatória em queries novas do Prisma

Ao escrever `/admin/acessos`, `db.role.findMany(...).map(...)` (e padrões
equivalentes) passaram a falhar com `implicit any`/`unknown` no `tsc`, **sem
nenhum erro no arquivo que gerou o dado** — só nos usos seguintes. Isolado e
confirmado: é um teto de profundidade de inferência do TypeScript contra os
tipos condicionais gerados pelo Prisma para este schema (43 models bem
relacionados, contagem em 2026-07-08) — a inferência automática do retorno de `findMany`/`findUnique`
simplesmente para de funcionar de forma **silenciosa** a partir de um certo
ponto, sem "excessively deep" explícito.

**Regra a partir de agora**: sempre anotar explicitamente o tipo do retorno
de queries Prisma novas (`const x: MinhaInterfaceLite[] = await db.modelo.findMany(...)`),
em vez de depender de inferência automática — isso faz o TypeScript checar
assinalabilidade (mais raso) em vez de re-inferir o tipo completo (mais
profundo). Ver `apps/web/src/app/admin/acessos/actions.ts` e `page.tsx` para
o padrão (`RoleLite`, `DepartamentoLite` etc.).

### 5.3 Item 16 resolvido — assertPermission é o único critério de autorização do admin

`assertAdmin`/`assertOwner` (nome de cargo de sistema `owner`/`admin`) foram
removidos de `apps/web/src/lib/authz.ts` — não têm mais nenhum caller.
Substituídos por `assertPermission(PERMISSION)` em todo `apps/web/src/app/admin/**`:

- `sedes/actions.ts` → `SEDES_MANAGE`
- `loja/actions.ts` → `STORE_MANAGE` (produtos, categorias, cupons, mutação de
  status de pedido); leitura de pedidos em `/admin/loja/pedidos` via
  `assertStoreView()` (`STORE_VIEW_ORDERS` **ou** `STORE_MANAGE`)
- `eventos/actions.ts` → `EVENTS_CREATE` (criar) / `EVENTS_MANAGE` (editar,
  check-in, excluir)
- `membros/actions.ts` → `MEMBERS_APPROVE` (aprovar/reverter) /
  `MEMBERS_REJECT` (reprovar)
- `socios/actions.ts` → `MEMBERS_APPROVE` (emitir/renovar/revogar
  carteirinha — não existe permissão dedicada a "sócio"; reaproveita a mais
  próxima do fluxo de aprovação de associado, decisão a revisitar se virar
  demanda)
- `configuracoes/actions.ts` → `SETTINGS_MANAGE` (perfil do tenant, Discord
  guild — únicas ações que eram `assertOwner`, e `SETTINGS_MANAGE` já é
  exclusiva do owner via `SYSTEM_ROLE_PERMISSIONS`) / `ROLES_MANAGE` (cargos
  e departamentos, mesmo critério já usado em `/admin/acessos`)

Sem regressão para `owner`/`admin` (ambos já têm todas as permissões
granulares via `SYSTEM_ROLE_PERMISSIONS`); um perfil customizado com a
permissão certa passa a acessar a ação equivalente sem precisar do cargo de
sistema. `AuthzResult` (tipo de retorno de `assertPermission`) parou de
derivar de `assertAdmin` (removido) e passou a usar o tipo `Session` de
`next-auth` diretamente — `ReturnType<typeof auth>` não funciona aqui porque
o `auth` do NextAuth v5 é uma função com múltiplos overloads (middleware e
sessão) e a utility type resolve para a assinatura errada.

Testes: `pnpm --filter @torcida/web test` (suíte da VIN-6) continuam verdes,
já que não tocam em `packages/types`. Nenhum teste cobre `assertPermission`
em si (depende de sessão/banco) — cobertura por typecheck + smoke manual.

### 5.4 Provedor de banco — Railway mantido; Prisma Postgres NÃO adotado (2026-07-07)

Decisão de arquitetura de infra, avaliada com prioridade em custo baixo/zero,
simplicidade e baixo risco. **Banco ativo continua o Railway Postgres**
(`dbo-bot-pde`, ver §2.5). O **Prisma Postgres** que aparece no console
`console.prisma.io` **existe mas NÃO é o banco da aplicação** — é uma instância
separada e vazia (mostra "connect your database to start seeing usage").
Prisma é usado apenas como **ORM**, apontando para o Railway via `DATABASE_URL`
(`packages/db/.env`). Não confundir os dois.

Por que manter Railway (sem migrar):
- Já está em produção, funcionando, e co-hospeda `web` + `bot` + Postgres no
  mesmo provedor — menos superfície operacional.
- Custo já baixo (~$2.45/mês dentro do Hobby de $5) — a economia do free tier
  do Prisma Postgres seria marginal e só sobre o DB (o resto segue no Railway).
- **Fator decisivo:** o `bot` acessa o banco com `pg` cru, não Prisma. Prisma
  Postgres é pensado para acesso via Accelerate (pooler/proxy). Migrar exigiria
  retrabalhar o acesso do bot — custo/risco reais por ganho pequeno.
- Conexão TCP direta combina com a arquitetura atual (Next server + bot
  long-running), não serverless.

Quando Prisma Postgres faria sentido no futuro (só neste combo, não antes):
mover o deploy para **serverless/edge** (ex.: Vercel) **e** aposentar o acesso
`pg` cru do bot, indo 100% Prisma — aí o pooling do Accelerate resolve
esgotamento de conexão em serverless e o free tier passa a valer. `Tenant.databaseUrl`
(§3.1) segue reservado para isolamento físico pontual, independente do provedor.

Melhorias ortogonais ao provedor (não são migração): confirmar backups
automáticos do Railway ligados; considerar migrations versionadas para produção
quando o schema estabilizar (hoje o fluxo é `db push`, sem migrations).

### 5.5 Captura visual de fluxo para revisão de UI/UX — Playwright, sem MCP dedicado (2026-07-08)

Adicionado `apps/web/e2e/` (Playwright) para navegar os fluxos principais e
salvar PNGs em `apps/web/e2e/screenshots/<fluxo>/` (não commitado — artefato
local). Objetivo: alimentar o agente `ux-review` (que aciona o skill
`impeccable`) com evidência real de tela em vez de inferência por JSX. Ver
`apps/web/e2e/README.md`.

Por que Playwright (test suite) e não um MCP de browser dedicado:
- O pedido é **repetível e versionável** ("rodar e salvar imagem de cada
  fluxo"), não exploração ad-hoc de uma sessão — isso pede uma suíte de teste,
  não uma ferramenta MCP conversacional.
- O repo já usa Vitest como padrão de teste; Playwright é o par natural para
  e2e/visual, sem introduzir um novo protocolo de integração.
- Login é OAuth (Discord/Google) + e-mail/senha — sem credencial de teste
  seedada em produção, mas a suíte usa um usuário de teste real via Credentials
  (e-mail/senha em `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`, `apps/web/.env.local`,
  nunca commitado). Login 100% automático via projeto `setup`
  (`apps/web/e2e/auth.setup.ts`) a cada `test:e2e` — não depende de captura
  manual. Google bloqueia login em browser controlado por automação; Discord
  exigiria reautorizar a cada sessão — por isso Credentials, não OAuth, na
  captura automática (login social continua igual para usuários reais).
- Continua valendo usar `claude-in-chrome`/preview tools para exploração pontual
  interativa; a suíte Playwright é para captura em lote, comparável entre
  execuções.
- Benchmark de latência de navegação: `apps/web/e2e/nav-latency.portal.spec.ts`
  (mede skeleton, TTFB percebido entre rotas do menu).

### 5.6 Otimização de performance web — plano em 5 fases concluído (2026-07-10)

Diagnóstico inicial: navegação lenta por **dezenas de round-trips ao Postgres
remoto** (Railway) por página, ausência de feedback visual, e polling HTTP
competindo com navegação. O plano zero-custo (sem trocar stack) foi executado
em cinco fases; commits de referência na `main`:

| Fase | Commit | Foco |
|------|--------|------|
| 1–3 | `99443a7` | `React.cache`/`unstable_cache`, N+1 mensagens, skeletons, navbar lazy, Suspense Comunidade, índices DB, `proxy.ts`, `staleTimes` |
| Navegação instantânea | `79ae24b` | Barra de progresso + spinner, prefetch menu, streaming granular (Comunidade/Loja/Eventos), inbox client em Mensagens |
| 4 | `6f4db5f` | `next/image`, feed agregado (1 query), `connection_limit=5` automático em `@torcida/db` |
| 5 | `82ae6f3` | Inbox SSR em Mensagens, prefetch on-hover, `unstable_cache` de comunicados, polling com `useVisibleInterval`, `listMensagens` com LIMIT SQL, `dynamic()` no thread |

**Padrões adotados (manter em features novas):**
- Cache por request: `React.cache` em `tenant.ts`, `hierarquia.ts`, `feed.ts`.
- Cache cross-request: `unstable_cache` + `revalidateTag` (tenant, hierarquia,
  permissões, comunicados — ver `comunicadosCacheTag` em `comunidade.ts`).
- Feedback de navegação: `PortalNavLink` + `NavPendingProvider`; `loading.tsx`
  nas rotas do menu.
- Streaming: Suspense por seção em páginas pesadas; não bloquear shell no SSR.
- Prefetch: `prefetch="hover"` na navbar — evitar prefetch agressivo em todas
  as rotas.
- Imagens: `next/image` via `canOptimizeImageUrl()` (`optimizable-image.ts`).
- Polling: `useVisibleInterval`; pausar badges redundantes quando a rota já
  carrega os mesmos dados (ex.: navbar em `/portal/mensagens`).
- Dev: contador de queries Prisma (`query-metrics.js`, badge em dev).

**Teto estrutural (não some com mais React):**
- Latência TCP Postgres Railway (~50–150 ms por query).
- Páginas autenticadas 100% dinâmicas (`auth()`/`headers()` impedem cache de
  página inteira).
- Mensageria em polling HTTP (item 27 — SSE/WebSocket só com demanda de escala).

**Padrões adicionados na auditoria de Comunidade (2026-07-16, ver commits de
banner/busca/painel lateral):**
- **Singleton client + dedupe de in-flight** para dados globais consumidos por
  vários componentes (badges, contadores): cachear em escopo de módulo com TTL
  curto e devolver a mesma `Promise` a chamadas concorrentes, em vez de um
  fetch por consumidor do hook. Referência: `use-navbar-context.tsx`.
- **Invalidação seletiva por tipo de evento**: ao invés de `router.refresh()`
  a cada notificação recebida via polling, classificar quais tipos de evento
  realmente mudam a árvore de Server Components (ex.: `MEMBRO_APROVADO` no
  painel lateral) e só revalidar nesses casos.
- **Busca instantânea client**: debounce (~280ms) + `AbortController`
  cancelando a request anterior + guarda de tamanho mínimo (2 chars) +
  `startTransition`. Evita respostas fora de ordem e queries desnecessárias.
  Referência: `comunidade-search-bar.tsx`. Padrão a reaplicar em qualquer
  autocomplete futuro (Loja, membros admin).
- **Scroll chrome com rAF-throttle**: listeners de scroll sempre `passive`,
  coalescidos por `requestAnimationFrame` (nunca `setState` cru no handler de
  scroll). Referência: `use-scroll-chrome-visibility.ts` (Comunidade) e
  `use-persist-bar-visibility.ts` + `StickyPersistBar` (admin/loja/onboarding —
  Salvar/Cancelar fixos; **não** na Comunidade).

**Alerta de anti-padrão — fan-out N+1 em checagens por item:** checagens de
visibilidade/seguimento chamadas em `map`/`for` por item de uma lista (ex.:
`canFollowUser` por candidato em `buscarMembrosComunidade`, `podeVerPost` por
post em `buscarComunidade`) multiplicam round-trips ao Postgres remoto
justamente nos caminhos de busca/feed. Preferir uma query `IN` batched ou
memoizar com `React.cache` a função de checagem por item.

### 5.6.1 Otimização Comunidade — ondas A–D + C (2026-07-16)

Commits de referência: `0dca679` (A–B), `3999ee5`/`d6116d1` (C), `1e79e41`–
`ff80330`/`3b5745a` (D). Fonte completa, **ganhos estimados por cenário (%)** e
checklist: **`docs/data/modulo-comunidade-performance.md`**.

| Onda | Foco |
|------|------|
| A | Batch visibilidade/contagens, índices, comentários lazy, stories batch, SSE banner |
| B1–B3 | APIs paginadas `/api/comunidade/feed` e `/rede`, infinite scroll, cursor na URL, SSE refetch |
| B4 | `FeedTimeline` — fan-out on write para rede/seguindo (`feed-timeline.ts`) |
| B5 | Ranking heurístico Descobrir (`scoreDescobrirPost`) |
| B6 | Busca `pg_trgm` + script `db:enable-pg-trgm` (fallback ILIKE) |
| Pós-B | `unstable_cache` em discover, sugestões, canais, hashtags, stories, salas |
| Chat/salas | `GET /api/conversas/resumo`; inbox só ao expandir; `listSalasAtivas` uma vez na `page.tsx` |
| C | TanStack Query + Virtual, `revalidateTag`, prefetch hover |
| D1–D3 | Redis SSE, fan-out async (+ ping SSE **após** fan-out), SSE mensageria |
| Live UX | Auto-refetch no topo (~250ms); banner “novos posts” só se rolado |
| Engajamento (2026-07-17) | Overlay reação/comentário sem `revalidatePath` do feed; gate CN via `resolverContextoEngajamento` + `podeEngajarPostVisivel`; notifs em `after()` |
| Publish + nav-back (2026-07-17) | Prepend otimista (`comunidade:post-publicado`); sem `revalidatePath`/`router.refresh` no publish; Descobrir unificado; chrome no layout + `ComunidadeFeedBootstrap` + `React.cache` salas/tenant; measure e2e |
| Busca (2026-07-17) | Fix `GROUP BY` (não `DISTINCT`+`ORDER BY similarity` / `42P10`); `modo=rapida` no typeahead; `postIncludeBusca`; erro ≠ vazio — `docs/data/modulo-comunidade.md` § busca |

**Pós-deploy obrigatório:** `db:push` (timeline + índices), `db:enable-pg-trgm`.

**Teto zero-custo:** ~85–95% do valor do plano capturado sem domínio. F4 CDN
espera domínio (`docs/ops/cloudflare-cdn.md`). E/F só com métrica.

### 5.7 Animações Motion (2026-07)

Pacote [`motion`](https://motion.dev/) v12 com `LazyMotion` + presets em
`apps/web/src/lib/motion-presets.ts`. Hoje montado em `/portal/comunidade`
(`MotionShell`); guia completo para replicar em Loja, Onboarding e demais módulos:
**`docs/frontend/motion.md`**.

**Regras:** usar `m` (não `motion`) dentro do shell; presets centralizados;
`reducedMotion="user"`; listas SSR via `MotionReveal` ou wrappers client;
portais no `body` para lightbox/dock.

**Fora do escopo do plano concluído** (evolução arquitetural, não “Fase 6
grátis”): PgBouncer/Accelerate, Redis, WebSocket, SWR/React Query global,
migração Vercel+Neon, virtualização de listas longas. Ver §5.4 para critérios
de quando pooler faria sentido.

**Passo manual opcional (infra, zero código além de headers):** Cloudflare Free
na frente do domínio — cache de `/_next/static` e Brotli. Runbook:
**`docs/ops/cloudflare-cdn.md`**. Headers imutáveis em `apps/web/next.config.ts`.

Agente responsável por auditorias e novos recortes: `performance` (ver
`docs/agents/README.md`).

**Rodada complementar (2026-07-10, pós-plano):** ofensores residuais atacados
sem mudança de arquitetura:
- `portal/comunidade/page.tsx`: 3 queries do shell (perfil, eventos do composer,
  badges) paralelizadas em `Promise.all` (antes em série).
- `loading.tsx` criados nas 7 rotas admin que ficavam em branco na navegação
  (membros, socios, eventos, sedes, loja, hierarquia, configuracoes).
- `admin/page.tsx` (dashboard): dividido em `DashboardKpis` + `DashboardListas`,
  cada um em `<Suspense>` — o first byte não espera mais as 12 queries.
- `<img>` cru → `next/image` gated por `canOptimizeImageUrl` em perfil (banner,
  fotos, destaques), videos-grid e avatares das listas admin. Fallbacks `<img>`
  para hosts fora de `remotePatterns` e previews locais (blob) permanecem por design.
- `next.config.ts`: `images.formats` avif/webp; `staleTimes.dynamic` 60→120;
  `@next/bundle-analyzer` integrado (script `build:analyze`, gate `ANALYZE=true`).
- Polling: novo `useVisibleBackoffInterval` (`use-visible-interval.ts`) — dobra o
  intervalo em inatividade até um teto. Aplicado em `sala-chat` (4s→15s inline)
  e `mensagem-thread` (4s→15s); `sala-enquete` 3s→8s (agora com gate de
  visibilidade), `sala-participantes` 5s→15s, full-sync do chat/thread 15/20s→30s,
  navbar-context 30s→60s.
- **React Compiler avaliado e revertido**: habilitá-lo ativa regras de lint
  (`react-hooks/purity`, `set-state-in-effect`, `refs`) que reprovam padrões
  pré-existentes em ~10 arquivos. Reavaliar após saneamento desses padrões.

### 5.7 Dois bugs achados via a captura visual (2026-07-10)

**Bug 1 — CTA invisível em `/entrar` e `/entrar/criar-conta` (corrigido).**
Causa raiz: `ThemeProvider` (`packages/ui/src/services/theme.tsx`) gravava
`--color-primary` com o hex puro do tenant em vez de canais RGB — quebrando
**todo** consumidor de `rgb(var(--color-primary))` no app assim que o JS do
cliente rodava (não só o botão do login: badges, inputs, `sala-enquete`,
`sala-chat`, `meet-room.css` etc. usam o mesmo padrão). Corrigido na origem
(usa o `hexToRgb` já existente, agora exportado por `@torcida/ui`) + nos 3
pontos que reinjetavam `--color-primary` localmente com hex puro
(`entrar-senha-form.tsx`, `criar-conta-form.tsx`, `cadastro-form.tsx`).
Achado original: `ThemeProvider` no `app/layout.tsx` raiz não recebia `tenant`.
**Atualizado 2026-07-17 — módulo Design:** a aplicação do tema do tenant passa
por `TenantDesignBridge` nos layouts portal/admin (`Tenant.design` JSON +
`corPrimaria`), via `applyTenantDesign` / CSS crítico. O root `ThemeProvider`
continua sem tenant (só dark/light); o bridge sobrescreve as CSS vars do host
ativo. Ver `docs/data/modulo-design.md`.

**Bug 2 — sessão de e-mail/senha "não persistia" (não era bug de app).**
Investigação longa (Turbopack vs. webpack, matcher do middleware, `redirect:
false` + hard navigation) até achar a causa real via `response.headersArray()`
do Playwright: `ROOT_DOMAIN=lvh.me` estava ativo em `apps/web/.env.local`
enquanto se testava em `localhost:3000` — o cookie de sessão saía com
`Domain=.lvh.me`, que o navegador descarta silenciosamente fora desse domínio
(mesma causa-raiz de uma sessão anterior de debug, reintroduzida ao reiniciar
o servidor manualmente). **Não é bug de código** — `ROOT_DOMAIN` e
`localhost:3000` são incompatíveis por design (cookie de sessão cross-subdomínio
exige o domínio real). `.env.local` agora documenta isso inline. Se voltar a
acontecer: suspeitar primeiro de `ROOT_DOMAIN` antes de investigar
NextAuth/Next.js.

### 5.8 Catálogo nacional de torcidas conhecidas — `TorcidaConhecida` (2026-07-12)

Catálogo global (não multi-tenant, como `Afiliacao`) de organizadas conhecidas do
Brasil. A partir de 2026-07-13, cada entrada **vira também um `Tenant` vazio**
(provisionado por seed) — a plataforma já “conhece” a torcida antes do
presidente assumir; o super-admin transfere o cargo owner quando a diretoria
aderir.

- **Fonte de dados**: scraper determinístico de `organizadasbrasil.com`
  (`packages/db/scripts/scrape-organizadas.mjs`, 27 estados) grava o dataset
  versionado `packages/db/src/data/torcidas-conhecidas.js` (546 registros:
  nome, clube, fundação, sede, sub-sedes, lema, site, cidade/UF, logo, fonte).
  Fonte colaborativa → **referência a confirmar** (datas/grafias variam; há
  extintas/renomeadas/banidas). `fundacao` é texto livre; flag `ativa` para
  curadoria futura. Perfis âncora e relações seguem em `docs/knowledge/`.
- **Pipeline catálogo**: `seed:torcidas-conhecidas`
  (`scripts/seed-torcidas-conhecidas.js`) — upsert idempotente por slug,
  resolve/cria a `Afiliacao` do clube, logos no Cloudinary
  `torcida/catalogo/logos/<slug>`. **Não confundir** com `seed:torcidas-nacional`
  (dataset curado `torcidas-brasil.js`, ~30 âncoras) nem com
  `seed:torcidas-tenants` (cria os 546 tenants a partir do catálogo no banco).
- **Pipeline tenants**: `seed:torcidas-tenants`
  (`scripts/seed-torcidas-tenants.js`) lê `TorcidaConhecida` com clube
  resolvido, cria/atualiza `Tenant` + cargos de sistema + `Sede` principal,
  linkando `Tenant.torcidaConhecidaId` (único). Idempotente; reutiliza tenants
  existentes (ex.: `pde-gavioes-fiel`) por nome+afiliacao normalizados. Sem
  owner — transferível via super-admin (`transferirOwnerAction`).
- **Modelo**: `TorcidaConhecida` (`@@map("saas_torcidas_conhecidas")`) com
  relação opcional a `Afiliacao`. `Tenant.torcidaConhecidaId` liga tenant aos
  dados ricos do catálogo (fundação, lema, sede, logo). `PerfilTorcedor.torcidaConhecidaId`
  permanece no schema para matching futuro, mas o onboarding não grava mais
  (torcidas são tenants reais).
- **Onboarding**: `getTorcidasPorAfiliacao` lista tenants ativos do clube; o
  usuário solicita entrada (fica `PENDENTE` até liderança/presidente aprovar).
  Subsede/PDE ativa antes do presidente: `Sede.tenantId` opcional no modelo.
- **Super-admin**: `/super-admin/torcidas` — seletor buscável para transferir
  owner, destacando torcidas sem presidente.
- **Fora de escopo (fase 2)**: notificar "sua torcida entrou na plataforma",
  subsedes/PDEs individuais do catálogo, alianças em massa, curadoria
  ativa/extinta, fluxo self-service "reivindicar torcida".

### 5.9 Escudos de `Afiliacao` — pipeline Soccer Wiki (2026-07-13)

Preenchimento de `Afiliacao.escudoUrl` para o grid de clubes no onboarding.
Detalhe operacional e **plano de progresso** da inteligência de casamento:
`docs/data/escudos-afiliacoes.md`.

- **Hospedagem**: Cloudinary `torcida/catalogo/escudos/<slug>.png` (PNG transparente).
- **Scripts**: `seed:afiliacoes` (TheSportsDB), `seed:migrate-escudos-cloudinary`
  (assets locais), `seed:escudos-soccerwiki` (Soccer Wiki), `seed:escudos-thesportsdb`
  (TheSportsDB só para sem escudo).
- **Casamento**: `inferirUfDoNome`, `saoMesmoClube`, `chaveGrupoClube`, bloqueio de
  homônimos, score ≥ 90, atribuição 1:1. Relatório versionado em
  `packages/db/src/data/escudos-soccerwiki-report.json`.
- **Estado (2026-07-13)**: 255/325 com escudo (Fases A–F); 70 pendentes.
  Catálogo Ogol: 9.858 clubes; Soccer Wiki esgotado (246 clubes).
- **Regra de produto**: escudo errado é pior que vazio — matching conservador;
  placeholder neutro no grid (`EscudoClube`) quando sem `escudoUrl`.

### 5.10 Estimativa de torcedores / base digital (2026-07-13)

Metadados no card de clube do onboarding (`ClubeOnboardingMeta`): estimativa
pública + contagens da plataforma. Detalhe: `docs/data/torcedores-estimados.md`;
inteligência de fontes: `docs/knowledge/futebol-dados-publicos.md`.

- **Fonte Top 50**: IBOPE Repucom — Ranking Digital (soma inscritos oficiais em
  Facebook, X, Instagram, YouTube, TikTok). **Offline only** — nunca em runtime.
- **Campos `Afiliacao`**: `torcedoresEstimados`, `torcedoresEstimadosFonte`,
  `torcedoresEstimadosTipo` (`IBOPE_DIGITAL` | `LIMITE_ATE`).
- **Tier IBOPE**: total publicado (~35 clubes com valor exato Jun/2026 + integrantes
  Top 50 sem total → piso 471.612 = menor publicado, Botafogo-PB 49º).
- **Tier LIMITE_ATE**: clubes sem dado próprio → teto **dinâmico** (menor IBOPE curado
  × menor clube na plataforma); copy “até X torcedores ou menos”. Tier **PLATAFORMA**
  quando há contagem real no SaaS. **Não** usar 10 mil fixo.
- **Dados da plataforma** (separados): sócios/torcedores + online via
  `User.ultimoAcessoEm` (heartbeat throttled no callback de sessão, janela 15 min),
  agregados por clube canônico (`saoMesmoClube`) em `onboarding-clube-stats.ts`.
- **Scripts**: `seed:torcedores-estimados`, `test:torcedores-estimados`.
  Dados: `ibope-ranking-digital.js`, `torcedores-estimados.js` (`resolverTorcedoresEstimados`).
- **Estado (2026-07-13)**: 318 afiliações seedadas (44 IBOPE, 274 limite ≤10 mil).
- **Manutenção**: coleta mensal → `ibope-ranking-digital.json` via `coleta:ibope-ranking` → re-seed.
- **Onboarding Fase 3**: filtro UF no passo clube; comunidade nacional para torcedor global
  sem torcida na plataforma (`comunidade-nacional-shell.tsx`).

### 5.11 Agenda unificada + `Partida` (2026-07-17)

Hub único de eventos (decisão produto **1A** + fases **2C**). Detalhe:
`docs/data/modulo-eventos.md`. Fontes de jogos / anti-padrão Google Sports:
`docs/knowledge/futebol-dados-publicos.md`.

- **Superfícies:** `/admin/eventos`, `/portal/eventos`; redirects de
  `/portal/caravanas*` e `/portal/bateria*`. Vistas lista / semana / mês.
- **`Evento`:** `serieId` (recorrência semanal + edit/delete esta\|futuras),
  `partidaId`, `lat`/`lng`, `capacidade` (+ waitlist `LISTA_ESPERA` FIFO por
  `EventoRsvp.criadoEm`), `fotoUrl`.
- **`Partida`:** global por `Afiliacao` (sem `tenantId`); mando/status enums;
  cadastro manual / partida rápida. Sync API externo = decisão aberta #7.
- **Ops:** cron lembretes; ICS; mural `?eventoId=`; QR + fila offline
  (`checkin-offline.ts`); mapa OSM embutido.
- **Não fazer:** scrapar SERP Google Sports; tratar widgets Sofascore como ingestão
  de `Partida`.


- ~~**Item 16**~~ — ✅ Resolvido (2026-07-06): ver seção 5.3.
- ~~**Auditoria de ações de super-admin (prioridade de segurança, 2026-07-07)**~~
  — ✅ Feito (2026-07-07): `criarTenantInicial` e `atribuirOwnerAction` agora
  gravam `AuditLog` (sem mudança de schema). Em `criarTenantInicial`, dentro da
  transação (client `tx`): `TENANT_CRIADO` (entidade `Tenant`, `entidadeId:
  t.id`, `detalhes: { slug, nome }`) e `OWNER_ATRIBUIDO` (entidade `User`,
  `entidadeId: session.user.id`). Em `atribuirOwnerAction`, `OWNER_ATRIBUIDO`
  gravado apenas quando o owner é de fato atribuído (dentro do `if (!jaOwner)`),
  para não poluir chamadas idempotentes; `detalhes` inclui `rolesCriadas` quando
  houve criação de cargos de sistema. Nomes seguem o padrão existente
  (`TENANT_PERFIL_ATUALIZADO`, `ROLE_CRIADO`).
- Próximo passo natural de feature: detalhar `resolveVisibility` (item 3) —
  visibilidade cross-tenant na hierarquia sede/subsede/PDE.
- **Item 26 — checklist pra quando houver domínio próprio de produção**
  (usuário ainda não comprou um):
  1. Definir `ROOT_DOMAIN=seudominio.com` nas env vars do serviço
     `torcida-web` no Railway.
  2. Configurar DNS wildcard (`*.seudominio.com` → apontar pro Railway,
     conforme instrução exibida ao adicionar Custom Domain na aba do
     serviço).
  3. Adicionar o domínio wildcard nas configurações de Custom Domain do
     Railway (o certificado SSL costuma ser provisionado automaticamente,
     confirmar na hora — pode exigir plano pago dependendo do momento).
  4. Registrar as novas redirect URIs de produção (`https://<qualquer
     subdomínio>.seudominio.com/api/auth/callback/discord` e `.../google`)
     nos consoles de desenvolvedor do Discord e do Google — OAuth exige URI
     exata, não aceita wildcard; se o login sempre passar pelo domínio raiz
     antes de redirecionar (cookie compartilhado já cobre isso), só a URI do
     domínio raiz precisa estar cadastrada.
- ~~**Comunidade — redesenho UI/UX (rede social)**~~ — ✅ Feito (2026-07-08):
  `/portal/comunidade` reconstruída como hub social de 3 zonas (trilha de
  identidade+navegação, feed central, trilha de notícias+sugestões), com "Ao vivo
  agora" trazendo as salas ativas ao topo, composer convidativo, comunicados
  integrados ao fluxo e cards de post no padrão rede social. Engajamento deixou de
  usar `window.prompt/alert`: `PostEngagement` agora tem contadores reais, reação
  otimista e comentário inline. `feed.ts` passou a projetar `totalReacoes`,
  `totalComentarios` e `minhaReacao` (helpers `postInclude`/`projetarPost`
  exportados; sem mudança de schema). Novos: `components/portal/avatar.tsx`,
  `formatRelative` em `lib/format-datetime.ts`. Salas/Perfil/Solicitações
  alinhados ao mesmo visual. `marcarComunicadosLidos` no feed virou best-effort
  (try/catch) para não derrubar a página.
- **Item 27 — Mensageria da comunidade (plano fechado 2026-07-08; ✅ M1 entregue 2026-07-10).**
  M1 (DM 1×1 + Grupos) em produção: schema aplicado via `db:push`,
  `repair-system-role-permissions` rodado (6 cargos corrigidos), verificação
  E2E 15/15 contra o servidor real (login, DM, grupo, polling, não-lidas,
  bloqueio, proteção de último admin, rejeição de anexo hostil).
  Decisões fechadas com o usuário (2026-07-08):
  - **Tempo-real: polling** (~2s, mesmo padrão do `SalaChat` das salas de
    vídeo) — zero infra nova; evoluir p/ SSE/serviço só com demanda real.
  - **Alcance de DM: mesmo tenant + aliados** (`self/ancestor/descendant/allied`
    via `canFollowUser`/visibilidade; `unrelated` bloqueado).
  - **Recorte M1: DM 1×1 + Grupos juntos**; Comunidades temáticas ficam p/ M3.
  Modelo de dados (novo domínio, aditivo — NÃO reusa `Post`/`Comentario`):
  `Conversa` (tipo `DIRETA|GRUPO`, tenantId de contexto, nome/descricao/avatar
  p/ grupo, `atualizadoEm` bumpado a cada mensagem p/ ordenar inbox),
  `MembroConversa` (papel `ADMIN|MEMBRO`, `ultimaLeituraEm` p/ não-lidas,
  silenciada, saiuEm), `MensagemDireta` (conteudo, `midiaUrls[]` reusando o
  pipeline Cloudinary/embeds/stickers, respostaA, editadaEm, removidaEm),
  `Bloqueio` (bloqueador/bloqueado) e `DenunciaMensagem` (a `Denuncia`
  existente é acoplada a Post). **Leitura chaveada por participação**
  (`MembroConversa`), não por tenantId — é o que permite DM cross-tenant com
  aliado; `tenantId` na Conversa é contexto/auditoria.
  Permissões novas: `MESSAGES_SEND` + `GROUPS_CREATE` (cargo `member`),
  `MESSAGES_MODERATE` (moderação) — exige rodar
  `repair-system-role-permissions` em produção (mesmo caso do
  `community:manage`, item 18). O chat ao vivo das salas (`SalaChat`/
  `MensagemReuniao`) permanece separado — efêmero, dentro da sala.
  Superfícies M1: `/portal/mensagens` (inbox + thread, composer rico
  reusado), badge de não-lidas na navbar, botão "Mensagem" no perfil.
  M2/M3 (fases seguintes): transferência de admin de grupo, Comunidades
  temáticas (canais de admin, visibilidade pública/aliada) e busca.
  **✅ M2 entregue 2026-07-10** (transferência de admin). **✅ M3 entregue
  2026-07-10**: `TipoConversa.CANAL`, perfil institucional por tenant
  (`/portal/comunidade/unidade/[tenantId]`), canal oficial auto-provisionado,
  comunidades temáticas com visibilidade hierárquica/aliados, busca de canais
  e unidades, permissão `channels:manage`.
- **Item 28 — Onboarding, Torcedor global e Rivalidade (plano fechado 2026-07-11).**
  Spec completa em `docs/data/spec-onboarding.md`. Objetivo: ao logar, o usuário
  passa por onboarding que garante direcionamento e **segregação anti-infiltrado**
  (escolhe clube → região → torcida ou "só torcedor" → sócio/torcedor). Decisões
  fechadas com o usuário: **(1)** ponto de entrada é um **hub central** no
  domínio-mãe (hoje o app é resolvido só por subdomínio via `getTenantFromHost`);
  **(2)** torcedor vira **perfil global** (`PerfilTorcedor` ligado ao `User`,
  independe de tenant) — `SaasMembro` continua sendo só o vínculo com uma torcida;
  **(3)** **rivalidade** modelada em nível de clube (`Afiliacao`) com override
  torcida×torcida (`Rivalidade` + enum `OrigemRivalidade`), semeada da tabela de
  `docs/knowledge/aliancas.md`; **(4)** base de clubes por **seed nacional curado**
  de `docs/knowledge/diretorio-nacional.md` + escudos versionados no projeto (API
  gratuita só na coleta, nunca em runtime). Segregação: **dois níveis de feed** —
  torcedor (público nacional, default até aprovação) vs sócios (gated por vínculo
  ATIVO). Regra de relacionamento: torcedores se relacionam cross-torcida livremente
  (até rivais); **única restrição é sócio×sócio de torcidas rivais** (revisável).
  Achado no caminho: **bug** em `apps/web/src/lib/feed.ts:537` (`status === 'ATIVO'`,
  valor inexistente no enum `StatusMembro`) — a visibilidade `TENANT` de posts hoje
  nunca libera; corrigir junto. Fases: 1=MVP hub+perfil+gating de feed;
  2=rivalidade+departamento; 3=enriquecimento por API. Validação prévia pelos
  agentes `data-model` e `rbac` antes de codar via Fable.
