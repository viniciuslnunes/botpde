# Torcida SaaS

Plataforma multi-tenant para **torcidas organizadas de futebol**: operação (membros, departamentos, RBAC), mobilização (eventos, presença), comunidade (feed, alianças, salas), loja, financeiro, bar e patrimônio — com portal do associado, painel admin e bot Discord legado.

> Repositório privado. Não commite `.env`, tokens, senhas ou URLs com credenciais.

---

## Finalidade

O produto atende a hierarquia típica de uma torcida:

```
Sede (torcida principal)
 └─ Subsede
     └─ PDE (Ponto de Encontro)
```

Cada unidade pode ser um **tenant** (assinatura bottom-up: um PDE pode entrar antes da sede-mãe). Isolamento de dados por `tenantId`; visibilidade cross-tenant controlada (hierarquia + alianças).

| Superfície | Público |
|---|---|
| **Portal** (`/portal`) | Associados e torcedores |
| **Admin** (`/admin`) | Diretoria / gestores da unidade |
| **Super-admin** (`/super-admin`) | Operadores da plataforma |
| **Bot Discord** (`apps/bot`) | Canal legado ainda em uso |

Não é rede social genérica: cada módulo resolve uma dor operacional da torcida (aprovação de membros, agenda, comunicados, cobrança, caixa do bar, etc.).

Mapa de domínio completo: [`docs/product/dominio.md`](./docs/product/dominio.md).

---

## Regras de negócio

### Âncoras do domínio

| Conceito | Significado no produto |
|---|---|
| **`Afiliacao`** | O **time** que a torcida apoia (razão de existir). Entidade **global** — não se chama “clube” no modelo. Jogos, notícias e Comunidade Nacional chaveiam por afiliação. |
| **Hierarquia territorial** | Sede → Subsede → PDE. Um nó pode existir antes de virar tenant; venda é **bottom-up**. |
| **Tenant** | Unidade assinante (sede, subsede ou PDE). Dados SaaS isolados por `tenantId`. |
| **Aliança** | Relação curada e **mútua** entre torcidas; libera só conteúdo **público** entre aliados. |
| **Rivalidade** | Bloqueio técnico de visibilidade (anti-infiltração). Uso **só** para segurança/moderação — nunca ranking de conflito. |

### Atores

| Perfil | O que pode |
|---|---|
| **Torcedor** | Funil de aquisição; Comunidade Nacional (posts públicos da afiliação); sem acesso ao interno da TO. |
| **Associado (sócio)** | Portal da unidade + abas Nacional × Minha torcida; eventos, comunicados, carteirinha. |
| **Admin / Diretoria** | Opera membros, eventos, comunicados, caixa — conforme permissões. |
| **Presidente (owner)** | Governança: afiliação, alianças, cargos, configuração. |
| **Super-admin** | Operação da plataforma (tenants, handoff de owner). |

### Visibilidade cross-tenant

Implementação: [`packages/types/src/visibility.js`](./packages/types/src/visibility.js) + [`apps/web/src/lib/hierarquia.ts`](./apps/web/src/lib/hierarquia.ts).

| Relação do ator → alvo | Público (loja, sedes, eventos, comunidade) | Restrito (membros, sócios, pedidos, financeiro, patrimônio) |
|---|---|---|
| `self` / `ancestor` | sim | sim |
| `descendant` / `allied` | sim | não |
| `rival` / `unrelated` | não | não |

Regra resumida: sede vê tudo dos filhos; filho só vê o público da mãe; aliado só o público; rival **não vê nada**.

### Autorização e departamentos

- Mutações administrativas: `assertPermission` no servidor — **único** critério do admin ([`authz.ts`](./apps/web/src/lib/authz.ts)).
- Permissões efetivas = união de **cargos (`Role`)** + **departamento** (membro e/ou gestor) + overrides pontuais — escopo por tenant.
- **Preferência ≠ membership:** no onboarding, `departamentoId` no sócio é só preferência; entrar na equipe do depto só após `aprovarMembro` (ou “Sem área”). Ver [modulo-departamentos.md](./docs/data/modulo-departamentos.md).
- Toda mutação administrativa grava **`AuditLog`**.

### Comunidade e adesão (regras-chave)

- **Comunicado oficial** (`Announcement`) ≠ mural/`Post`; exige `announcements:publish`.
- **Torcedor** só enxerga escopo Nacional; conteúdo interno da TO é do sócio aprovado.
- Membro **pendente/reprovado** não faz RSVP (`assertMembroAtivo`).
- Eventos podem ser globais ao tenant ou restritos a uma `Sede` (`Evento.sedeId` ↔ `SaasMembro.sedeId`).
- Check-in é independente do RSVP (`checkedInAt`).

### Ética e legal

- Torcida organizada = associação civil; produto considera **Lei Geral do Esporte** (cadastro, responsabilidade) — [`docs/knowledge/contexto-legal.md`](./docs/knowledge/contexto-legal.md).
- Rivalidades e cores de rival **não** alimentam recomendação de aliados nem identidade visual ofensiva — [`docs/knowledge/aliancas.md`](./docs/knowledge/aliancas.md), [`identidade-visual-cores.md`](./docs/knowledge/identidade-visual-cores.md).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | **pnpm** workspaces + **Turborepo** |
| Web | **Next.js 16** (App Router, RSC / Server Actions), **React 19**, Tailwind CSS v4 |
| Auth | **NextAuth v5** (Discord + Google + Credentials) |
| Dados | **PostgreSQL** + **Prisma 6** (`packages/db`) |
| Validação / RBAC | **Zod** + permissões em `@torcida/types` |
| UI compartilhada | `@torcida/ui` |
| Bot | **Discord.js 14** + `pg` cru (legado) |
| Realtime (opcional) | **LiveKit** (Meet), **Redis** / Upstash (SSE multi-réplica) |
| Mídia (opcional) | **Cloudinary** |
| Observabilidade (opcional) | **Sentry** |
| Pagamentos (opcional) | PIX mock ou **Mercado Pago** |
| Testes | Vitest (unit), Playwright (e2e) |
| Runtime | **Node.js ≥ 20** |

---

## Estrutura do monorepo

```
botpde/
├── apps/
│   ├── web/          Next.js — portal, admin, super-admin, onboarding
│   └── bot/          Bot Discord (deploy isolado; sem workspace:*)
├── packages/
│   ├── db/           schema.prisma + Prisma Client + seeds
│   ├── types/        Zod, permissions, visibility, regras de domínio
│   └── ui/           Componentes React + services
├── .claude/agents/   Definições dos agentes especializados
├── docs/
│   ├── agents/       Quando usar cada agente + fluxo por feature
│   ├── knowledge/    Memória de domínio (alianças, legal, governança…)
│   ├── data/         Specs por módulo
│   ├── product/      Roadmap e mapa de domínio
│   └── ops/          Deploy, CDN, plano de infra
├── ARCHITECTURE.md   Decisões técnicas (as-is / to-be)
└── CLAUDE.md         Guia curto para agentes / contribuidores
```

---

## Módulos

Cada módulo tem superfície no **portal** (associado/torcedor) e/ou no **admin** (gestão). Specs canônicas em [`docs/data/`](./docs/data/).

### Operação e pessoas

| Módulo | Portal | Admin | O que faz |
|---|---|---|---|
| **Membros / cadastro** | Cadastro, status, unidade | `/admin/membros` (+ importação) | Fila de aprovação, vínculo a `Sede`, preferência de departamento |
| **Sócios / associação** | Carteirinha, planos, home do sócio | `/admin/socios`, `/admin/planos-associacao`, `/admin/cobrancas` | Planos, cobrança PIX (mock ou Mercado Pago), inadimplência, LGE |
| **Sedes / unidades** | Contexto da unidade | `/admin/sedes`, `/admin/hierarquia`, `/admin/torcida` | CRUD territorial, árvore Sede→Subsede→PDE, visão worktree |
| **Departamentos / acessos** | — | `/admin/acessos`, `/admin/configuracoes` | Cargos, deptos (membro/gestor), permissões efetivas |
| **Alianças** | Conteúdo público de aliados | `/admin/aliancas` | Alianças mútuas + recomendações; rivalidade bloqueia visão |
| **Afiliações (solicitações)** | Pedido de vínculo | `/admin/afiliacoes` | Pedidos de afiliação à torcida |

Docs: [modulo-associacao.md](./docs/data/modulo-associacao.md), [modulo-departamentos.md](./docs/data/modulo-departamentos.md).

### Mobilização e comunidade

| Módulo | Portal | Admin | O que faz |
|---|---|---|---|
| **Agenda / eventos** | `/portal/eventos` | `/admin/eventos` | Lista/semana/mês, RSVP, capacidade + waitlist, série, mapa, check-in QR; caravanas/bateria como tipos |
| **Comunidade** | `/portal/comunidade` | `/admin/comunidade/*` | Feed, mural, comunicados oficiais, moderação, notícias; **Comunidade Nacional** por afiliação |
| **Salas (Meet)** | Dentro da comunidade | Host com `meetings:host` | Chat/presença/enquetes; vídeo opcional via LiveKit |
| **Onboarding** | `/onboarding` | — | Wizard de adesão, escudos, estimativa de base digital |

Docs: [modulo-eventos.md](./docs/data/modulo-eventos.md), [modulo-comunidade.md](./docs/data/modulo-comunidade.md), [modulo-salas.md](./docs/data/modulo-salas.md), [spec-onboarding.md](./docs/data/spec-onboarding.md).

### Caixa, comércio e patrimônio

| Módulo | Portal | Admin | O que faz |
|---|---|---|---|
| **Loja** | Catálogo, sacola, checkout | `/admin/loja` (catálogo, pedidos, cupons, categorias) | Multi-item, cupons; catálogo da sede pode cascatear filhos |
| **Bar** | — | `/admin/bar` (PDV, produtos, estoque, vendas) | Venda rápida PIX/dinheiro/cartão; estoque por unidade; lança no Financeiro (`BAR`) |
| **Financeiro** | Extrato (quando autorizado) | `/admin/financeiro` | Livro-caixa por categoria/unidade; balanço e turnos |
| **Patrimônio** | Consulta | `/admin/patrimonio` | Inventário de bens da torcida |

Docs: [modulo-loja.md](./docs/data/modulo-loja.md), [modulo-bar.md](./docs/data/modulo-bar.md), [modulo-financeiro.md](./docs/data/modulo-financeiro.md), [modulo-patrimonio.md](./docs/data/modulo-patrimonio.md).

### Identidade e plataforma

| Módulo | Onde | O que faz |
|---|---|---|
| **Design** | `/admin/design` | Marca, cores, grade do shell; paleta prioriza torcida→escudo→clube (sem cor de rival) |
| **Relatórios** | `/admin/relatorios` | KPIs cross-módulo (gate `reports:view`) |
| **Auditoria** | `/admin/auditoria` | Histórico de mutações administrativas |
| **Super-admin** | `/super-admin` | Tenants, handoff de owner, setup da plataforma |

Doc Design: [modulo-design.md](./docs/data/modulo-design.md).

---

## Área administrativa (`/admin`)

Painel da **diretoria/gestores** da unidade (tenant). O menu é **estático no código** e **filtrado por permissão efetiva** — nunca por nome de cargo.

- Menu: [`packages/types/src/menu.js`](./packages/types/src/menu.js) (`ADMIN_MENU` + seções)
- Gate de mutação: `assertPermission` em Server Actions ([`authz.ts`](./apps/web/src/lib/authz.ts))
- Layout: `apps/web/src/app/admin/`

### Seções do menu

| Seção | Itens típicos |
|---|---|
| **Geral** | Dashboard, Visão da torcida |
| **Pessoas** | Membros, Sócios |
| **Operação** | Agenda, Sedes, Hierarquia |
| **Loja** | Catálogo, Pedidos |
| **Bar** | PDV, Produtos, Estoque, Vendas |
| **Comunidade** | Visão geral, Comunicados, Mural, Moderação, Notícias |
| **Financeiro** | Livro-caixa, Planos de sócio, Cobranças |
| **Patrimônio** | Inventário |
| **Governança** | Afiliações, Alianças, Controle de acesso, Relatórios, Auditoria, Design, Configurações |

Quem só tem `reports:view` (colaborador de área) enxerga no máximo **Dashboard + Relatórios** — sem itens de operação.

### Kit de UI e inteligência

Páginas admin novas usam o kit em `apps/web/src/components/admin/ui/` — não reinventar header/KPI/tabela inline.

| Peça | Uso |
|---|---|
| `AdminPageHeader` | Título, descrição, ações, voltar |
| `StatCard` / `KpiGrid` | Indicadores com motion |
| `StatusBadge` | Status por domínio (membro, pedido, RSVP…) |
| `TableShell` + `TablePagination` | Listagens + paginação |
| `InsightSection` | Blocos de insight nos hubs e em Relatórios |
| Charts SVG | `Sparkline`, `MiniBarChart`, `DonutChart`, `TrendDelta` (cores via CSS vars do tenant) |

- Insights: [`admin-insights.ts`](./apps/web/src/lib/admin-insights.ts) — bucketing em JS no fuso `America/Sao_Paulo` (nunca `date_trunc` SQL em UTC).
- Formulários longos (design, loja, sedes, deptos, onboarding): **`StickyPersistBar`** (Salvar/Cancelar fixos; some ao limpar dirty).
- Guia: [`docs/frontend/admin-ui-kit.md`](./docs/frontend/admin-ui-kit.md) · decisões: `ARCHITECTURE.md` §5.12.

### Relatórios (`/admin/relatorios`)

Hub cross-módulo com período 30d / 90d / 12m: Financeiro, Membros, Associação, Bar, Loja, Eventos e Comunidade — cada seção em `<Suspense>` próprio.

---

## Time de agentes

O projeto é desenvolvido com um **time de agentes especializados** (Claude Code / Cursor). Definições em [`.claude/agents/`](./.claude/agents/); guia de uso em [`docs/agents/README.md`](./docs/agents/README.md).

**Princípios:** planejar antes de codificar; escopo mínimo; preferir Sonnet / modelo Auto da sessão; autorização sempre no servidor; cada feature justificada pelo domínio.

### Papéis

| Agente | Quando usar |
|---|---|
| [`research-dominio`](./.claude/agents/research-dominio.md) | Entender o nicho, benchmarks e riscos — antes de decidir |
| [`aliancas-torcidas`](./.claude/agents/aliancas-torcidas.md) | Alianças/rivalidades; recomendações de aliados na config |
| [`product-strategy`](./.claude/agents/product-strategy.md) | O quê construir e em que ordem |
| [`data-model`](./.claude/agents/data-model.md) | Entidades Prisma e integridade |
| [`rbac`](./.claude/agents/rbac.md) | Permissões, autorização e visibilidade cross-tenant |
| [`loja`](./.claude/agents/loja.md) | Catálogo, sacola, checkout, cupons, estoque |
| [`performance`](./.claude/agents/performance.md) | Latência, queries, cache, bundle, polling |
| [`ux-review`](./.claude/agents/ux-review.md) | Fluxos/telas (skill `impeccable` + Playwright) |
| [`qa-verification`](./.claude/agents/qa-verification.md) | DoD + Vitest antes de dar como pronto |
| [`implementation`](./.claude/agents/implementation.md) | Codificar o combinado, escopo mínimo |
| [`news-curator`](./.claude/agents/news-curator.md) | Fila de notícias externas (aprovar/rejeitar) |

### Fluxo por feature

1. **Entender** → `research-dominio` (+ `aliancas-torcidas` se for do tema)
2. **Recortar** → `product-strategy`
3. **Modelar** → `data-model` + `rbac` (+ `loja` se for comércio)
4. **Desenhar** → `ux-review`
5. **Performance** (páginas pesadas / feed / polling) → `performance`
6. **Aprovar plano** (humano)
7. **Implementar** → `implementation` (segue [`CLAUDE.md`](./CLAUDE.md))
8. **Verificar** → `qa-verification`

### Memória compartilhada (`docs/knowledge/`)

Todos os agentes leem a base de conhecimento do nicho. Quem **escreve** fatos novos: principalmente `aliancas-torcidas` e `research-dominio`; os demais só consomem.

| Pasta / doc | Conteúdo |
|---|---|
| [`docs/knowledge/`](./docs/knowledge/) | Índice + protocolo (fonte, data, confiança) |
| [`aliancas.md`](./docs/knowledge/aliancas.md) | Blocos, alianças, rivalidades (só moderação) |
| [`estrutura-governanca.md`](./docs/knowledge/estrutura-governanca.md) | Cargos, departamentos, modelo associativo |
| [`contexto-legal.md`](./docs/knowledge/contexto-legal.md) | Estatuto do Torcedor, LGE |
| [`concorrentes-gestao.md`](./docs/knowledge/concorrentes-gestao.md) | Gaps vs TorcidaWeb / Softaliza / etc. |

---

## Infraestrutura

Deploy em **Railway** (Hobby), com push em `main` → redeploy.

| Serviço | Função |
|---|---|
| `torcida-web` | App Next.js (Nixpacks / standalone) |
| `bot-pde` | Bot Discord (`apps/bot`, root directory isolado) |
| Postgres | Banco **único** compartilhado (web + bot); multi-tenancy lógica |
| (opcional) Redis / Upstash | Pub/sub entre réplicas (feed, notificações) |
| (opcional) LiveKit Cloud | Áudio/vídeo nas Salas |
| (opcional) Cloudflare | CDN Free — [cloudflare-cdn.md](./docs/ops/cloudflare-cdn.md) |

Em produção, web e bot preferem o host **interno** do Postgres (`*.railway.internal`). O proxy público fica para acesso local (`db:push`, scripts).

Multi-tenant por subdomínio (`{slug}.seudominio.com`): [deploy-multi-tenant.md](./docs/ops/deploy-multi-tenant.md).

Plano de investimento / escala: [plano-investimento-infra.md](./docs/ops/plano-investimento-infra.md).

---

## Versionamento semântico (SemVer)

O produto segue [Semantic Versioning 2.0.0](https://semver.org/lang/pt-BR/): **`MAJOR.MINOR.PATCH`**.

A versão canônica do **produto Torcida SaaS** vive no `package.json` da raiz (`torcida-saas`). Tags Git usam o prefixo `v` (ex.: `v0.2.0`). Pacotes internos (`@torcida/web`, `@torcida/db`, `@torcida/types`, `@torcida/ui`, `@torcida/bot`) são **privados** e acompanham a versão do produto no release — não há publicação independente no npm.

### O que cada número significa

| Parte | Quando incrementar | Exemplos neste projeto |
|---|---|---|
| **MAJOR** (`X.0.0`) | Mudança **incompatível** com tenants/ops já em produção | Remover permissão/API usada; migrar schema que exige downtime/manual; quebrar cookies/OAuth/domínio; trocar contrato de Server Action consumido por cliente |
| **MINOR** (`0.Y.0`) | Feature **compatível** (additive) | Novo módulo admin, novo hub de relatórios, endpoint opcional, permissão nova sem invalidar as antigas |
| **PATCH** (`0.0.Z`) | Correção / hardening sem mudar contrato | Bugfix, ajuste de copy, performance interna, repair de seed idempotente |

Pré-releases (opcional): `v1.0.0-rc.1`, `v1.0.0-beta.2` — só para validação antes do tag estável.

### Fase `0.y.z` (atual)

Enquanto o produto estiver em **`0.y.z`**, a API/contrato ainda pode mudar com mais frequência: um **MINOR** em `0.y` pode incluir breaking changes documentados no release. A partir de **`1.0.0`**, MAJOR passa a ser obrigatório para qualquer incompatibilidade.

### Como versionar um release

1. Garantir `main` verde (CI: typecheck + lint).
2. Atualizar a versão na raiz e espelhar nos `package.json` dos apps/packages do monorepo.
3. Registrar o changelog do release (notas no GitHub Release ou seção no PR).
4. Criar tag anotada e (se aplicável) GitHub Release:

```bash
# depois do commit de bump
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

5. Deploy: push em `main` já redeploya no Railway; a tag marca o ponto reproduzível do release.

### Schema do banco vs SemVer

O fluxo padrão é `prisma db push` (sem migrations versionadas no Git). Mesmo assim:

| Mudança de schema | SemVer sugerido |
|---|---|
| Coluna/tabela nova, nullable ou com default seguro | **MINOR** |
| Rename/drop/constraint que exige intervenção em produção | **MAJOR** (+ runbook no release) |
| Índice/extensão (`pg_trgm`) sem mudar contrato da app | **PATCH** |

Scripts `db:repair-*` e seeds idempotentes não exigem bump sozinhos — só entram no PATCH/MINOR do release que os introduziu.

### Commits e PRs (recomendado)

Mensagens alinhadas ao efeito no SemVer facilitam o bump:

- `fix:` → PATCH  
- `feat:` → MINOR  
- `feat!:` / `BREAKING CHANGE:` → MAJOR (ou MINOR documentado se ainda `0.y`)

Não é obrigatório Conventional Commits no CI hoje; é convenção de time.

---

## Pré-requisitos

- Node.js **≥ 20**
- pnpm **≥ 9** (`corepack enable` recomendado)
- Acesso a um PostgreSQL (local ou Railway)
- Apps OAuth Discord e Google (para login web)

---

## Como rodar (desenvolvimento)

### 1. Clone e instale

```bash
git clone <url-do-repo>
cd botpde
pnpm install
```

### 2. Variáveis de ambiente

**Web** — copie o exemplo e preencha com **seus** valores (nunca use secrets de outra máquina/produção no Git):

```bash
cp apps/web/.env.example apps/web/.env.local
```

**Bot** (opcional, se for subir o Discord):

```bash
cp apps/bot/.env.example apps/bot/.env
```

Arquivos `.env*` reais estão no `.gitignore`. Só versionamos `*.example` com placeholders.

#### Web — obrigatórias (resumo)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | URL PostgreSQL (`postgresql://…`) |
| `AUTH_SECRET` | Segredo NextAuth (≥ 32 chars; `openssl rand -base64 32`) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | OAuth Discord |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google |

#### Web — úteis em local

| Variável | Descrição |
|---|---|
| `TENANT_SLUG` | Tenant fixo em single-tenant (ex.: slug de demo) |
| `ROOT_DOMAIN` | Multi-tenant local via `lvh.me` (`*.lvh.me` → `127.0.0.1`) |
| `SUPER_ADMIN_EMAILS` | E-mails do operador SaaS (vírgula) |
| `NEXT_PUBLIC_API_URL` | Ex.: `http://localhost:3000` |

#### Web — opcionais (degradam sem config)

| Variável | Serviço |
|---|---|
| `LIVEKIT_*` | Meet (vídeo) |
| `REDIS_URL` | Buses realtime multi-réplica |
| `CLOUDINARY_*` | Upload / escudos |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Mapas / Street View no onboarding |
| `NEXT_PUBLIC_SENTRY_DSN` | Erros (DSN público; sem ele o SDK fica no-op) |
| `PIX_GATEWAY_MODE` / `MERCADOPAGO_ACCESS_TOKEN` | PIX real vs mock |

Lista completa comentada: [`.env.example`](./apps/web/.env.example). Validação no boot: [`env.ts`](./apps/web/src/lib/env.ts).

Para typecheck/testes sem env real: `SKIP_ENV_VALIDATION=true`.

### 3. Banco

```bash
# Gera o Prisma Client
pnpm --filter @torcida/db db:generate

# Sincroniza o schema (este projeto usa db push; não há migrations versionadas no fluxo padrão)
pnpm --filter @torcida/db db:push

# Extensão + índices de busca da Comunidade (pg_trgm)
pnpm --filter @torcida/db db:enable-pg-trgm
```

Seeds úteis (exemplos):

```bash
pnpm --filter @torcida/db seed:afiliacoes
pnpm --filter @torcida/db seed:departamentos
pnpm --filter @torcida/db seed:loja-gavioes   # catálogo demo (tenant demo)
```

`DATABASE_URL` precisa estar disponível para o pacote `db` (ex.: `packages/db/.env` ou export no shell) ao rodar `db:push` / seeds.

### 4. Subir o app

```bash
# Só o web
pnpm --filter @torcida/web dev

# Ou todos os apps do turbo
pnpm dev
```

Abra [http://localhost:3000](http://localhost:3000).

Com `ROOT_DOMAIN=lvh.me` e um tenant existente:

```text
http://seu-slug.lvh.me:3000
```

### 5. Bot Discord (opcional)

```bash
cd apps/bot
# preencha DISCORD_TOKEN, CLIENT_ID, GUILD_ID, DATABASE_URL
pnpm start
# ou: pnpm dev  (node --watch)

# Registrar slash commands (guild de dev)
pnpm deploy-commands
```

O bot **não** consome pacotes `workspace:*`; o deploy no Railway usa root directory `apps/bot`.

---

## Scripts úteis

```bash
pnpm --filter @torcida/web lint
pnpm --filter @torcida/web test          # Vitest
pnpm --filter @torcida/web test:e2e      # Playwright (ver apps/web/e2e/README.md)
pnpm --filter @torcida/web build
pnpm --filter @torcida/db db:studio      # Prisma Studio
```

CI (GitHub Actions): `tsc --noEmit` + ESLint em PRs que tocam `apps/web` / `packages`.

---

## Convenções importantes

- **Autorização**: mutações via Server Action usam `assertPermission` (`apps/web/src/lib/authz.ts`). Nunca autorizar só no cliente ou por nome de cargo.
- **Auditoria**: mutações administrativas gravam `AuditLog`.
- **Validação**: Zod `safeParse` antes de escrever no banco.
- **Multi-tenant**: queries SaaS sempre com `tenantId` (exceções globais: `Afiliacao`, `Partida`, `Noticia`, etc.).
- **Visibilidade**: `resolveVisibility` / `canViewRecurso` em `@torcida/types`.

Detalhe: [`ARCHITECTURE.md`](./ARCHITECTURE.md) e [`CLAUDE.md`](./CLAUDE.md).

---

## Documentação

| Doc | Conteúdo |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Arquitetura, decisões §5, itens abertos §6 |
| [`CLAUDE.md`](./CLAUDE.md) | Guia operacional do repositório (convenções + agentes) |
| [`docs/product/dominio.md`](./docs/product/dominio.md) | Mapa de domínio e jornadas |
| [`docs/product/`](./docs/product/) | Roadmap e decisões de produto |
| [`docs/agents/README.md`](./docs/agents/README.md) | Time de agentes — quando usar cada um |
| [`docs/knowledge/`](./docs/knowledge/) | Inteligência do nicho (alianças, legal, governança) |
| [`docs/data/`](./docs/data/) | Specs por módulo |
| [`docs/frontend/admin-ui-kit.md`](./docs/frontend/admin-ui-kit.md) | Kit visual e insights da área admin |
| [`docs/ops/`](./docs/ops/) | Deploy multi-tenant, CDN, plano de infra |
| [semver.org](https://semver.org/lang/pt-BR/) | Spec de versionamento semântico (MAJOR.MINOR.PATCH) |
| [`packages/types/src/menu.js`](./packages/types/src/menu.js) | Menu admin gated por permissão |
| [`packages/types/src/permissions.js`](./packages/types/src/permissions.js) | Catálogo de permissões RBAC |
| [`packages/types/src/visibility.js`](./packages/types/src/visibility.js) | Sensibilidade e `resolveVisibility` |

---

## Segurança / segredos

- **Nunca** committe `.env`, `.env.local`, dumps de banco ou arquivos `CREDENTIALS*.md`.
- Use apenas placeholders em exemplos e no README.
- Em produção, configure variáveis no painel do Railway (ou secret store) — não no código.
- Se um secret vazar (chat, PR, log), **rotacione** imediatamente no provedor (Discord, Google, DB, Cloudinary, etc.).

---

## Licença

Projeto privado — todos os direitos reservados, salvo acordo explícito em contrário.
