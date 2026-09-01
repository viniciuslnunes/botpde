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
    mesmo banco usado por `torcida-web`** — mesmas credenciais e mesmo
    database, não é addon duplicado, sem custo morto aqui. Desde 2026-07-19
    tanto `bot-pde` quanto `torcida-web` usam o host **interno**
    (`postgres.railway.internal`) via private networking; o proxy público
    (`*.proxy.rlwy.net`) ficou só para acesso externo (scripts/`db:push`
    locais). A troca resolveu a rajada de `PrismaClientKnownRequestError:
    Can't reach database server` (P1001) que vinha do proxy público —
    resiliência adicional (timeouts + `withDbRetry` em leituras) em
    `packages/db/src/index.js` e `packages/db/src/with-db-retry.js`.
  - `bot-fivem` — produto anterior/paralelo, ainda ativo, sendo migrado
    aos poucos para o web/mobile atual.
- Hobby Plan: $5/mês incluídos, uso atual ~$2.45/mês estimado — dentro da
  margem, sem necessidade de trocar de provedor no MVP.
- **Plano de investimento em infra (2026-07-23):** faixas A–D (fundação →
  escala ads), alinhadas a demo/1ª carga e modelo de receita via publicidade —
  ver `docs/ops/plano-investimento-infra.md`. Não migrar provedor sem critério
  §5.4 e medição (`PERF_METRICS`).

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
| 22 | ~~Aplicar `resolveVisibility` em mais telas~~ | ✅ Feito (2026-07-05) para comunidade e eventos; ✅ Feito (2026-07-10) para loja; ✅ Recorte 2026-08-27: listagem do portal segue o tenant ativo (`escoparLojaAoPortalAtivo`) — Super Admin não leva o catálogo da torcida-casa ao trocar de canal (`docs/data/modulo-loja.md`, §5.28) | — |
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

**Complemento medido em 2026-09-01 — o lado da escrita também está descoberto.**
A regra acima cobre a **leitura**. Testando durante o módulo de moderação,
injetamos de propósito um campo inexistente no `data` de um
`db.<modelo>.create(...)` e rodamos `tsc --noEmit`: **passou limpo**. Ou seja,
neste schema o `tsc` não é rede de segurança para payload de escrita —
campo com nome errado, campo que não existe e valor de enum inválido passam
pela compilação e só quebram em runtime, contra o banco.

Consequências práticas:

- Ao escrever `create`/`update`/`upsert` novos, **conferir campo a campo e
  valor de enum contra `schema.prisma`** — não confiar no editor nem no CI.
- Erro de payload só é pego por auditoria de fluxo (`audit:*`, que roda contra
  banco real) ou por teste de integração. É o principal argumento para as
  auditorias existirem: elas cobrem o que o `tsc` não cobre.
- Vale em dobro logo depois de mudar `schema.prisma`, quando o
  `prisma generate` pode não ter rodado — o código velho continua compilando.

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

**Invariante de tenant em mutações (trava R2 da governança hierárquica).** O
`tenantId` de qualquer Server Action de mutação vem **sempre** do `tenant.id`
retornado pelo assert (`assertPermission`/`assertAnyPermission`), **nunca** de um
`tenantId` recebido pelo input (formData/Zod). É o que impede um ator de tenant
descendente (subsede/PDE) de mutar dados do tenant ancestral (Sede) — a leitura do
tenant ativo é derivada do vínculo de sócio aprovado do próprio ator
(`getActiveTenant` em `lib/tenant.ts`), não do request. Exceções conscientes e
auditadas: fluxos de **super-admin** (cross-tenant por definição, com gate
`isSuperAdminEmail`) e o **self-service pré-membership** do onboarding
(`solicitarVinculo`/`registrarInteresseUnidade`, onde o `tenantId` de input é o
alvo que o próprio usuário escolhe e só cria registro PENDENTE do próprio usuário).
Auditoria de 2026-07-20 (Fase 0 da governança hierárquica) não achou nenhuma
mutação que viole o invariante. Ver `docs/data/proposta-governanca-hierarquica.md`.

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
  `use-persist-bar-visibility.ts` + `StickyPersistBar` (admin/loja/onboarding/
  design — Salvar/Cancelar fixos; **não** na Comunidade). Ao sair de `locked`
  (dirty→limpo: salvar, descartar ou reverter campos), a barra **some na hora**
  (`setVisible(false)`); não permanece no visual unlocked/cinza. Detalhe em
  `docs/frontend/motion.md`.

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

### 5.6.2 Bundle de entrada — barrel do `@torcida/types` (2026-08-12)

Método, números completos e backlog: **`docs/data/bundle-entrada-performance.md`**.

Ferramenta certa é `next experimental-analyze -o` (Turbopack, nativo), **não**
`build:analyze`: `@next/bundle-analyzer` é plugin de webpack e o Next 16 já
constrói com Turbopack por padrão (`next/dist/lib/bundler.js`: sem flag →
Turbopack), então o script é no-op.

Medido no bundle de entrada compartilhado (o que todo usuário baixa):

| | antes | depois |
|---|---|---|
| **Total client** | 445,9 KB gz | **397,4 KB gz** (−48,5, −10,9%) |
| `@torcida/types` | 29,4 KB (30 módulos) | 7,6 KB (2 módulos) |
| Sentry client | 78,2 KB | 51,7 KB |

Causa: `packages/types/src/index.js` é barrel de 37 `export *` e o pacote só
expunha `"."`. `ThemeProvider`/`PermissionProvider` (`packages/ui/src/services/`)
estão no **root layout** — importar do barrel arrastava os 37 módulos para toda
página. Correção: subpath export (`"./*": "./src/*.js"`) + import direto
(`@torcida/types/design`, `/permissions`).

**`optimizePackageImports` não resolve isso** — medido byte a byte, zero efeito:
ele não reescreve barrel de `export *`. Em client component novo, importe o
módulo direto, não o barrel. `zod` (14,7 KB gz) continua no bundle porque
`design.js` o usa e `resolveTenantDesign` roda no `ThemeProvider`.

**Sentry: tracing do client removido em build (−26,5 KB gz).** O
`webpack: { treeshake: … }` passado a `withSentryConfig` só roda em
`setupTreeshakingFromConfig` no caminho **webpack** — sob Turbopack é no-op, e
filtrar integração em runtime não remove byte nenhum (o import é estático). O
que funciona é `compiler.define` (next.config.ts), que o SWC/Turbopack aplica:
`__SENTRY_TRACING__: false` derruba o guard em `@sentry/nextjs`
(`client/index.js`) como código morto. Medido: **só o client** — tracing no
servidor ficou intacto (111,9 KB gz antes e depois), então o APM de produção
continua. `tracesSampleRate` saiu de `instrumentation-client.ts` por ter virado
config morta.

**Tentado e descartado — não repetir:** converter os 49 client components que
importam o barrel `@torcida/types` para subpath (codemod, `tsc` e 1129 testes
verdes) **não** melhorou nada: bundle de entrada ficou idêntico (397,4 KB) e o
total emitido em `.next/static/chunks` **subiu** 182 KB (6,34 → 6,52 MB, 171 →
174 arquivos) — imports estreitos fragmentam chunk e pioram o compartilhamento.
O ganho do barrel está só onde o módulo entra no **root layout**; em rota,
Turbopack já resolve. Revertido.

Nota de método: `next build` no Next 16/Turbopack **não** imprime mais First
Load JS por rota, e o `experimental-analyze` cobre o grafo de entrada (16
arquivos client), não os chunks por rota. Para rota, medir bytes em
`.next/static/chunks`.

**Parar aqui é a decisão.** Dos 397,4 KB, 252,9 são Next/React 19 (piso). O que
resta de controlável — Sentry erro/core (51,7), `globals.css` (28,6), `zod`
(14,7), providers do root layout (33,9) — tem razão risco/ganho ruim. O gargalo
do produto segue sendo query, não bundle: §5.6/§5.6.1 e
`docs/data/modulo-comunidade-performance.md`. Próximo passo de infra é o CDN,
que espera domínio (`docs/ops/cloudflare-cdn.md`).

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
ativo. **Identidade cromática (2026-07-17):** sucesso default azul (não
emerald); verde só se for identidade; paletas sugeridas no contexto
torcida→clube (3 swatches); neutros sem saturação artificial; nav/sidebar
ativos e badges usam `--color-*-fg` (`corMarcaLegivel`). Domínio:
`docs/knowledge/identidade-visual-cores.md`. Spec:
`docs/data/modulo-design.md`.

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
  owner — atribuível em `/super-admin/liderancas` (`lib/lideranca.ts`, §5.21).
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
  cadastro manual / partida rápida. Sync API externo = **decisão #7 fechada**
  (API-Football pago) — ver §5.26 e `docs/data/integracao-api-football.md`.
- **Ops:** cron lembretes; ICS; mural `?eventoId=`; QR + fila offline
  (`checkin-offline.ts`); mapa OSM embutido.
- **Não fazer:** scrapar SERP Google Sports; tratar widgets Sofascore como ingestão
  de `Partida`.

### 5.12 Admin UI Kit + inteligência administrativa (2026-07-22)

Refactor da área admin em fases — **todas entregues (1–5)**. Guia completo:
`docs/frontend/admin-ui-kit.md`.

- **Kit** em `apps/web/src/components/admin/ui/` (`AdminPageHeader`, `StatCard`/
  `KpiGrid`, `StatusBadge`, `TableShell`, `TablePagination`, `InsightSection`) —
  **compõe** `@torcida/ui`, nunca duplica; vive em `apps/web` porque depende de
  Motion. Fica proibido reimplementar header/stat card/badge/paginação inline em
  page admin nova.
- **`AdminTabs`** (2026-07-27): padrão único de tabs do admin — URL-driven via
  `Link`/`buildAdminHref` (funciona sem JS), ARIA real de tabs, roving tabindex
  por teclado (setas/Home/End). Substituiu implementações locais divergentes
  (`AdminMembrosTabs`, pílulas hand-rolled de `admin/socios`); piloto migrado em
  `admin/configuracoes` (seções de settings) e `admin/socios` (barra de status).
  Uso: seções de conteúdo mutuamente exclusivas — não para filtros que se
  combinam com paginação/busca. Guia: `docs/frontend/admin-ui-kit.md`.
- **Tabs de rota — o hub vira shell do módulo** (2026-07-29): módulo com
  sub-rotas (Bar, Loja) tinha navegação duplicada — seção longa no menu lateral
  **mais** fileira de botões no hub, que no Bar sequer estava no menu. Agora o
  `layout.tsx` do segmento monta `AdminPageHeader` + `AdminModuleTabs` (tab =
  rota, ativa resolvida pelo `usePathname()`; `matchPaths` cobre rotas que não
  aparecem na barra) e o menu guarda **uma** entrada por módulo. Página
  imersiva de tela cheia fica fora do shell via route group — PDV em
  `admin/bar/pdv`, resto em `admin/bar/(modulo)/` (a URL não muda). Deep links
  antigos continuam válidos.
  - Hub de módulo não acumula mais insights: Bar e Loja ganharam a etapa
    `desempenho`, e o form de criar deixou de ficar empilhado no meio da página
    (disclosure próprio ou `AdminCreateDisclosure`).
- **Registro único de módulos + badge por rota** (2026-07-30): a wave 1 deixou a
  mesma verdade copiada em quatro arquivos (`menu.js`, layout do módulo,
  `notificacoes-menu-badges.ts`, `notificacoes-routing.ts`) — foi o que quase
  apagou quatro badges em silêncio ao encolher o menu do Bar. Fechado assim:
  - **`ADMIN_MODULOS`** em `packages/types/src/menu.js` é a fonte única de
    módulo → etapas (id, label, href, `permissao`, `matchPaths`). Ícone e
    contagem **não** entram: componente React não atravessa Server→Client. O
    layout monta a barra com `montarTabsModulo(moduloId, permissoes, enfeites)`
    (`apps/web/src/lib/admin-modulos.tsx`).
  - **Tab filtrada por permissão**: `tabsPermitidasDoModulo` esconde a etapa que
    o usuário não pode abrir, e `primeiraTabPermitida` dá o destino de quem não
    tem a etapa raiz — `store:view_orders` cai em Pedidos, `news:curate` cai em
    Notícias, em vez de ser expulso para `/admin`. Continua **não** sendo
    controle de acesso: cada rota-tab mantém seu `assertPermission`.
  - **Badge resolve por rota, não por id de menu**: `ROTA_POR_TIPO` guarda a
    rota onde a pendência se resolve e `resolverMenuIdDeRota` casa o prefixo
    mais longo em `ADMIN_MENU`. Promover uma rota a tab passa a **subir** o
    badge para a entrada do módulo em vez de zerá-lo. Invariantes cobertos em
    `lib/__tests__/admin-modulos.test.ts` (rota existe, uma entrada de menu por
    módulo, raiz = primeira tab, teto de 6 etapas) e em
    `notificacoes-routing.test.ts` (nenhuma rota de badge órfã).
  - **Regra de corte**: tab = etapa do mesmo módulo, mesma entidade-raiz,
    deep-linkável, alternância frequente. Não viram tab: tela imersiva (PDV),
    detalhe de item (`[id]`), criação (disclosure) e leitura cross-módulo
    (Relatórios). Passou de ~6 tabs, são dois módulos.
  - **Módulos convertidos**: Comunidade (`Visão geral · Comunicados · Mural ·
    Moderação · Notícias`, menu 5→1) e Financeiro (`Lançamentos · Evolução ·
    Cobranças · Planos`, menu 3→1). `/admin/cobrancas` e
    `/admin/planos-associacao` viraram `permanentRedirect` preservando query —
    **obrigatório**, porque `Notificacao.link` já gravado no banco aponta para
    a URL antiga (`/admin/cobrancas?status=VENCIDA`). `?tab=evolucao` do
    Financeiro também redireciona para a rota nova.
- **Módulo em route group, quando as etapas não têm prefixo comum**
  (2026-07-30): a seção Governança tinha 8 entradas de menu misturando
  organização interna, rede externa, leitura e configuração. Virou 3 —
  **Estrutura**, Alianças, Relatórios, **Plataforma**:
  - **Estrutura** (`admin/(estrutura)/`): `Visão geral · Unidades ·
    Hierarquia · Solicitações` sobre `/admin/torcida`, `/admin/sedes`,
    `/admin/hierarquia`, `/admin/afiliacoes`. **Route group, não move de
    rota**: as quatro URLs são irmãs, mover exigiria quatro redirects (e
    `SOLICITACAO_UNIDADE_CRIADA` tem link gravado). Regra geral: etapas com
    prefixo comum → sub-rota; etapas irmãs → route group.
  - **Plataforma** (`admin/(plataforma)/`): `Geral · Transparência ·
    Integrações · Identidade · Acessos · Auditoria`. As 7 seções `?tab=` de
    Configurações se dissolveram nas três primeiras etapas — Transparência
    junta balanço e hierarquia visível, que respondem à mesma pergunta (o que
    o portal expõe). Sem barra de tabs empilhada: cada etapa empilha
    `ConfigSectionCard`. `?tab=discord|balanco|hierarquia` redireciona.
  - **Consequência no resolvedor**: com route group, a rota da etapa não
    compartilha prefixo com a raiz do módulo, então `resolverMenuIdDeRota`
    passou a consultar `ADMIN_MODULOS` **e** `ADMIN_MENU` competindo pelo
    prefixo mais longo — não por precedência fixa. Precedência fixa em módulo
    fazia `/admin/bar/pdv` casar com a tab `/admin/bar` e o badge de
    divergência de turno migrar do PDV para o módulo (pego pelo teste de
    invariante, não em produção).
  - **Estúdio de Design sob shell**: `DesignForm` tem duas colunas com scroll
    próprio e dependia de `h-[calc(100dvh-3.5rem)]`. Sob o shell de tabs a
    altura não pode mais assumir a viewport inteira — passou a `xl:h-[70dvh]`
    com piso, sem depender da altura de header/tabs.
  - **Menu**: 24 entradas antes da wave 1 → **14** agora.
- **Detalhe sob shell de módulo + seções do menu** (2026-07-30, fecha o
  refactor):
  - **`AdminDetailHeader`** no kit: página de detalhe dentro de um módulo
    (`/admin/sedes/[id]` em Estrutura) empilhava **dois** cabeçalhos
    full-bleed. A versão de detalhe não tem faixa de superfície — o header do
    módulo continua sendo o do topo, e a identidade da entidade vive dentro do
    painel, com back-link explícito.
  - **Tabs internas onde ganham**: `eventos/[id]` (`Cockpit · Embarque ·
    Editar`) e `torcida/unidade/[id]` (`Financeiro · Agenda · Bar · Membros` —
    aqui a aba também corta 5 leituras por render para as da aba visível).
    `sedes/[id]` e `membros/[id]` **não** ganharam tabs: o form de sede já tem
    stepper próprio e o de membro tem três blocos. Linha ≠ carga cognitiva.
  - **`ADMIN_MENU_SECOES` reagrupado** por natureza do trabalho (Pessoas ·
    Operação · Finanças · Governança): com o módulo virando uma linha, cinco
    seções tinham um único item repetindo o cabeçalho ("Loja › Loja"). Coberto
    por invariante para não voltar.
- **Charts SVG próprios** (zero dependência) em `components/admin/charts/`
  (`Sparkline`, `MiniBarChart` c/ série dupla, `DonutChart`, `TrendDelta`).
  Fronteira RSC→client: props só primitivas (nunca `Decimal`/`Date`); funções
  não atravessam — prop `formato` serializável.
- **Insights on-the-fly, sem snapshots/tabelas novas**: fetch por range usando
  índices existentes + bucketing **em JS, fuso `America/Sao_Paulo`**
  (`lib/admin-insights.ts`) — nunca `date_trunc` SQL em UTC. Libs por módulo
  com `'server-only'` + `cache()` + tipos explícitos + Decimal→number.
- **`/admin/relatorios`**: primeira superfície da permissão `reports:view`
  (existia no RBAC sem consumidor). Gate no server + item de menu na seção
  governança. Consequência RBAC testada: colaborador de área canônica com
  `reports:view` passa a abrir a área admin com no máximo Dashboard +
  Relatórios (leitura) — nunca operação.
- **Regras de receita**: loja = pedidos `CONFIRMADO`/`ENTREGUE`; bar = vendas
  `PAGA`; presença de eventos = `checkedInAt` (walk-in conta; no-show =
  `CONFIRMADO` sem check-in).
- **Kit de listagem — contrato declarativo** (2026-07-30): Acessos renderizava
  831 pessoas numa página só, com quatro dumps da torcida cruzados em memória
  (O(n×m)); Membros e Sócios repetiam `parseSortParam`/`buildHref`/`where` à mão.
  Fechado assim:
  - **`ListagemSpec`** em `apps/web/src/lib/listagem/` (registro em `specs.ts`,
    no espírito de `ADMIN_MODULOS`) descreve colunas, filtro por coluna, campos
    de busca, sort/dir padrão e `camposProibidos`. Página nova não escreve parse
    de param nem montagem de href: `parseListagemParams` + `construirHref*` +
    `montarWhereListagem`/`montarOrderByListagem`/`montarPaginacao`.
  - **Segurança no contrato**: `sort` restrito à coluna declarada, teto em
    `porPagina`/`pagina`/valores por filtro, e campo sensível (CPF, RG, URL de
    documento) barrado em filtro/busca/sort — a URL nunca vira canal de
    consulta a dado LGE. Invariantes em `lib/__tests__/listagem.test.ts` rodam
    sobre `LISTAGENS`, então listagem nova herda as travas.
  - **Href vem do servidor**: opção de filtro é `<a>` com destino pronto (o
    cliente só faz `router.replace`), então filtro e ordenação funcionam sem JS
    e a serialização da URL existe em um lugar. `localStorage` só restaura a
    última visão quando a URL está limpa — link compartilhado ganha da
    preferência local.
  - **Faceta ignora o próprio filtro** (`carregarFacetas` via `groupBy`): o
    número na opção é quantos apareceriam se ela fosse marcada. Caminho de
    relação não é facetável — o popover sai sem números em vez de mentir.
  - **Escrita em GET eliminada**: `/admin/socios` alinhava `numeroSocio` legado
    durante o GET da aba "emitidas" — refresh ou prefetch mutava o banco sem
    auditoria. Virou a Server Action `sincronizarNumerosSocio`
    (`MEMBERS_APPROVE`, advisory lock por torcida, `AuditLog`).
  - **Índices** (exigem `db:push`): `SaasMembro [tenantId, status, criadoEm]`,
    `[tenantId, criadoEm]`, `[tenantId, nome]`; `User [nome]`;
    `UserDepartamento [tenantId]` — o unique dessa tabela começa por `userId`,
    então "quem é desta torcida" varria a tabela; `SaasSocio [tenantId,
    validade]`, `[tenantId, nome]`; `SaasPedido [tenantId, status, criadoEm]`,
    `[tenantId, criadoEm]`.
  - **Sócios = dois specs**: a aba `status` escolhe entre `SaasSocio` (emitidas)
    e `SaasMembro` (aguardando) — sort, busca e colunas são disjuntos, então o
    registro tem `LISTAGEM_SOCIOS_EMITIDAS` e `LISTAGEM_SOCIOS_AGUARDANDO`
    compartilhando `basePath`. Filtro de unidade em emitidas é relação
    (`user.membros.some.sedeId`), sem `userId: { in: [...] }` sem teto.

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
  agentes `data-model` e `rbac` antes de codar via `implementation`.

### 5.13 Canal restrito da unidade — isolamento derivado em leitura (2026-08-01)

R5 da governança hierárquica: a liderança de uma unidade Caso B pode fechar o
canal, retirando a unidade da malha de **interação** sem tocar em nenhum dado.
Spec: `docs/data/modulo-canal-restrito.md`.

Decisões estruturais que valem para além do módulo:

- **O corte é derivado em LEITURA, não materializado.** Nada é apagado —
  aliança, `MembroConversa` e post continuam gravados. O isolamento é um filtro
  aplicado sobre conjuntos já carregados (`lib/isolamento.ts`), e reabrir o
  canal é literalmente invalidar cache. Foi o que tornou possível o requisito
  "ao reativar, todos os relacionamentos voltam automaticamente" sem escrever
  uma única rotina de restauração.
- **Expiração derivada > cron.** A reativação automática por silêncio (5 dias) é
  calculada em `getTenantsRestritos()`, então a regra se cumpre mesmo com o
  scheduler fora do ar; `/api/cron/canal-restrito-expiracao` só materializa a
  linha, audita e notifica. Corolário obrigatório: **`Tenant.canalRestrito`
  nunca é lido direto** — a coluna pode estar `true` com o estado efetivo já
  `false`.
- **Estrutural × interação vira uma linha explícita em `hierarquia.ts`.**
  `getAncestorTenantIds` / `getDescendantTenantIds` /
  `getTorcidaLineageTenantIds` / `getTorcidaWorktree` / `getTenantHierarquia`
  são **estruturais** e nunca são gateadas — sustentam governança, espelho de
  admissão na Sede e o console R1. O gate entra só em `getTenantRelation`,
  `getVisibleTenantIds`, `getAlliedTenantIds` e nos conjuntos por `afiliacaoId`.
- **Isolamento de praça social é bidirecional; comunicação institucional não.**
  A unidade isolada não é vista **e** não vê — feed, canais, stories e busca da
  Sede somem para ela. O que continua descendo é comunicado e evento, e isso é
  decidido **por recurso** (`RECURSOS_CASCATA_INSTITUCIONAL` em
  `packages/types/src/visibility.js`), não por relação. Foi preciso separar o
  recurso `comunicados` de `comunidade` na matriz de sensibilidade: os dois
  liam o mesmo conjunto de tenants, e sem a separação cortar o feed da Sede
  derrubaria junto o comunicado oficial dela.
- **Fast-path de autorização é o ponto cego típico.** `podeEngajarPostVisivel`
  tinha um atalho "mesmo clube + PÚBLICO" que retornava `true` **antes** de
  consultar hierarquia — com ele, qualquer torcedor do clube reagiria em post
  de unidade isolada (bastava o id do post), e a unidade isolada engajaria na
  praça de fora. Regra geral que fica: **checagem de isolamento vem antes de
  qualquer atalho de performance em gate de leitura**.
- **A relação crua e o rebaixamento ficam separados.**
  `getTenantRelationCrua` calcula hierarquia/aliança/rivalidade como sempre;
  `aplicarIsolamento` (pura, em `@torcida/types`, testada) rebaixa depois. A
  assimetria mora numa função de 6 linhas, não espalhada por dezenas de queries.
- **Monitoramento cross-tenant nunca passa pelo feed pessoal.** Presidente/Vice
  leem a comunidade da unidade restrita pelo drill-down R1 com loader dedicado
  (`listarPostsDaUnidade`), porque injetar a unidade no feed do Presidente
  vazaria pelo cache compartilhado da Sede.

### 5.14 Bloqueio de membro e hard delete do cadastro (2026-08-01)

Três decisões fechadas sobre o fim do ciclo de vida de um cadastro. Spec e
tabelas: `docs/data/modulo-associacao.md`.

- **Número de associado é vaga, identidade não é.** `REPROVADO` devolve o
  `numeroAssociado` ao pool (o valor segue gravado para laudo/histórico), mas
  CPF/RG/telefone continuam bloqueando mesmo em reprovados. Confundir os dois
  ou prendia o número para sempre, ou deixaria a mesma pessoa entrar duas vezes.
  `PENDENTE` ainda ocupa: a solicitação está viva.
- **Bloqueio é sobre o USUÁRIO e herda só para baixo.** `MembroBloqueio` é uma
  linha por `(tenant, user)`, sem cópia por unidade;
  `estaBloqueadoNoTenant` consulta o tenant + **ancestrais**. Bloqueio na Sede
  cobre as unidades, bloqueio numa unidade não sobe. Materializar por unidade
  exigiria fan-out a cada nova unidade criada — e um bloqueio esquecido é pior
  que um bloqueio ausente. Sendo sobre o usuário, vale sem cadastro e sobrevive
  ao cadastro ser apagado.
- **Bloquear não desliga, e apagar não desbloqueia.** Bloquear alguém
  `APROVADO` ativo é recusado, não encadeado com desligamento: são permissões
  distintas (`members:block` × `members:dismiss`) e encadear escondido apagaria
  o rastro de quem decidiu o quê. Na outra ponta, `executarPurgeMembro`
  preserva `AuditLog` e `MembroBloqueio` — senão apagar o cadastro viraria a
  porta dos fundos para reentrar.
- **`members:purge` precisa de exclusão explícita.** `SYSTEM_ROLE_PERMISSIONS`
  monta os pacotes de admin e vice como `ALL_PERMISSIONS.filter(...)`, então
  toda permissão nova cai neles por padrão. Manter o hard delete só com o owner
  exigiu listá-la nos dois filtros, ao lado de `SETTINGS_MANAGE`; o invariante
  está travado em `lib/__tests__/rbac.test.ts` porque é silencioso ao quebrar.
- **Uma semântica, duas portas.** A Server Action do tenant e a rota do
  super-admin compartilham `lib/membros-purge.ts` (regra + execução). O
  super-admin tem gate diferente (allowlist de e-mail, cross-tenant), não regra
  de negócio diferente.

### 5.15 Área de atuação do departamento — organização sem RBAC (2026-08-03)

Departamento era uma lista plana por tenant: pertencer ao Social significava
pertencer a tudo do Social. A realidade das torcidas é outra — Campanha do
Agasalho, Inclusão Digital e Escolinha da Bateria são frentes com gente
diferente. `DepartamentoArea` + `DepartamentoAreaMembro` modelam isso. Spec:
`docs/data/modulo-departamentos.md` § áreas de atuação.

- **Área organiza, departamento autoriza.** A alternativa era departamento
  aninhado (`parentId`) com pacote próprio, que herdaria a máquina de RBAC de
  graça — e multiplicaria perfis, linhas de `UserDepartamento` e caminhos de
  `syncMembershipFromRoles` a cada frente de trabalho nova. Área ficou **fora**
  do cálculo de permissão: nenhum ponto de `permissionsOfRole` /
  `fetchUserPermissionsImpl` a consulta. O custo é real e aceito: responsável
  de área não pode gerir a própria área — quem gere é o gestor do
  departamento (`canManageDepartamento`). Se um dia a delegação for
  necessária, o caminho é promover a pessoa a gestora, não vazar RBAC para a
  área.
- **`RESPONSAVEL` é accountability, não papel de acesso.** Existe para
  responder "quem toca essa frente" e para a pendência "área ativa sem
  responsável" no `/admin/departamentos`. `resolverAreasDepartamento` nunca
  deriva `podeGerir` de `isResponsavel`, e isso é teste, não comentário.
- **Conhecimento canônico é semente, não trava.** As áreas-padrão vivem em
  `packages/types/src/departamento-areas-canonicas.js` com descrição do que
  cada frente faz, e o seed atualiza só texto/ícone/ordem/sazonal — nunca
  `ativa`, `nome` ou `meta`. Semear conhecimento sem sobrescrever a decisão da
  torcida é o que permite rodar o seed de novo com segurança.
- **Checklist por frente** em `DepartamentoArea.meta.checklist` (itens livres +
  modelos sugeridos) — mesmo padrão leve do barracão; sem tabela nova. Spec:
  `modulo-departamentos.md` § checklist por frente.
- **Canal por frente / departamento** — `canalConversaId` em `Departamento` e
  `DepartamentoArea`; roster = equipe + gestores + **liderança do tenant**
  (`owner`/`admin`/`vice` → ADMIN em todos os canais do tenant). Listagem
  Comunidade: categoria Departamento, só membro ATIVO no tenant dono, sem
  pedido. Spec: `modulo-departamentos.md` § canal por frente; foco Caso A:
  `modulo-comunidade.md` § foco Caso A.
- **Cockpit consome flags, não refaz RBAC.** `[slug]/_lib/contexto.ts` espelha
  `configuracoes/_lib/contexto.ts`: um loader `cache()`-ado resolve gate,
  permissões e áreas; os blocos só leem booleanos. Bloco sem permissão de
  leitura some da UI (aba, KPI, painel) — quem não pode ver a fila não vê a
  aba nem o número de pendentes; atalho admin some para quem não gere.
- **Institucional × comando.** `/admin/departamentos` (visão / áreas / equipes /
  projetos) continua `roles:manage`. Áreas e projetos no admin são dashboards
  de saúde da torcida; a ficha de operar mora no portal
  (`/portal/departamentos/[slug]/areas/[id]` e `/projetos/[id]`). Hubs de
  **comando** por domínio
  (`/admin/caravanas`, `/admin/bateria`, `/admin/social`, `/admin/feminino`,
  `/admin/carnaval`, `/admin/diretoria` + Financeiro/Loja/…) entram no
  `ADMIN_MENU` com `departamentoSlug`; o layout filtra por gestoria
  (`filterMenuByPermissionsAndGestoria`) — gestor só vê o módulo do seu
  depto; `roles:manage` / super-admin vê todos. Colaborador (MEMBRO) não
  recebe permissão que abre operação admin (item 7 de
  `modulo-departamentos.md`). Portal = execução; atalho “Operação” e o
  menu admin apontam para o mesmo hub.

### 5.16 Projeto do departamento — execução com meta e orçamento (2026-08-03)

Área organiza gente; `Projeto` é o que ela **executa** (Campanha do Agasalho,
Festa das Crianças, Inclusão Digital). Spec:
`docs/data/modulo-departamentos.md` § projetos e campanhas.

- **Projeto não concede permissão**, como a área. `responsavelId` e
  `ProjetoParticipante` são accountability; quem cria/edita é
  `canManageDepartamento` (`projetos-actions.ts`).
- **Gasto realizado vem do livro-caixa.** `orcamentoPrevisto` é declarado;
  o realizado é a soma das `DESPESA` com `projetoId` — digitação manual de
  "quanto gastei" seria número que ninguém confia. Meta de alcance
  (`metaQuantidade`/`realizadoQuantidade`) continua manual porque não há
  outra fonte.
- **`progressoMeta`/`saudeOrcamento` devolvem `null` sem meta/orçamento** —
  0% leria como fracasso; gastar sem previsto é ausência de plano, não
  estouro. Travado em `projeto.test.ts`.
- **Rateio no Financeiro valida escopo no servidor.**
  `FinanceiroLancamento.departamentoId?`/`projetoId?` passam por
  `resolverRateio`: departamento do tenant e projeto daquele departamento
  (ou herda o do projeto se só o projeto veio). Sem isso, id forjado
  penduraria gasto em outra torcida.
- **Agenda aponta para o projeto.** `Evento.projetoId?` é opcional; criar/
  editar evento validam o id no tenant (`resolverProjetoEvento`). O cockpit
  do departamento lista os próximos eventos do projeto; o thin Social
  prioriza essa agenda quando há vínculo.
- **Campanha do ano (atalho sazonal).** Área `sazonal` ativa →
  `abrirCampanhaDoAno` (aba Áreas) ou **Ativar fluxo** no Painel cria
  `Projeto` CAMPANHA `{área}-{ano}` + aplica checklist-modelo da área, sem
  auto-criar evento. Outras receitas ativáveis: caravana ligada à `Partida`
  fora, ensaio da semana, escala de bandeira (`Evento` GERAL + `partidaId`) e
  ensaio de rua no Carnaval (`fluxos-actions.ts`). Prefs em
  `Departamento.meta.fluxos` (vale / quando / quem). O calendário nacional
  (mês civil, `Partida`, data do desfile) dispara a sugestão **antes** de
  faltar o processo.
- **Plugins F8:** Bateria `#escala` compõe Agenda (RSVP/presença); Social
  nudge de rateio; thin prioriza `Evento.projetoId` do departamento.

### 5.17 Caravana paga — lotação por pagamento e hard-block opcional (2026-08-03)

RSVP, cobrança AVULSA e check-in continuam trilhos separados. Com
`Evento.valorVaga`:

- **Ocupação da lotação** = cobranças `PAGA` (`contarOcupacaoEvento`), não
  `CONFIRMADO`. Confirmar gera cobrança (`garantirCobrancaVagaCaravana`);
  só o pagamento garante o assento.
- **Check-in default** avisa e permite se a vaga não está paga.
- **`Evento.checkInExigePagamento`** (opt-in no form de caravana) bloqueia
  check-in/QR até PAGO; gestor usa override manual (“Embarcar mesmo assim”)
  com AuditLog `override: true`. QR não tem override — redireciona para o
  check-in manual.

Regras puras em `packages/types/src/caravana-embarque.js`. Spec:
`docs/data/modulo-caravanas.md`.

### 5.18 Suporte da plataforma — consentimento por unidade (2026-08-03)

`assertPermission` sempre deixou o super-admin passar, mas `assertTenantOwner`
não: as configurações marcadas “Somente owner” em `/admin/configuracoes`
(perfil, afiliação, canal oficial, Discord, hierarquia visível, documentos do
cadastro, periodicidades, canal restrito) exigem o cargo de sistema `owner` no
tenant. O efeito era o pior dos dois mundos — o super-admin via o formulário e
a gravação estourava.

A regra agora é explícita e **isolada por tenant** (`Tenant.suportePlataforma`,
lido só via `lib/suporte-plataforma.ts`):

- unidade **sem owner**: o super-admin opera — senão não há quem configure a
  unidade recém-criada;
- unidade **com owner**: só opera se a liderança tiver ligado o consentimento
  em `/admin/configuracoes#suporte-plataforma`.

O gate único é `assertOwnerOuSuportePlataforma` (`lib/authz.ts`), aplicado em
**todas** as ações “Somente owner” — inclusive `salvarPerfilTenant`,
`salvarCanalOficial` e `salvarDiscordGuildId`, que exibiam o selo sem gate no
servidor. O toggle em si usa `assertTenantOwner` **estrito**: quem se beneficia
do acesso não se autoconcede o acesso, então o super-admin nunca liga a própria
chave. Chaves da Sede e das unidades são independentes — ligar na Sede não liga
em nenhum PDE.

Consequência de UI: seção que o usuário não pode gerir **não é renderizada**
(antes vinha um card opaco explicando o bloqueio). `ConfigSectionCard` perdeu a
prop `blocked`; `podeEditarConfigDeOwner` em `_lib/contexto.ts` é a fonte única,
e espelha exatamente o que a Server Action recusaria. Invariantes em
`lib/__tests__/suporte-plataforma.test.ts`.

### 5.19 Comunidade segue o tenant ativo + modo operador (2026-08-03)

Duas verdades conviviam no portal: o `/admin` respeitava o tenant ativo (cookie
`torcida_ctx`) e a Comunidade sempre subia para a **raiz da worktree**
(`projetarTorcidaOrganizada`). Com a PDE selecionada, o feed mostrava o canal da
Sede, e a marca do header trocava ao sair do feed para `/canais` — o feed tinha
uma regra local (`portalEhUnidadeCasoB`, por comparação de slug) que nenhuma
outra rota conhecia.

**Fonte única = tenant ativo.** A regra passou para
`resolverEscopoComunidadePorModo` (pura, `lib/comunidade-escopo.ts`), que ganhou
`tenantAtivoEhUnidade`: tenant ativo ≠ raiz e com aba de unidade → default
`unidade`. Feed, navbar, rail, canais, busca, grupos e salas resolvem pelo mesmo
ponto. A unidade também deixou de depender só do vínculo: quando o portal ativo
**é** a unidade Caso B, ela vem do próprio tenant
(`resolverUnidadeDoTenantAtivo`, leitura pura, sem write-on-GET) — antes,
liderança com o `SaasMembro` gravado na Sede e o operador da plataforma ficavam
sem a aba, e a Comunidade caía na raiz.

**Modo operador** (`ContextoComunidadePortal.operador`): super-admin **sem**
`SaasMembro` APROVADO no tenant ativo. Lê tudo — canais, perfis, posts, sem
solicitar entrada (`podeVerFeedSocios` já o deixava passar) — e **não** escreve
nada. Super-admin *com* vínculo (o presidente na própria torcida) não é
operador e publica normalmente. O gate fica em `lib/authz.ts`:

- `assertVozComunidade` roda **dentro** do atalho de super-admin de
  `assertPermission`/`assertAnyPermission` e recusa `community:post`,
  `messages:send` e `groups:create` — um ponto cobre as ~40 Server Actions da
  Comunidade sem tocar o resto do admin, onde o bypass continua igual;
- `assertNaoOperador` cobre o que não passa por RBAC (Comunidade Nacional:
  publicar, criar grupo/sala, entrar em grupo/canal, enviar DM). É obrigatório
  nas ações com `try { assertPermission } catch { assertComunidadeNacional }` —
  sem ele a recusa cairia justamente no `catch` e a ação passaria;
- `resolverContextoEngajamento` recusa reagir/comentar/salvar antes do fallback
  “engaja como CN do clube”;
- `assertComunidadeNacional` segue **livre**: também serve leitura (SSE do feed
  nacional, inbox de mensagens).

UI é só cosmética: `ModoOperadorProvider` (`lib/modo-operador.tsx`, montado em
`portal/layout.tsx`) desabilita curtir/salvar/compartilhar e o campo de
comentário. Nunca é critério de autorização.

Mural do operador: `getCanalLeituraDireta` + `getPostsDoCanal({ leituraOperador })`
(sem vínculo/`MembroConversa`). Super-admin troca cookie sem vínculo via
`trocarTorcidaAction`. Barra multi-canal: cookie `operador_canais_abertos` +
badge X (`fecharCanalOperadorAction`). Prefixo fixo **clube → torcida →
unidade** mesmo com o portal na Sede; outras unidades da worktree abertas
ficam na zona móvel (não se exclui a lineage inteira). Admin: botão "Ir ao portal" sob
Afiliações; Caso A (`origem === 'sede'`) abre modal em vez do portal.

### 5.20 Responsividade mobile — auditoria medida em 320/390 (2026-08-05)

Comunidade e admin já eram mobile-first (drawer do `AdminShell`, dock da
Comunidade, colunas escondidas por breakpoint nas tabelas). O que faltava era
medição: os estouros que sobravam **não** apareciam em grep de classe, porque
não vinham de largura fixa — vinham de `min-width: auto` de item flex/grid,
onde a largura é definida por **dado dinâmico** e nada pode encolher.

`e2e/mobile-audit.measure.ts` passou a varrer 25 rotas em **320×844 e 390×844**
reportando `pageOverflow` e o elemento culpado. Achados corrigidos:

- **`<select>` define a coluna** (`/portal/comunidade/salas`, +111px): a opção
  mais longa (título de evento) virava o `max-content` da única coluna do grid.
  Fix global em `globals.css`: `input, select, textarea { min-width: 0 }` e
  `select { max-width: 100% }` — zera só o **piso**, a largura `auto` segue
  valendo quando há espaço (verificado: nenhum campo colapsou em 390 nem 1440).
- **Item de grid sem `min-w-0`** (cards de sala): o `h3.truncate` não trunca se
  um ancestral pode crescer. `min-w-0` no item + `truncate` no nome do host.
- **Fila de abas sem trilho** (`ComunidadeTabBar`, `MotionTabBar`, +137px no
  detalhe de grupo): 4+ abas empurravam a página. Borda foi para o wrapper e o
  trilho virou `overflow-x-auto` com `pb-px` (compensa o `-mb-px` das abas, que
  o overflow recortaria) — mesmo padrão do `AdminTabs`.
- **PDV do bar** (+44px em 390): a coluna do cardápio não encolhia e o PDV é
  `overflow-hidden` por ser imersivo, então a lista era **cortada**, não rolada.
- **Faixa de ações da navbar** (+12px em 320): 3 atalhos + mensagens + sino +
  cadeado. `gap-1.5 sm:gap-2` em vez de esconder atalho.
- **Alvos de toque**: "por página" da listagem (25×20 → 32×32) e ícones do
  patrimônio (28px → 36px, com `aria-label`, que faltava).
- **Charts admin** (`MiniBarChart` em Relatórios/Evolução/Desempenho): o
  rótulo `truncate` (`white-space: nowrap`) virava o min-content da coluna
  flex, subia ao card e à grade do `InsightSection` (coluna implícita `auto`)
  — em 390px o cartão chegava a ~657px e o `overflow-x: hidden` do body
  **cortava** sem rolagem. Fix em três camadas: (1) trilho `overflow-x-auto`
  + `w-0 flex-1` com `min-w` por coluna no `MiniBarChart`; (2) track
  `grid-cols-[minmax(0,1fr)]` + `[&>*]:min-w-0` em `InsightSection`,
  `AdminExpansionPanel` e `KpiGrid`; (3) `min-w-0` na raiz do Donut.

Estado medido: **zero overflow** nas 25 rotas nas duas larguras. Ao mexer em
layout de Comunidade/admin, rodar
`pnpm --filter @torcida/web exec playwright test e2e/mobile-audit.measure.ts --project=measure`
(precisa do dev server e de `--project=setup` para renovar `e2e/.auth`).
Charts: `e2e/charts.measure.ts` (mesmas pré-condições) — falha se overflow > 2px
ou texto vazar da coluna do MiniBarChart.

#### 5.20.1 Segunda rodada — o que o estouro horizontal não pega (2026-08-27)

> Guia prático (as quatro classes de alvo, as regras globais, o que
> deliberadamente **não** se corrige e as 6 armadilhas de método):
> `docs/frontend/mobile-first.md`. Esta seção é a decisão; aquele é o como-fazer.

A rodada de 2026-08-05 zerou **estouro**. Mas "não estoura" não é "funciona no
telefone": sobravam três defeitos que nenhuma medição de largura revela, e que
são os que denunciam site-que-não-é-app. Cobertura nova em
`e2e/responsivo.measure.ts` (30 rotas, em **320/390/430**, mais **768 tablet** e
**844×390 paisagem**). Tablet e paisagem não são luxo: o botão de usuário do
topbar é `hidden sm:block`, então **só existe acima de 640px** — as três
larguras de telefone nunca o viam, e ele estava em ~32px. Paisagem é também o
proxy testável do teclado virtual (o Playwright não emula o teclado do iOS, mas
viewport baixa reproduz o layout espremido). Um segundo teste mede **estado
aberto**: abre o modal e confere lá dentro — em paisagem o painel fica em
358px de 390 (`92dvh`), enquanto o `92vh` antigo deixaria o rodapé de ações
inalcançável.

- **Zoom no foco do iOS.** Campo com fonte < 16px faz o Safari ampliar a página
  ao focar e **não** desfazer ao sair. Havia ~144 pontos e nenhum componente
  `Input` central — então a correção é uma regra só, em `globals.css`:
  `@media (pointer: coarse)` põe `font-size: 16px` em input/select/textarea
  (fora os que não abrem teclado). No mouse `text-sm` segue valendo.
  A correção é a **fonte**, nunca `maximum-scale=1` no viewport — isso mataria
  o zoom por gesto (WCAG 1.4.4).
- **`100vh` ≠ altura visível.** `vh` é a viewport com a barra do navegador
  retraída, então `h-screen` + `overflow-hidden` no `AdminShell` deixava o pé
  da tela **inalcançável** no celular. Todo `vh` virou `dvh` (24 pontos), menos
  o que está atrás de `lg:`/`xl:` — no desktop as duas unidades são iguais.
- **Safe-area.** No mobile o `AppModal` é bottom sheet (`items-end` + `p-0`),
  então o rodapé de ações encostava no home indicator (34px). O padding vai no
  **painel**, não em cada rodapé: `sticky bottom-0` ancora no container de
  rolagem, e quem conhece a distância até a borda da tela é o painel. Mesmo
  tratamento nas folhas inline e na barra fixa de checkout da sacola (onde a
  folga do conteúdo também passou a crescer com o inset).
- **Alvo de toque nos dois eixos.** `.app-action` só impunha `min-height`, então
  botão de ícone (`h-9 w-9`) ficava **36×44**: passava na altura, falhava na
  largura — era o caso do hambúrguer e do sino em toda tela de admin. Ganhou
  `min-width` sob `pointer: coarse`. Para UI densa (abas de módulo, paginação
  de listagem) existe `.app-touch-target`, que cresce **só** no toque: usar
  `.app-action` ali engordaria a tabela de quem opera no desktop. Link de texto
  solto no card ("Ver departamento", cabeçalho de coluna ordenável) usa
  `.app-touch-line`: a área vira 44px por pseudo-elemento e a diagramação não
  muda — mas só onde o link está sozinho na linha, porque a faixa se sobrepõe
  na vertical e perto de outro controle roubaria o toque.
  **O `min-width` é `:not(.min-w-0)` — e isso não é detalhe.** A regra é
  unlayered e vencia o `min-w-0` do Tailwind, então um botão declarado
  `min-w-0 flex-1` (o `AcaoCard` do card de patrimônio) perdia a capacidade de
  encolher e o `<article>` `overflow-hidden` passava a **cortar** 20px em
  320px. Foi regressão introduzida pela própria correção de alvo e só apareceu
  porque a auditoria rodou de novo depois — quem declara `min-w-0` está
  dizendo "preciso encolher", e a válvula respeita isso.
- **Estouro do checkout (320px).** `grid gap-8 lg:grid-cols-2` sem
  `[&>*]:min-w-0`: o min-content do resumo do pedido virava o piso da coluna.
  É o mesmo `min-width: auto` de item de grid da rodada anterior — sinal de que
  a armadilha reaparece a cada layout novo, não de que faltou fix antes.

Duas armadilhas de método que custaram caro e valem para a próxima auditoria:

1. **Sem `hasTouch`/`isMobile` a medição mente.** É o que faz o Chrome casar
   `@media (pointer: coarse)`. Sem isso mede-se a versão "mouse" do layout
   mobile: `.app-action` reporta 40px em vez de 44, e o piso de 16px nem entra
   em vigor. O relatório vira uma lista de defeitos falsos.
2. **Relatório limpo pode ser dev server morto.** O Turbopack recompilando 28
   rotas sob o Playwright estourou o heap (13,7 GB) e todas as páginas voltaram
   vazias — o que o relatório registrou como "zero defeitos". Por isso a
   auditoria grava `totalElementos` por rota, e a varredura é **rota-major**
   (compila uma vez, mede as três larguras).
3. **O dev server serve CSS obsoleto sem mudar o nome do chunk.** Uma regra
   nova em `globals.css` não entrou no bundle, mas a URL (`..._globals_<hash>
   .css`) continuou idêntica — a auditoria mediu 32px em elementos que já
   tinham a classe de 44px e "provou" que a correção não funcionava.
   `touch` não resolve (o hash é do conteúdo). Ao auditar CSS global, **baixe
   o chunk e confira a regra** antes de acreditar no relatório:
   `curl -s localhost:3000/_next/static/chunks/apps_web_src_app_globals_*.css
   | grep <regra>`. Se faltar, force um rebuild com mudança real de conteúdo.

Safe-area **não** é medível em headless: sem notch, `env(safe-area-inset-bottom)`
resolve para 0 e o padding correto fica indistinguível do errado. Virou lint
estático — `scripts/lint-mobile.mjs`, ligado no CI como `lint:mobile`, sem
precisar de app nem de banco. Três regras: safe-area em barra fixa de rodapé,
`vh` fora de breakpoint desktop, e **recorte lateral** (`viewportFit: 'cover'`
+ paisagem = o notch come ~44px de um lado, e `px-4` esconde o conteúdo embaixo
dele; `.app-inset-x` resolve, com folga base em `--app-inset-x`).
Como esse lint é a **única** rede para safe-area, ele próprio é testado:
`src/lib/__tests__/lint-mobile.test.ts` roda o script contra fixtures e exige
que dispare nas três violações e fique quieto nas duas exceções legítimas
(`vh` atrás de `lg:`; drawer `top-N`, cujo inset é do conteúdo). Lint que nunca
dispara é pior que nenhum — dá sensação de cobertura.

**Rota dinâmica: id vem do banco, não de varredura da UI** (`scripts/rotas-dinamicas.mjs`,
`pnpm --filter @torcida/web rotas:dinamicas`). A auditoria antes procurava
`<a href>` para o detalhe na página de listagem e achava 2 de 8 famílias. A
causa não era falta de dado semeado — era a premissa: canal abre com `<button>`
+ `router.push` (`AbrirCanalNaBarraLink`), `/portal/sedes` é master-detail na
própria página e **nada** no app aponta para `/portal/sedes/[id]`, e
`/admin/torcedores/[id]` só é linkado de dentro de um modal. Com os ids saindo
do banco são 7 famílias, e as queries são **escopadas ao tenant do usuário de
teste**: sem isso o primeiro registro pode ser de outra torcida, a rota
redireciona e mede-se a página errada achando que mediu a certa.

### 5.21 Troca de gestão — presidência e liderança de unidade (2026-08-06)

Presidente de torcida não é vitalício: a gestão troca a cada 3–4 anos. Até aqui
o produto não tinha esse conceito — a única forma de mexer em quem lidera era um
`<details>` no rodapé de `/super-admin/torcidas`, e a liderança de unidade era
um campo qualquer do formulário de sede.

**Bug que motivou a feature.** `promoverSedeParaTenant` atribuía o owner do
tenant **mãe** ao portal novo quando a unidade não tinha `responsavelUserId`
válido. Como quem provisiona a torcida costuma ser o super-admin, promover uma
subsede fazia dele o dono de um portal que nunca foi dele (SUBSEDE RIO CLARO,
FIEL SÃO VICENTE). O fallback saiu: **sem liderança, o portal nasce sem owner** —
estado já suportado, em que `assertOwnerOuSuportePlataforma` deixa o super-admin
operar as configs reservadas até haver presidente de verdade. Passivo:
`db:repair-owner-heranca-promocao` (dry-run por padrão, `--apply` para gravar).
A rota irmã `promoverUnidadeAPortal` (super-admin) nunca teve o fallback — a
divergência entre os dois caminhos era o próprio bug.

**O cargo não era o único resíduo (2026-08-11).** No mesmo `$transaction`, o
owner herdado ganhava também `SaasMembro` APROVADO (com `sedeId` da unidade) e
`MembroConversa` ADMIN no canal oficial. Tirar a presidência — pela UI ou pelo
repair — deixava os dois de pé, e `resolverUnidadeDoVinculo`
(`lib/comunidade-contexto.ts`) elege a aba **Minha unidade** pelo `SaasMembro`
mais recente da worktree, `orderBy criadoEm desc`, sem consultar liderança: a
Comunidade do super-admin abria no canal de uma subsede alheia. A regra da
Comunidade está certa — varrer a worktree é o que impede o sócio de PDE logado
na Sede de perder a aba dela; o dado é que era fabricado. Operar a plataforma
não associa ninguém a uma torcida, então `db:repair-owner-heranca-promocao`
passou a limpar o vínculo junto, com a evidência direta de que foi fabricado:
o `AuditLog SEDE_PROMOVIDA_TENANT` daquela unidade registrou a pessoa em
`detalhes.ownerUserId`. Sem esse registro o script não encosta — presidente da
Sede que também é sócio real da subsede tem vínculo legítimo. Carteirinha
(`SaasSocio`) nunca é apagada: é identidade, o script só reporta.

**Regra única.** `lib/lideranca.ts` concentra a decisão nos dois formatos de
unidade que o produto tem:

- **Caso B** (Sede raiz e unidade promovida): liderança é o cargo de sistema
  `owner`. **No máximo um** por tenant (`MAX_PRESIDENTES = 1`) — atribuir um
  segundo pelo painel de Acessos é recusado; a troca passa por Estrutura ›
  Presidência (`transferirLideranca`), que demove o anterior. A ficha da
  unidade (`/admin/sedes/[id]`) lê o owner, não só `Sede.responsavelUserId`
  (os dois ficam alinhados na transferência).
- **Caso A** (subsede/PDE sem portal): não há cargo — liderança é
  `Sede.responsavelUserId`, identidade sem RBAC próprio (já singular).

Sempre com `AuditLog` (`LIDERANCA_TRANSFERIDA`, `LIDERANCA_UNIDADE_TRANSFERIDA`,
`LIDERANCA_UNIDADE_REMOVIDA`, `OWNER_REMOVIDO`) e notificação aos dois lados.

**Duas decisões de produto.** (1) A transferência é **imediata**, com
confirmação explícita — o cargo é fato consumado na vida real, e o super-admin
sempre reverte; aceite em duas etapas cabe depois sem refazer o núcleo. (2) O
presidente que sai **vira `admin`**, não perde o acesso: ex-presidente trancado
para fora do portal que construiu é perda de memória operacional, não segurança.

**Escopo nunca atravessa tenant.** A permissão nova `leadership:transfer` é
exclusiva do pacote `owner` (`SYSTEM_ROLE_PERMISSIONS` a tira de `admin` e
`vice`: vice substitui, não sucede) e diz apenas *se* pode. O alvo é resolvido a
partir do **tenant ativo**, no servidor — presidente da Sede não escolhe o
presidente de uma subsede promovida (é outro tenant, com mandato próprio), e
liderança de unidade não alcança a Sede. Invariantes em
`lib/__tests__/lideranca.test.ts`.

**Superfícies.** Admin: aba Estrutura › **Presidência** (`/admin/presidencia`,
etapa de `ADMIN_MODULOS`, some para quem não é presidente). Super-admin:
`/super-admin/liderancas` — a árvore real (torcida › portais de unidade ›
unidades sem portal), com KPI de "sem liderança", filtro **"só onde eu lidero"**
e remoção. O painel antigo (`transferirOwnerAction`/`removerOwnerAction`,
`listarTorcidasParaTransferencia`) foi removido: listava tenants em ordem
alfabética sem dizer qual era raiz e qual era unidade.

**"Portal" não é categoria de unidade (2026-08-11).** O console rotulava toda
linha Caso B com a string fixa `'Portal de unidade'`, então SUBSEDE RIO CLARO e
PDE FIEL BAIXADA – PRAIA GRANDE apareciam sem o tipo, ao lado de PDEs Caso A
corretamente rotulados. Não era erro de dado: as duas promoções
(`promoverSedeParaTenant` e `promoverUnidadeAPortal`) só trocam `Sede.tenantId`
e preservam `tipo` e `sedeId` — a unidade **já** é filha na árvore com sua
natureza. A apresentação é que descartava `Sede.tipo`. Agora `tipoLabel` vem
sempre de `labelTipoUnidade(sede.tipo)`, inclusive no typeahead, tirado da
"cara" do portal (a sede cujo pai está em outro tenant). Ter tenant próprio
segue distinguindo **só** como a liderança é trocada — o campo `caso`, que a UI
usa para dizer "presidência" × "liderança" — nunca o que a unidade é. Pela
mesma razão as filhas viraram **uma lista só**, ordenada por hierarquia (Sede,
Subsede, PDE) e depois pelo nome: os portais vinham em bloco no topo porque a
montagem os percorria antes das sedes Caso A. A comparação usa
`sensitivity: 'base'` — a caixa do nome não pode decidir posição na lista.

Foi essa mistura que expôs a lacuna na convenção de nomes: torcida e clube
sempre foram exibidos em caixa alta (`packages/types/src/nome-torcida.js`), mas
`Sede.nome` não tinha regra — então a unidade promovida vinha em caixa alta (é
`Tenant.nome`) e a irmã sem portal, capitalizada do banco. `formatNomeUnidade`
entra na mesma fonte única e vale para Sede/Subsede/PDE. É formatação de
**exibição**: o dado gravado continua sendo o que o presidente digitou.

O cabeçalho do grupo mostrava a inicial num círculo colorido, ignorando o
escudo que a torcida já tem. Agora usa `resolveTenantLogoUrl` + `LogoImage`
(máscara circular de `useEscudoCircular`, `next/image` quando o host é
otimizável), com a inicial só como último recurso. Para não pagar 2–3 queries
por raiz numa listagem paginada, os degraus 1–2 da cascata saíram para
`resolveLogoTenantSemIO` — função pura que `resolveTenantLogoUrl` também usa,
então quem já carregou as sedes resolve o caso comum em memória e só o resto
vai ao banco, em `Promise.all`.

### 5.22 Bandeiras — departamento por recorte de categoria (2026-08-06)

Bandeira e bateria são o patrimônio simbólico da torcida, e o produto tratava
"bandeirão" como uma **categoria** de `PatrimonioItem` mais uma área de atuação
do Patrimônio. Isso funcionava enquanto Patrimônio era o acervo simbólico;
deixou de funcionar quando o módulo cresceu para inventário geral (mesa,
cadeira, projetor — expansão correta). O efeito colateral: para guardar um
bandeirão era preciso `patrimony:manage`, que abre o inventário inteiro, e o
departamento de Bandeiras não existia em lugar nenhum — nem no canônico, nem na
matriz de o-que-o-membro-pode × o-que-o-gestor-pode.

**A decisão foi recorte de permissão, não módulo novo.** `Bandeiras` entra como
11º departamento canônico e o par `flags:view` / `flags:manage` vale **somente**
para `categoria: BANDEIRA`. `patrimony:*` continua cobrindo tudo, inclusive
bandeira — a assimetria é o ponto: quem cuida do trapo não herda o projetor,
quem cuida do inventário não perde a bandeira.

Três invariantes sustentam isso, todas no servidor:

- **A trava é da query.** `resolverEscopoPatrimonio`
  (`packages/types/src/patrimonio.js`) devolve `categoriaTravada`, aplicada
  **depois** do filtro do usuário em `listarPatrimonio` / `resumirPatrimonio` /
  `listarEmprestimosPatrimonio`. Filtrar só na UI faria `flags:view` virar
  `patrimony:view` na primeira URL montada à mão.
- **Edição confere origem e destino.** `garantirCategoriaPermitida` roda duas
  vezes no `editar`: sem checar a categoria de destino, `flags:manage`
  reclassificaria um bandeirão como `MOBILIARIO` e ficaria com um item fora do
  próprio escopo.
- **Gestor de área não é mini-admin.** O pacote do gestor leva `patrimony:view`
  (saber onde a peça está guardada) e `finance:view` (confecção é despesa
  rateada), nunca os `manage` correspondentes.

Ficha de **vistoria** (medidas, mastro, órgão, validade da liberação de entrada)
vive em `PatrimonioItem.meta.vistoria` — mesma escolha de `Departamento.meta` do
barracão: sem tabela nova e sem ERP de compliance. `validade` ausente **não**
alarma: liberação sem prazo é o caso comum, e alarmar nele treina o gestor a
ignorar o aviso (mesmo princípio de `progressoMeta` sem meta em `projeto.js`).
Escala de jogo reusa `Evento` com `partidaId`, como o `#escala` da Bateria — sem
lista paralela à Agenda.

Spec: `docs/data/modulo-bandeiras.md`. Invariantes travadas em
`lib/__tests__/bandeiras.test.ts` e `rbac.test.ts`.

### 5.23 Criptografia vs moderação — Fase A agora; E2EE não prometido (2026-08-07)

Queríamos restringir conversas/canais a membros (com oversight de
super-admin) **e** continuar deliberando conteúdo grave (racismo, CSAM,
pornografia, correlatos). **E2EE estrito e moderação server-side são
incompatíveis**: se o servidor (e o SA) precisam ler o texto, não é ponta a
ponta — é no máximo envelope/escrow. “E2EE + SA ainda lê” não deve ser
prometido nem implementado sob esse nome.

**Decisão:** permanecer na **Fase A** (plaintext no Postgres + ACL + denúncia
+ filas tenant/plataforma). Feed, canais institucionais e mural **não** entram
em E2EE no plano atual — o módulo depende de busca, RSC e moderação legível.
DM é a única superfície candidata a evolução futura.

Fases futuras (não agendadas): **B** envelope/at-rest com chave da plataforma
(moderação e safety ainda desencriptam); **C** E2EE real só em DM, e só com
plano de moderação sem plaintext no server (denúncia com anexo, scan client,
ação cega).

**Abrir a Fase B** só após o gate fechável em
`docs/data/plano-criptografia-e-moderacao.md` § Pré-requisitos (política
safety/CSAM, categorias de denúncia + escalonamento, ops, escopo S1–S6,
spec KMS/DEK/escrow T1–T6) — não por pedido isolado de “criptografar”.

Plano completo, vocabulário e o que E2EE quebraria no monorepo:
`docs/data/plano-criptografia-e-moderacao.md`.

### 5.24 Catálogo de clubes no Super Admin — `Afiliacao` editável (2026-08-11)

`Afiliacao` sempre foi referência global (onboarding, Sofascore, mapa, rivalidade),
mas o super-admin só tinha a fila de **solicitações de unidade** sob o rótulo
"Afiliações" — dois conceitos colidiam no menu. Agora:

- **Catálogo** em `/super-admin/clubes` (tabs Catálogo / Métricas / Qualidade):
  CRUD com Zod (`packages/types/src/afiliacao.js`), rivalidades simétricas,
  arquivar vs excluir (`bloqueiosExclusaoClube` — `Partida`/`Noticia` são Cascade),
  listagem via `LISTAGEM_SUPER_ADMIN_CLUBES`, métricas em
  `lib/super-admin/clubes-metricas.ts` (`count`/`groupBy` + cache 5 min).
- **Schema**: `Afiliacao.ativo` + `atualizadoEm` + índices `nome`/`estado`/`serie`;
  `AuditLog.tenantId` **nullable** para ações de plataforma (clube não tem tenant).
- **Unidades**: a fila de `SolicitacaoUnidade` mora em `/super-admin/unidades`;
  `/super-admin/afiliacoes` faz `permanentRedirect` (links antigos em
  `Notificacao`).

Contrato puro + testes: `afiliacao.js` / `lib/__tests__/afiliacao-clube.test.ts`.
Spec: `docs/data/modulo-super-admin.md` § Catálogo de clubes.

### 5.25 Versionamento do produto por commits (2026-08-11)

Uma versão de produto no monorepo: `package.json` da raiz (`torcida-saas`).
Pacotes privados não sincronizam versão. Fórmula:

`1.<commits_em_main>.<commits_totais>` — major fixo em **1**; minor =
`git rev-list --count` de `main`; patch = `git rev-list --count --all`.
Calculada no build do Next (fallback: `package.json`) via
`scripts/lib/version-from-git.mjs`. No push em `main`, o workflow de release
sincroniza `package.json`/`CHANGELOG`, cria tag `vX.Y.Z` e GitHub Release.
Escape hatch: `pnpm release:sync`.

Identidade de build (versão · publicação · commit) é injetada no Next
(`NEXT_PUBLIC_APP_*`, helper `lib/app-version.ts`) e exibida **somente** no
Super Admin (card na visão geral + rodapé da sidebar).

Runbook: `docs/ops/release.md`. Schema continua em `docs/ops/schema-deploy.md`
(versão ≠ `db:push`).

### 5.26 Provedor de jogos — API-Football pago, fonte única (2026-08-12)

Decisão **#7 fechada** com medição contra a API real (sonda
`scripts/api-football/probe.mjs` → `pnpm apif:probe`). Detalhe, evidências e
mapeamento: `docs/data/integracao-api-football.md`.

- **Provedor:** API-Football (`v3.football.api-sports.io`), **plano pago**. O
  free trava em **temporadas 2022–2024** e bloqueia `next`/`last` — é limite de
  temporada, não de volume.
- **Custo real de cota:** sincronizar **por competição + janela de datas**
  (~35–50 req/dia para o Brasil inteiro). Nunca iterar clube a clube.
- **Fonte única.** `football-data.org` cobre no free só Série A (`BSA`,
  TIER_ONE); Copa do Brasil/Libertadores são TIER_FOUR (€199/mês) e estaduais
  **não existem** no catálogo deles. Duas fontes **duplicariam `Partida`** — o
  unique por `fonteExternalId` não protege entre provedores.
- **Contrato de provedor** em `lib/partidas/` (`isProvedorPartidasConfigured()`),
  degradando para cadastro manual — convenção de dependência externa opcional.
- **Imagens fora da cota:** `media.api-sports.io` cobre escudos do catálogo
  nacional; rebater no Cloudinary. Matching de clube **exige revisão humana**
  (busca devolve feminino/U20/homônimos estrangeiros).
- **Não fazer:** widgets da API-Sports (expõem a API-KEY no HTML e gastam
  requisição por visita); chamada em runtime de RSC/Server Action.
- **Sync (Fase B, entregue):** `lib/partidas-sync/` (`contrato.ts` puro +
  `api-football.ts` + `sync.ts`) e cron `/api/cron/partidas-sync`
  (Bearer `CRON_SECRET`). `@@unique([afiliacaoId, fonteExternalId])` aplicado —
  `NULL` não colide, então partida manual segue livre. Gate
  `isProvedorPartidasConfigured()`; sem chave, Agenda fica no cadastro manual.
  Erro do provedor (`errors` com HTTP 200) **falha alto** → 502, nunca sucesso
  silencioso. Sem `AuditLog` (não há ator humano).
- **Partida manual é adotada, não duplicada:** antes de inserir, o sync procura
  jogo cadastrado à mão (±3h, adversário normalizado) e preenche o
  `fonteExternalId` dele. Sem isso, o primeiro sync duplicaria a Agenda de todo
  tenant que já a usava. Clássico entre dois clubes nossos = duas `Partida`
  (uma por `Afiliacao`, mando espelhado).
- **Temporada é variável** (`API_FOOTBALL_SEASON`): o free só libera 2022–2024,
  então a Fase B foi construída e testada contra 2024.

### 5.27 React Compiler — estado no render, não em effect (2026-08-12)

As regras do React Compiler seguem como **aviso** em `eslint.config.mjs`
(não silenciar, não bloquear). O passivo caiu de **100 → 19** numa campanha
medida; guia com receitas e armadilhas: `docs/frontend/react-compiler.md`.

- **As regras apontam defeito visível, não estilo.** `setState` em effect aplica
  o valor um frame depois: menu que sobrevive à navegação, busca com o termo
  antigo, lista ordenada errado, barra de persistência cinza com CTAs
  desabilitados (que o § UX proíbe). Escrita em ref durante o render quebra com
  render concorrente.
- **Padrão de correção:** ajustar estado **no render**, comparando com o último
  valor sincronizado (padrão oficial do React, já usado em
  `searchable-context-switcher`); ou eliminar o estado quando ele era só
  derivação (o `viewport` dos mapas do Brasil, a aba do painel em `sede-forms`).
- **Busca com debounce** guarda o par `(termo, itens)` da última busca
  concluída — "carregando" e "lista visível" viram derivação, e resultado de
  termo antigo para de aparecer sob o termo novo.
- **Primitivas** (preferir a inventar): `useLatestRef` (escreve em
  `useInsertionEffect`, ver ordem de execução no guia), `useHidratado`,
  `useMediaQuery`, `useOnline` — as três últimas sobre `useSyncExternalStore`.
- **Trocar `setState` em effect por escrita em ref no render não resolve**: só
  troca o aviso de nome. Em `post-media` a ref passou a guardar *qual* versão do
  embed foi montada, em vez de um booleano que precisava ser zerado.
- **Não fazer:** chamar callback do pai durante o render (`onCriado?.()` fica em
  effect — seria render aninhado); tratar todo aviso como defeito (medição em
  `useLayoutEffect` é o uso correto do padrão).
- **Passivo restante (19):** 2 sem correção viável — `immutability` no
  `sedes-map` (interop imperativo do Google Maps; em `useState` piora) e o
  bailout do `useVirtualizer` — e 17 `set-state-in-effect` onde a reescrita mexe
  em fluxo de verdade (restauração de rascunho do `wizard`, medição do
  `anchored-popover`). Atacar **um por vez**, com conferência de tela.

### 5.28 Loja segue o tenant ativo (2026-08-27)

A listagem `/portal/loja` unia **todos** os `SaasMembro` APROVADO do usuário.
Super Admin (presidente dos Gaviões) que trocava o canal para a Mancha via
`torcida_ctx` via a navbar certa e o catálogo errado: cards e destaques da
rival. A Comunidade já tinha fonte única = tenant ativo (§5.19); a loja não.

**Regra:** vitrine = worktree do portal ativo (`getVisibleTenantIds(ativo,
'loja')`) + aliados só se sócio dessa worktree. Compra = vínculo intersectado
com essa vitrine. Super-admin operador **lê** o catálogo que está operando e
**não** compra sem vínculo. Nenhum tenant rival/unrelated entra, mesmo com
membership na torcida-casa. Função pura `escoparLojaAoPortalAtivo`
(`lib/loja-escopo.ts`); invariantes em `lib/__tests__/loja-escopo.test.ts`.

### 5.29 Catálogo de clubes — fonte por campo e rivalidade com escopo (2026-08-27)

O catálogo era nome + UF + escudo + série. A auditoria contra fontes externas
(`docs/data/auditoria-catalogo-clubes.md`) mostrou três buracos com efeito de
produto: **91 clubes do Ranking Nacional de Clubes da CBF não existiam** (o
torcedor do Retrô ou do Amazonas não achava o time no onboarding); **10% das
cidades não eram município** (vinham do endereço da torcida — "Estádio Moça
Bonita", "571 Curitiba"); e `RivalidadeClube` tinha **12 pares, todos do lote
de teste** — Re-Pa, Ba-Vi, Clássico-Rei e Atletiba não isolavam nada.

**Decisões:**

1. **Uma fonte por campo, cada uma com o que ela mede** (catálogo avaliado em
   `docs/knowledge/fontes-dados-clubes.md`): CBF/RNC = existência profissional e
   relevância; Wikidata = fundação, estádio, capacidade, coordenada, site;
   Ogol = fundação e id externo; malha do IBGE = validador de cidade;
   Datafolha × Censo = torcedores; escudo no Cloudinary = cor. Cada campo novo
   de `Afiliacao` guarda também a procedência (`coresFonte`, `rncEdicao`,
   `wikidataQid`, `ogolId`).
2. **Rivalidade tem escopo.** `EscopoRivalidade` = `MUNICIPAL | ESTADUAL |
   INTERESTADUAL`, e só os dois primeiros isolam
   (`ESCOPOS_RIVALIDADE_ISOLANTE` em `@torcida/types`). Clássico interestadual
   (Flamengo × São Paulo) fica gravado como contexto: tratá-lo como isolamento
   apagaria boa parte da malha nacional entre torcidas sem ganho de segurança.
   Mais: nem todo clássico intraestadual isola — o dataset marca `isola` e o
   critério é **mesma cidade ou clássico nomeado** (Guarani × São Paulo é jogo
   tradicional, não conflito de torcida).
3. **Nome + UF não é chave.** Homônimo (Bahia × Bahia de Feira, Democrata GV ×
   SL) é resolvido por id externo e cidade; `chaveCanonicaClube` resolve alias
   em ciclo escolhendo representante estável, e `indexarClubes` devolve as
   colisões em vez de escondê-las — seed pula e reporta em vez de sobrescrever
   o clube errado.
4. **Torcida ganha situação de registro.** `SituacaoRegistroTorcida` a partir da
   lista publicada pela federação estadual (FPF). O enum é
   `SEM_REGISTRO_CONHECIDO`, não "irregular": ausência da lista não prova
   inexistência.

Aplicação por seeds idempotentes (`seed:clubes-rnc`, `seed:ficha-clubes`,
`seed:rivalidades-clubes`, `seed:torcidas-registro`, `repair:clubes-curados`),
medição contínua por `audit:catalogo-clubes` e invariantes puros em
`test:catalogo-clubes`.

### 5.30 Memória — linha do tempo (2026-08-30)

Superfície `/portal/memoria`: o eixo é o **dia civil** (fuso SP), não o feed.
**Fases 1–5 entregues:** unidade + linhagem + clube (Partida abre o dia no
recorte clube; só `PUBLICO`/`alcanceNacional`); fato atrasado (`MemoriaFato`,
nunca reescreve `Post.criadoEm`); aliados bilaterais (`Tenant.memoriaAliados`
default off, `settings:manage` na raiz); “quem estava” só com check-in +
opt-in (`PerfilMembro.memoriaPresencaVisivel`) no mesmo tenant. O recorte
segue o canal da Comunidade (cookie / top bar): CN = só clube (sem caravana
de unidade); torcida = linhagem; unidade = a unidade com chip opcional para
a torcida. Espinha pagina o mês civil (todos os dias, busca de data). Ícone
na top bar também na CN (`?escopo=clube`). Fila em `/admin/comunidade/memoria`.
Recurso `memoria` é `publico` e **não** cascateia em R5. Contrato:
`packages/types/src/memoria.js`. Doc: `docs/data/modulo-memoria.md`.

### 5.31 Brechó P2P entre sócios (2026-08-30)

Troca informal de camisa e material **pessoal** entre sócios é prática
cotidiana; bandeirão / trapo / uniforme de jogo **não** — são `PatrimonioItem`
com vistoria e escala. O brechó é uma praça nova, não uma `SaasCategoria`
do catálogo oficial: `BrechoLoja` + `BrechoAnuncio` na Sede raiz, sócio
aprovado na linhagem, R5 como a loja (unidade isolada não entra na praça
nacional). Aliados desligados (`Tenant.brechoAliados`, owner da raiz).
Interesse abre `Conversa` GRUPO; denúncia chama `STORE_*` de qualquer unidade
da linhagem. Score de confiança só no servidor, com peso em contraparte única.
Na UI o ranking é **0–5 estrelas relativas à praça** (5 = maior score ativo
da unidade) mais o número de **trocas** (venda, troca ou doação confirmada).
No hub `/portal/loja` a listagem é a mesma em toda torcida: grade de lojas
oficiais, depois a praça do brechó (card da torcida + as duas vitrines de
sócio mais confiáveis, com capa) acima dos destaques. Isolamento = raiz
do tenant ativo. Quem não é sócio da linhagem vê o card da praça, mas o
feed recusa. Doc: `docs/data/modulo-brecho.md`.
Regras puras em `packages/types/src/brecho.js`.

### 5.32 Confiança na torcida — ledger (2026-08-30)

Confiança **não** é permissão. `assertPermission` continua o único gate admin;
o score é um segundo eixo, sempre AND restritivo:
`groups:create`/`channels:manage`/`meetings:host` **e**
`temCapacidade(nivel, …)` no tenant (não na Comunidade Nacional). Eixo **local**
(`ConfiancaEvento` + `ConfiancaSaldo` por tenant): check-in, mensalidade paga,
aprovação/reprovação com laudo. Post/reação peso zero. Cargo `owner`/`admin`/`vice`
dá piso de nível 2 (lido ao vivo no gate). Score privado; badge de nível no
perfil; sem ranking. Distinto do score do brechó e do `ForumScoreSaldo`.
Doc: `docs/data/modulo-confianca.md`. Regras puras em
`packages/types/src/confianca.js`.

### 5.33 Moderação — rotular ≠ decidir; dever de cuidado é requisito (2026-09-01)

Três mudanças legais posteriores ao desenho atual tornam moderação **requisito
de arquitetura**, não feature de comunidade: **STF Tema 987** (art. 19 do MCI
parcialmente inconstitucional — notificação extrajudicial basta, e há **dever
de cuidado proativo** em discriminação/discurso de ódio, sem o limiar de risco
sistêmico que protegeria plataforma pequena), **ECA Digital (Lei 15.211/2025,
vigente 17/03/2026)** e **Lei 14.532/2023** (racismo em contexto esportivo,
agravado quando coletivo ou "em descontração"). Ver
`docs/knowledge/contexto-legal.md` § responsabilidade da plataforma.

Decisões fechadas:

1. **Rotular ≠ decidir** (modelo componível do Bluesky). Classificador e listas
   produzem `ConteudoSinal`; quem age é a **política** — piso da plataforma,
   que o tenant só pode **endurecer**. Classificador nunca pune sozinho em S3+.
2. **Três ações, não uma** (Meta *remove/reduce/inform*) + liberar. `oculto`
   deixa de ser a única resposta; entra redução de alcance e rótulo informativo.
3. **Fila de retenção** (Twitch AutoMod): conteúdo suspeito nem publica nem
   some — fica retido para revisão humana. É o que dá precisão sem exigir
   modelo perfeito.
4. **Reputação filtra antes do conteúdo** (Reddit): AND com o eixo **Confiança**
   já existente (§5.32). Autor nível 0/1 sempre classificado; nível 2+ só na
   suspeita. Corta custo de IA e concentra escrutínio onde mora o risco.
5. **Devido processo obrigatório** (Santa Clara / DSA / tese do STF): autor
   notificado com categoria e trecho, **recurso** com revisor ≠ decisor
   (validado no servidor), relatório de transparência.
6. **Preservar antes de remover**: S3/S4 grava `ConteudoPreservado` (snapshot +
   hash + metadados) antes do soft-delete — o ECA Digital exige a prova, e
   `oculto = true` não a guarda. Leitura de material preservado é **auditada**
   (o `AuditLog` atual só registra mutação).
7. **S4 não é decisão do tenant**: CSAM, aliciamento, autolesão, terrorismo,
   tráfico, ato antidemocrático, ameaça crível e NCII escalam automaticamente à
   plataforma, com exposição minimizada ao moderador local.
8. **Classificador**: `claude-haiku-4-5` com a política inteira no system prompt
   sob `cache_control` e saída estruturada — a política **é** o classificador, e
   muda sem retreino. Degradação graciosa obrigatória (`isModeracaoIAConfigurada`,
   padrão de `lib/livekit.ts`): falha de fornecedor nunca derruba publicação.
   **Perspective API foi descartada** — Google a descontinua após dez/2026.
   Mídia entra pelos add-ons do Cloudinary, sem mudar o pipeline de upload.
9. **Toda superfície tem denúncia.** `AlvoModeracao` cobre as 16 superfícies de
   UGC; alvo novo no produto exige entrada no enum. Hoje só Post, DM e brechó
   têm caminho — o **fórum da praça**, única superfície cross-tenant (torcidas
   rivais), não tem, e é o maior buraco.

Docs: `docs/data/modulo-moderacao.md` (spec), `docs/data/politica-de-conteudo.md`
(normativa), `docs/knowledge/moderacao-plataformas.md` (pesquisa e fontes).
Fecha o item **P1** do gate em `docs/data/plano-criptografia-e-moderacao.md` e
não altera a Fase A (segue sem E2EE, servidor legível — §5.23).

## 7. Auditoria funcional — achados abertos (2026-07-29)

Rodada de validação ponta a ponta sobre os lotes de teste em volume, com o
código de produção exercitado contra o banco (`pnpm --filter @torcida/web
audit:dados`) e com as Server Actions executadas de verdade (`audit:fluxos`,
sessão simulada). Lista completa, impacto e método em
`docs/ops/auditoria-funcional-2026-07.md`.

> **Status é medido, não anotado (2026-08-04).** `pnpm --filter @torcida/web
> audit:achados` confere item a item contra o código e o banco de hoje e
> imprime `FECHADO` / `EM ABERTO` / regressão. Foi assim que se descobriu que
> a lista abaixo estava desatualizada em cinco pontos: os itens **1, 2, 6, 8,
> 9, 11 e 12 já estavam corrigidos** e continuavam marcados como pendentes —
> uma lista de pendências que mistura resolvido com não-resolvido deixa de ser
> usada para priorizar. Ao fechar um item, marque aqui **e** deixe a sonda
> correspondente em `achados.audit.ts`: é ela que impede a volta.

Estado por item (✅ fechado com rede na auditoria · ⏳ em aberto):

1. ✅ **FECHADO** — Cargos de sistema desatualizados em 562/565 torcidas — `owner`/`vice`
   sem `bar:operate`, `bar:manage`, `members:dismiss`, `members:export_lge`,
   `affiliation:manage`. O módulo Bar está inacessível ao Presidente em
   praticamente toda torcida pré-existente. Cargo de sistema resolve pelo
   array gravado no `Role`, então permissão nova só chega via
   `db:repair-system-roles`. **Decisão em aberto**: rodar o repair no deploy,
   ou fazer cargo de sistema resolver pela constante em runtime (elimina a
   classe de bug). **Confirmado em fluxo real**: o Presidente de
   `torcida-fiel-macabra-sp` recebe "Sem permissão" ao chamar `abrirTurnoBar()`.
2. ✅ **FECHADO** — `listarComentariosPost` não respeitava rivalidade — comentário de post
   `PUBLICO` é legível por qualquer autenticado, sem escopo de tenant,
   contra `resolveVisibility(rival, PUBLICO) === false`. Decidir se a
   exceção é intencional (e documentá-la em `visibility.js`) ou se o gate
   precisa do escopo de tenants.
3. ⏳ **EM ABERTO** — `podeVerPost` tem nome de gate completo mas não checa hierarquia nem
   rivalidade** — só privacidade de perfil. Seguro hoje porque o único
   chamador filtra tenants antes; renomear ou passar o escopo.
4. ⏳ **EM ABERTO** — `alcanceNacional` em post `INSTITUCIONAL` é inerte — o feed nacional
   filtra `tipo: MEMBRO`. Bloquear no composer ou passar a incluir.
5. ⏳ **EM ABERTO** — `MembroConversa` órfão em canal privado de
   `torcida-organizada-remista-pa` — nenhum script de repair cobre o caso.
6. ✅ **FECHADO** (`assertPodeDelegar`) — `roles:manage` escalava privilégio (rodada 3, 2026-07-30) — `criarRole`
   não limita as permissões concedidas ao conjunto efetivo de quem cria.
   Provado em fluxo: ator sem `settings:manage` criou cargo com
   `settings:manage`, vestiu, e passou a ter. Na prática `roles:manage`
   equivale a owner, e delegar "gestão de acessos" delega tudo.
   `salvarAcessoUsuario` grava overrides com a mesma lacuna. **Decisão em
   aberto**: documentar como intencional, restringir ao conjunto do ator, ou
   separar a permissão de conceder permissões sensíveis.
7. ⏳ **EM ABERTO** — Override negado não rege o feed público (alerta) — com
   `community:post` negado, `assertAutorPublicacaoPost` cai no caminho de
   torcedor (`podePublicarComoTorcedorFeed`). Confirmar se é intencional e
   documentar em `permissions.js`.
8. ✅ **FECHADO** (`TRANSACAO_PROMOCAO_OPTS`) — `promoverSedeParaTenant` estourava a transação (rodada 4, 2026-07-30) —
   `lib/promover-sede.ts:122` faz ~40 round-trips sequenciais numa interactive
   transaction **sem `timeout`** (default 5 s do Prisma); só o seed canônico
   (10 deptos + 22 perfis, em série) mediu 5,86 s contra o banco remoto. A
   promoção faz rollback inteiro. O orçamento é o RTT, não a lógica — passa
   co-localizado, cai em rede distante. Mesma classe de `03d62a8`. Fix:
   `{ timeout: 30_000 }` ou tirar o seed canônico da transação.
9. ✅ **FECHADO** (`getTenantRelationCrua` usa `findSedeRaiz`) — relação de tenant partia de um nó arbitrário da árvore (rodada 4,
   **latente**) — `getTenantRelationImpl` (`lib/hierarquia.ts:305`) escolhe a
   sede do ator com `findFirst({ where: { tenantId } })`, sem preferir
   `tipo: 'SEDE'` e **sem `orderBy`**, ao contrário das funções irmãs
   (`getAncestorTenantIdsImpl`, `getDescendantTenantIdsImpl`,
   `getTenantHierarquia`). Em torcida com várias unidades a varredura começa
   no meio da árvore: a Sede mãe perde a relação de ancestral sobre a própria
   filha (financeiro/membros/sócios/pedidos/patrimônio viram `unrelated`).
   Sem `orderBy`, a ordem do Postgres não é estável — o mesmo tenant passa
   numa execução e falha na seguinte. Provado por contraste em
   `docs/ops/auditoria-funcional-2026-07.md` §Achado 9.
10. ⏳ **EM ABERTO** — Super admin no `/portal` resolve tenant só por cookie (2026-07-30,
    **UX/diagnóstico**) — `getActiveTenant` (`lib/tenant.ts:186`) pula toda a
    resolução por vínculo quando `isSuperAdminEmail(email)`, caindo direto em
    `torcida_ctx` → `TENANT_SLUG` do deploy. Quem administra a plataforma tem
    `SaasMembro` APROVADO/SOCIO na própria torcida, mas nunca é levado a ela:
    basta abrir uma das ~569 torcidas no `/super-admin` para o cookie ficar
    apontando para outra, e todo link direto do portal (`/portal/eventos/<id>`,
    pedido, evento, membro) passa a devolver **404 mudo** — o id existe, só não
    naquele tenant. O `notFound()` não distingue "não existe" de "existe em
    outro contexto". Sintoma reproduzido com `agenda-demo-caravana-01`
    (tenant `pde-gavioes-fiel`). **Decisão em aberto**: (a) fazer o vínculo do
    super admin valer como fallback antes do `TENANT_SLUG`, (b) mostrar no
    portal qual torcida está ativa quando o contexto veio de cookie de super
    admin, ou (c) diferenciar a resposta quando a entidade existe em outro
    tenant. A opção (a) resolve a classe toda; (b) é o mínimo para o 404
    deixar de ser mudo.
11. ✅ **FECHADO** (`reconciliarNotificacoesDoEvento`) — reconciliação de leitura cobria 1 de N (rodada 5, 2026-07-30) — o
    fan-out cria uma `Notificacao` por destinatário, mas o `updateMany` que
    marca lida é escopado em `userId: session.user.id`. Medido: pedido de
    grupo resolvido deixa 1 de 2 admins com badge preso; denúncia resolvida
    deixa **6 moderadores**. Vale para `decidirPedidoGrupo`,
    `decidirPedidoCanal`, as 4 funções de moderação e
    `marcarSolicitacoesLidas`. Quanto maior a equipe, pior. Fix: reconciliar
    por critério do evento (tipo + ator + entidade), não por destinatário.
12. ✅ **FECHADO** (`desligadoEm: null` no filtro) — ex-membro seguia recebendo comunicado (rodada 5) — `desligarMembro`
    grava `desligadoEm` sem mexer no `status`, e
    `listarUserIdsMembrosAprovados` filtra só `status: 'APROVADO'`. Quem saiu
    continua no fan-out de `notificarMembrosAprovados` (comunicado urgente).
    Fix: incluir `desligadoEm: null` no filtro e conferir os demais
    consumidores de "membro aprovado".

### Rodada 8 (2026-08-04) — lote de jornadas, áreas/projetos e status medido

Método novo: em vez de semear `SaasMembro` por `createMany`, o lote
**jornadas** (`docs/ops/lote-jornadas.md`) faz as pessoas entrarem pelas
Server Actions reais, pelos três fluxos de entrada, e depois criarem canais,
áreas e projetos. Achados que só aparecem quando o caminho é percorrido:

13. ✅ **FECHADO** — **Escalada de privilégio por `salvarPerfilComposto`**
    (segunda porta do Achado 6). `salvarAcessoUsuario` ganhou
    `assertPodeDelegar`; a criação de **perfil composto** ficou de fora e
    continuava concedendo o que o ator não tem. Provado em fluxo: um `admin`
    de `torcida-organizada-coringao-chopp-sp` criou um cargo com
    `settings:manage` sem possuí-la (o formulário ainda aceita `userId`, então
    dava para vestir no mesmo request). Guard aplicado; regressão coberta por
    `audit:achados` §7 #6.
14. ✅ **FECHADO** — **Transação de acesso e de vínculo sem `timeout`**
    (mesma classe de `03d62a8` e do item 8). `salvarAcessoUsuario` sincroniza
    a presença do usuário nos canais de todos os departamentos dentro da
    transação: falhou em **5 de 5** torcidas com `Transaction not found`,
    tornando impossível promover alguém a admin. `solicitarVinculo` toma o
    advisory lock do nº de associado e checa unicidade na linhagem inteira:
    falhou em 3 inscrições, todas no Gaviões (a maior torcida), devolvendo
    "Aguarde e tente novamente" num cadastro válido. Os dois com
    `{ timeout: 20_000, maxWait: 10_000 }`.
15. ⏳ **EM ABERTO** — **Sócio aprovado pode nascer com a carteirinha
    vencida.** `aprovarMembro` auto-emite a digital com
    `validade = dataExpedicaoCarteirinha + periodicidade`, e quem entra por
    «já sou sócio» **declara** a expedição do cartão físico. Cartão com mais de
    um ano + plano ANUAL ⇒ digital nasce vencida, e `canais.ts` barra a pessoa
    em **todos** os canais no minuto seguinte à aprovação — sócia, com cargo
    `member` e `messages:send`, sem conseguir entrar em canal nenhum. Medido:
    12 carteirinhas emitidas pelo lote, todas com validade no passado.
    **Decisão em aberto**: contar a validade da aprovação, exigir cartão
    vigente no wizard, ou manter (e então dar à pessoa uma saída visível em
    vez de "canal não encontrado"). O lote mantém um caso por torcida de
    propósito, para a tela de regularização ter sujeito.
16. ⏳ **EM ABERTO** — **O ramo de Comunidade Nacional de `entrarCanal` é
    inalcançável.** O ramo valida exatamente o que deveria bastar para um
    torcedor sem torcida ativa (canal `PUBLICO`, tenant não-sintético, mesma
    afiliação) e então chama `inscreverCanal` →
    `assertElegibilidadeMembroCanal`, que exige `SaasMembro` no tenant do
    canal — o que um torcedor da CN, por definição, não tem. Resultado:
    "Você precisa ter vínculo com a torcida deste canal para participar",
    sempre. **Decisão em aberto**: liberar CN em canal `PUBLICO` (e então o
    gate precisa de um nível novo) ou remover o ramo, que hoje só engana quem
    lê o código. Medido em `seed:jornadas` §canais/nacional.

17. ✅ **FECHADO** (recusarCanalDaSede) — **Convite da Sede raiz coloca torcedor e sócio pendente
    dentro do canal oficial da Sede.** A regra está escrita duas vezes no
    código: `vincularMembroCanaisAposAprovacao` diz *"TORCEDOR entra só no
    canal da unidade que o convidou — nunca no da Sede; o canal da Sede é
    espaço de sócio"*, e `solicitarVinculo` reforça *"sem sedeId não chama —
    vincular sem unidade cairia no canal da Sede, que é de sócio"*. Só que
    `decidirPassoInicialConvite` pré-seleciona a **própria SEDE** como unidade
    quando o convite é da raiz — então `sedeId` existe, o guard passa, e
    `canalDaUnidade` **é** o canal da Sede. A regra é burlada pela geometria,
    não por uma falha de lógica. Medido no lote de jornadas: 8 dos 10
    torcedores e todos os pendentes de convite-da-raiz entraram lá. No banco
    inteiro há 688 TORCEDOR, 8 SOCIO PENDENTE e 4 SOCIO REPROVADO ativos em
    canal oficial de `tipo: 'SEDE'` (número é teto — parte vem de seed/repair,
    não do fluxo). **Decisão em aberto**: (a) tratar "unidade == Sede raiz"
    como caso de sócio e não inscrever torcedor, aceitando que em torcida de
    unidade única o torcedor fica sem canal; (b) manter e reescrever a regra,
    que hoje descreve algo que não acontece; (c) separar o canal da organizada
    do canal da sede territorial.
18. ✅ **FECHADO** (removerMembroDosCanaisDaTorcida) — **Reprovado continua no canal da unidade.** A inscrição
    acontece na **solicitação** (sócio pendente = experiência de torcedor), e
    `reprovarMembro` não a desfaz. Quem foi recusado — inclusive por
    `DUPLICIDADE`, com `permiteReenvio: false` — segue lendo o canal da
    unidade por tempo indeterminado. 4 casos no banco. **Decisão em aberto**:
    remover a inscrição na reprovação, ou documentar que recusado mantém o
    acesso de torcedor.

19. ✅ **FECHADO** — **Sócio pendente de unidade Caso B não entrava em canal
    nenhum.** A unidade promovida tem canal **emprestado**: a `Sede` é do
    tenant-filho (`subsede-rio-claro`), mas a `Conversa` está hospedada no
    tenant da mãe (`pde-gavioes-fiel`). Na inscrição,
    `assertElegibilidadeMembroCanal` resolve o vínculo pelo `conversa.tenantId`
    e acha o **espelho** PENDENTE na mãe; o fallback de canal emprestado só
    troca o `tenantVinculoId` quando o vínculo da unidade está **ativo**
    (`if (naUnidade && (!membro || estaAtivo(naUnidade)))`) — e pendente não
    está. A carve-out seguinte, que existe justamente para liberar o SOCIO
    PENDENTE no canal da própria unidade, então procura em
    `tenantId: <mãe>, espelhado: false` e não acha nada. Resultado: quem entra
    pelo convite da unidade Caso B fica com **zero** `MembroConversa`, enquanto
    quem entra pelo convite da Sede raiz entra. Medido: 2 de 2 pendentes de
    `subsede-rio-claro` no lote de jornadas. **Corrigido**: o bloco só roda
    quando o vínculo do tenant hospedeiro **não** está ativo, então o da
    unidade dona nunca é pior — a guarda `(!membro || estaAtivo(naUnidade))`
    virou `if (naUnidade)`. Verificado em fluxo: os 2 pendentes de
    `subsede-rio-claro` passaram de 0 para 1 canal, e os outros 8 pendentes do
    lote não mudaram.

20. ✅ **FECHADO** (--reconciliar aplicado) — **Carteirinha do Caso B diverge entre os dois níveis.**
    `garantirCarteirinhaNoPar` sincroniza a validade (compara e faz `update`
    quando difere), mas há sócios **reais** com o mesmo `numeroSocio` e
    validades diferentes na unidade e na Sede — 2 casos em
    `pde-fiel-baixada-praia-grande-praia-grande` × `pde-gavioes-fiel`, com 2 e
    3 dias de diferença. As duas carteirinhas foram emitidas de forma
    independente e nunca passaram pelo espelho. Importa porque o gate de canal
    (`assertElegibilidadeMembroCanal`) resolve pelo `tenantVinculoId`: a mesma
    pessoa pode estar vigente num nível e vencida no outro, e a resposta muda
    conforme o canal que ela abre. `db:repair-carteirinha-espelho` existe para
    isso — **decisão em aberto**: rodar o repair (dado de produção, exige
    confirmação) e depois fechar a porta que permitiu a emissão independente.
    Detectado por `audit:carteirinha-patrimonio`, primeira execução.

21. ✅ **FECHADO** (migração na promoção + repair aplicado) — **Promover unidade a tenant deixa as carteirinhas para
    trás.** `promoverSedeParaTenant` migra os `SaasMembro` da unidade para o
    tenant novo (`findMany` → `update` do `tenantId`), mas **não toca em
    `SaasSocio`**. A carteirinha fica no tenant da mãe, apontando para uma
    torcida onde a pessoa já não tem vínculo. **45 casos** no banco (ex.:
    `douglas.mendes.901` tem `SaasMembro` em `subsede-rio-claro` e
    `SaasSocio` em `pde-gavioes-fiel`). Duas consequências, e a segunda é a
    grave: (a) o sócio some das abas Ativos/Vencendo do tenant novo e volta
    para "Aguardando emissão", apesar de ter carteirinha; (b) a carteirinha
    órfã mantém `numeroSocio` — bloqueando aquele número na Sede — e um
    `qrToken` **válido**, que segue validando no portão de uma torcida da qual
    a pessoa saiu. **Fix**: mover `SaasSocio` junto na mesma transação da
    promoção (`@@unique([tenantId, numeroSocio])` exige checar colisão no
    destino), e um repair para os 45 já existentes. Detectado por
    `audit:carteirinha-patrimonio`, primeira execução.

22. ✅ **DECIDIDO E ALINHADO (2026-08-04).** **Três lugares do
    código discordam sobre se SOCIO PENDENTE pode estar no canal da unidade**,
    e um deles desfaz ativamente o que outro cria:
    - `solicitarVinculo` **inscreve** o pendente no canal da unidade, com
      comentário explícito: *"sócio pendente: mesma experiência de torcedor
      (CN + PDE) até a aprovação"*;
    - `assertElegibilidadeMembroCanal` tem uma **carve-out** dedicada que
      libera SOCIO PENDENTE no canal da própria unidade;
    - `dados-reais.audit.ts` (§*membro PENDENTE não está em canal oficial da
      unidade*) reporta **erro** para qualquer não-APROVADO ATIVO em canal de
      unidade, e aponta para `repair-canal-membro-pendente-aprovado.js`, que
      *"encerra ATIVO sem SaasMembro local aprovado/ativo"* — ou seja, expulsa
      exatamente quem o onboarding acabou de colocar.
    Consequência prática: o estado do roster **oscila conforme o que rodou por
    último**, e nenhuma das duas leituras é estável. Hoje são 14 casos.
    Também é o motivo de a correção do item 19 *aumentar* a contagem do
    `audit:dados` — ela faz o Caso B se comportar como o Caso A já se
    comportava, o que está certo pelas regras (1) e (2) e errado pela (3).
    **Regra decidida (2026-08-04)** — pendente **entra, mas só lê**, com
    permissões de torcedor, e **apenas se chegou por link de convite**. Quem
    chegou pela vitrine pública fica só na Comunidade Nacional do clube. E a
    comunidade da **torcida** (canal da SEDE) só se abre **depois da
    aprovação**, em qualquer dos caminhos.

    Implementação, com as quatro fontes agora dizendo a mesma coisa:
    - `solicitarVinculo` só inscreve o pendente quando `conviteSlug` resolve
      para a linhagem do tenant do vínculo — procedência é declarada pelo
      cliente e por isso **conferida** no servidor; e passa
      `recusarCanalDaSede`, que fecha o §7 17.
    - "Só lê" não precisou de papel novo: publicar no mural exige
      `assertMembroAtivo` (status APROVADO), então o pendente já lia sem
      escrever. Evitou-se mexer no enum de `MembroConversa`.
    - `dados-reais.audit.ts` passou a medir a regra real — não-aprovado no
      canal da **SEDE** é erro; no canal da unidade filha é o comportamento, e
      só é contado para dar dimensão.
    - `repair-canal-membro-pendente-aprovado.js` deixou de expulsar o pendente
      do canal da unidade; segue encerrando no canal da SEDE.
    - `ESPERADO_POR_FLUXO` documenta que o lote entra sempre por convite, e
      que pela vitrine o esperado seria `false`.

**Higiene aplicada (2026-08-04/05)**, depois de corrigir as ferramentas — em
dois casos o repair era mais perigoso que o problema:
- `db:repair-system-roles --permissions-only`: 4 `Role` (owner/admin em 2
  torcidas) voltaram ao pacote do código. 571/571 em dia.
- `db:repair-departamento-orfaos`: 23 `UserDepartamento` e 28 `UserRole` de
  perfil de departamento em usuário inelegível.
- `db:repair-aprovado-canal-membro`: 4 pares criados, 51 promovidos.
- `db:repair-canal-membro-pendente-aprovado`: **de 487 para 121**. O script
  não conhecia o **canal emprestado** — media o vínculo só no tenant que
  hospeda a `Conversa` — e teria expulsado **88 membros legítimos** de unidade
  Caso B. E encerrava por **carteirinha vencida**, que é estado temporário e
  reversível enquanto sair do canal não é (a reinscrição só acontece numa nova
  aprovação): 278 sócios que voltariam sozinhos ao regularizar. As duas coisas
  foram corrigidas; vencer agora só entra atrás de `--encerrar-vencidos`.
- `dados-reais.audit.ts` foi alinhado às mesmas três regras (canal emprestado,
  Caso B no canal da Sede, pendente na unidade filha). **8 erros → 0**, com o
  volume de carteirinhas vencidas virando alerta dimensionado em vez de falha.

Cobertura nova: `audit:areas-projetos` (áreas de atuação e projetos —
**zero** cobertura antes; o banco também estava sem nenhuma
`DepartamentoAreaMembro` e nenhum `Projeto`), `audit:carteirinha-patrimonio`
(`SaasSocio` e `PatrimonioItem`, os dois últimos modelos sem rede — achou o
item 20 e um bug do seed que gerava carteirinha vencendo **antes** de ser
expedida) e `audit:achados` (status medido desta lista).

`audit:tudo` roda as 13 em sequência e consolida — sequencial de propósito,
porque várias mutam e revertem no mesmo banco. O resumo distingue "encontrou
achado" de "não conseguiu rodar": uma suíte que não executa não é uma suíte
sem achados.

Rodada 7 (`audit:loja`) fechou **sem achados**, com destaque para a
**concorrência de estoque**: dois checkouts simultâneos na última unidade
resolvem sem oversell, apesar de o decremento ser read-modify-write sobre
coluna JSON. Cupom vencido, de primeira compra e de outra torcida são
recusados; cancelamento devolve estoque; rivalidade também bloqueia
seguimento. **Limite de uso de cupom não existe no modelo** — se for
desejado, é feature nova.

Rodada 6 (`audit:mensageria`) fechou **sem achados**: a segregação
sócio×sócio de torcidas rivais está enforced no servidor (leitura e escrita),
o bloqueio é bidirecional e não contornável por grupo, e **recusar uma
solicitação de DM grava `BloqueioUsuario`** — recusa vale como bloqueio.
O Achado 9 **não** se propagou até `isParRivalSocio` no par testado, mas a
checagem ficou no arquivo porque o defeito é sensível à ordem do Postgres.

A auditoria de notificações de 2026-07-22 foi **reverificada em fluxo** na
rodada 5: "NOVA_MENSAGEM é tipo morto" e "não existe SEGUIMENTO_REJEITADO"
estão **derrubadas**; "badge preso" está parcialmente corrigida (sobrou o
item 11). Detalhe em `docs/ops/auditoria-funcional-2026-07.md` §Rodada 5.

Rodada 3 (`audit:fluxos-avancados`) cobriu, todas **conformes**: capacidade /
lista de espera / promoção automática / check-in de Eventos; estorno, fiado e
fechamento de caixa do Bar com o espelho no livro-caixa; imutabilidade dos
cargos de sistema; ciclo de vida do convite de grupo e a regra do último
administrador.
