# CLAUDE.md — Torcida SaaS

Guia curto para trabalhar neste repositório. Detalhe arquitetural em `ARCHITECTURE.md`;
produto e roadmap em `docs/`; time de agentes em `.claude/agents/` (ver `docs/agents/README.md`);
conhecimento do nicho (torcidas, alianças, governança, lei) em `docs/knowledge/`.
Performance web: `ARCHITECTURE.md` §5.6; agente `performance` para auditorias novas.

## O que é

SaaS operacional multi-tenant para torcidas organizadas de futebol. Hierarquia
Sede → Subsede → PDE, RBAC por tenant, comunicados/eventos/loja, bot Discord legado.
Em produção no Railway; em evolução.

## Monorepo (pnpm + Turborepo)

```
apps/
  web/     Next.js 16 (App Router, RSC/Server Actions), React 19, NextAuth v5, Tailwind v4
  bot/     Discord.js 14 (JS puro), acesso a dados via `pg` cru (legado)
packages/
  db/      Prisma 6 — schema.prisma (fonte única do modelo); client + getDbForTenant()
  types/   Zod schemas, permissions.js (RBAC), visibility.js (visibilidade cross-tenant)
  ui/      componentes React (CSS variables) + services
```

## Comandos

```bash
pnpm install
pnpm dev                              # turbo dev (todos os apps)
pnpm --filter @torcida/web dev        # só web
pnpm --filter @torcida/web lint
pnpm --filter @torcida/web test       # Vitest (RBAC, rate-limit, visibilidade)
pnpm --filter @torcida/db db:generate # prisma generate
pnpm --filter @torcida/db db:push     # sincroniza schema (NÃO há migrations)
pnpm --filter @torcida/db seed:loja-gavioes  # catálogo demo Gaviões (tenant pde-gavioes-fiel)
pnpm --filter @torcida/db seed:torcedores-estimados  # IBOPE Top 50 + teto 10 mil (offline)
pnpm --filter @torcida/db coleta:ibope-ranking -- --validate  # cobertura Top 50
```

CI roda `tsc --noEmit` + `eslint` em todo PR. Deploy: push em `main` → Railway.

## Convenções (obrigatórias)

- **Autorização**: toda Server Action de mutação chama `assertPermission(PERMISSION)`
  (`apps/web/src/lib/authz.ts`). É o **único** critério do admin — nunca por nome de
  cargo, nunca só no cliente. Permissões em `packages/types/src/permissions.js`.
- **Auditoria**: toda mutação administrativa grava `AuditLog` (ator, ação, entidade, id, detalhes).
- **Validação**: `Zod safeParse` antes de qualquer operação de banco.
- **Multi-tenant**: `tenantId` nunca omitido nas queries de dados SaaS. Referências
  globais (`Afiliacao`, `Partida`, `Noticia`) são a exceção — não filtram por tenant.
  (`Afiliacao` = o time apoiado; não se usa o termo genérico "clube" como entidade.)
- **Prisma / TypeScript**: **anote explicitamente o tipo de retorno** de queries novas
  (`const x: XLite[] = await db.modelo.findMany(...)`). A inferência automática quebra
  silenciosamente neste schema (ver `ARCHITECTURE.md` §5.2). Sem `any` (`no-any`).
- **Visibilidade**: use `resolveVisibility`/`canViewRecurso` de `packages/types/src/visibility.js`.
  `self`/`ancestor` = tudo; `descendant` e `allied` = só PÚBLICO; `unrelated` = nada.
- **UX**: cubra estados de vazio, erro e loading.
- **Performance** (páginas com muitas queries, feed ou polling): siga `ARCHITECTURE.md`
  §5.6 — `React.cache`/`unstable_cache`, Suspense, prefetch on-hover, `useVisibleInterval`,
  `next/image` quando aplicável. Dúvida de diagnóstico → agente `performance` antes de codar.
- **Animações (Motion):** presets em `apps/web/src/lib/motion-presets.ts`; guia em
  `docs/frontend/motion.md`. Novas UIs client seguem os padrões documentados (`MotionShell`,
  `m`, `MotionReveal`, `MotionEmptyState`). Expandir shell para `portal/layout` antes de
  animar Loja/Onboarding.
- **Dependência externa opcional**: quando uma feature depende de um serviço externo não
  obrigatório (ex.: LiveKit em Salas/Meet), faça o gate com uma função `isXConfigured()`
  e degrade graciosamente em vez de quebrar. Ver `apps/web/src/lib/livekit.ts`.

## Fluxo de trabalho

- Planejar (Opus) antes de codificar; implementar (Fable via agente `implementation`)
  com escopo mínimo. Ver `docs/agents/README.md`.
- Commit/push só quando pedido. Se estiver na branch default, crie branch antes.
- Mensagens de commit terminam com:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## Arquivos-chave

- `packages/db/prisma/schema.prisma` — modelo de dados.
- `packages/types/src/permissions.js` — permissões, cargos de sistema, efetivas.
- `packages/types/src/visibility.js` — sensibilidade e visibilidade cross-tenant.
- `apps/web/src/lib/authz.ts` — `assertPermission`.
- `apps/web/src/lib/hierarquia.ts` — relação entre tenants na árvore de Sede.
- `apps/web/src/lib/salas.ts`, `salas-api.ts`, `livekit.ts` — núcleo do módulo Salas (Meet);
  ver `docs/data/modulo-salas.md`.
- **Loja** — catálogo, sacola, checkout, cupons: `apps/web/src/app/portal/loja/`,
  `apps/web/src/app/admin/loja/`; regras em `packages/types/src/loja.js`;
  ver `docs/data/modulo-loja.md`.
- **Sofascore Widgets** — embeds oficiais por clube na comunidade: cadastro em
  `packages/types/src/sofascore-widgets.js`; ver `docs/data/modulo-sofascore-widgets.md`.
- **Onboarding** — wizard `/onboarding`, escudos (`docs/data/escudos-afiliacoes.md`),
  estimativa torcedores/base digital (`docs/data/torcedores-estimados.md`,
  `docs/knowledge/futebol-dados-publicos.md`); stats em `onboarding-clube-stats.ts`.
- `ARCHITECTURE.md` — decisões fechadas (§5) e itens em aberto (§6).
