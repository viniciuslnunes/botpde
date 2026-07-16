# Comunidade — performance e escalabilidade

> Plano de otimização da Comunidade entregue em **2026-07-16** (`0dca679` na
> `main`). Complementa `ARCHITECTURE.md` §5.6 e `docs/data/modulo-comunidade.md`.
> Agente responsável por novas auditorias: `performance`.

## Objetivo

Reduzir round-trips ao Postgres remoto (Railway), melhorar percepção de uso
contínuo (scroll, SSE, chat colapsado) e preparar o feed social para escala
sem trocar de stack — zero Redis/WebSocket obrigatório nesta fase.

## O que foi entregue

### Onda A — quick wins (zero infra)

| Item | Arquivo(s) | Efeito |
|------|------------|--------|
| Comentários lazy | `post-engagement.tsx` | Sem fetch de comentários no mount |
| SSE feed + refresh | `feed-live-banner.tsx`, `use-feed-stream.ts` | Atualização sem navegar |
| Batch visibilidade | `perfil-social.ts`, `social.ts`, `comunidade-busca.ts` | Fim de N+1 em busca/feed |
| Batch contagens | `getContagensSeguimentoEmLote` | Aside "Para seguir" |
| Hashtags em alta SQL | `feed.ts` `getHashtagsEmAlta` | `groupBy` em vez de agregar em memória |
| Stories privacidade batch | `stories.ts` | Uma leitura de perfis/seguimentos |
| Índices compostos | `schema.prisma` (`Post`, `Seguimento`) | Leituras por autor/data e rede |
| Nav badges Suspense | `comunidade-feed-nav.tsx` | Shell não bloqueia em badges |

### Onda B — feed escalável

| Item | Arquivo(s) | Efeito |
|------|------------|--------|
| **B1** Paginação API | `GET /api/comunidade/feed`, `/rede` | Infinite scroll sem reload |
| **B1** Client infinite | `comunidade-feed-infinite.tsx`, `comunidade-rede-infinite.tsx` | `IntersectionObserver` + cache módulo |
| **B2** Deep-link cursor | `replaceState` nos clients | URL preserva posição parcial |
| **B3** SSE invalidação | `feed-bus.ts`, `/api/comunidade/feed/stream` | Ping → refetch do trecho atual |
| **B4** Timeline materializada | `FeedTimeline`, `feed-timeline.ts`, `actions.ts` | Fan-out on write para rede/seguindo |
| **B5** Ranking Descobrir | `scoreDescobrirPost`, `rankDescobrirPosts` | Recência + engajamento + boost local |
| **B6** Busca `pg_trgm` | `comunidade-busca.ts`, `enable-pg-trgm.js` | Similaridade + índices GIN; fallback ILIKE |

### Caches e hot paths (pós-B)

| Bloco | Padrão | TTL / escopo |
|-------|--------|----------------|
| Discover base | `unstable_cache` em `feed.ts` | 60s por tenant + escopo visível |
| Sugestões aside | `unstable_cache` + filtro por usuário | 120s base pública |
| Canais visíveis | `unstable_cache` + membership por request | 120s base + query leve |
| Hashtags em alta | `unstable_cache` | 120s |
| Stories rings | `unstable_cache` + privacidade por request | 60s |
| Salas ao vivo | `unstable_cache` | 15s |
| Privacidade autores | `React.cache` em `getAutoresSemAcesso` | Por request |
| Eventos composer + aside | `React.cache` `getEventosFuturosVisiveis` | Por request |
| Salas na página | Uma `listSalasAtivas` em `page.tsx` → props | Por request (cache 15s na lib) |

### Chat e painéis laterais

| Item | Arquivo(s) | Efeito |
|------|------------|--------|
| Resumo leve | `GET /api/conversas/resumo` | Badge + bloqueio sem inbox completa |
| Inbox sob demanda | `comunidade-chat-panel.tsx` | `/api/conversas` só ao expandir |
| Sem fetch duplicado | `mensagens-shell.tsx` (`inboxPreloaded`) | Pai pré-carrega; shell não repete bootstrap |

## Modelo novo — `FeedTimeline`

Tabela `saas_feed_timeline` (`FeedTimeline` no Prisma): fan-out on write.

- **Escrita:** `fanoutPostParaRede`, `backfillTimelineDoAutorParaViewer`,
  `removerTimelineDoAutorParaViewer` em `feed-timeline.ts`, chamados nas
  Server Actions de post e seguimento (`comunidade/actions.ts`).
- **Leitura:** `getPostsDaRede` lê da timeline com keyset pagination e
  overfetch para filtrar posts invisíveis.
- **Garantia:** `garantirTimelineDaRedeDoViewer` reconstrói sob demanda se
  faltar backfill histórico.

Índices: `@@unique([viewerId, postId])`, `@@index([viewerId, criadoEm])`,
`@@index([viewerId, autorId])`, `@@index([postId])`.

## APIs novas

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/comunidade/feed?cursor=&take=&filtro=` | Paginação feed Descobrir/Seguindo |
| GET | `/api/comunidade/rede?cursor=&take=` | Paginação Minha rede |
| GET | `/api/comunidade/feed/stream` | SSE ping (sem payload) |
| GET | `/api/conversas/resumo` | `naoLidas` + flags de bloqueio |

## Padrões obrigatórios (features novas na Comunidade)

1. **Separar base pública de estado do usuário** — cache cross-request só para
   dados que não dependem de reação/voto/RSVP/privacidade; overlay por request.
2. **Batch antes de loop** — `getAutoresSemAcesso`, `canFollowUsers`,
   `filtrarPostsVisiveis`; nunca `podeVerPost` por item em lista grande.
3. **Infinite scroll via API** — não recarregar documento; cursor keyset no
   backend; `history.replaceState` para deep-link parcial.
4. **SSE = ping, não payload** — cliente refetcha o trecho visível; debounce
   para evitar tempestade de requests.
5. **Chat colapsado = resumo** — inbox completa só quando o usuário expande.
6. **Uma leitura, vários consumidores** — dados compartilhados (ex.: salas)
   buscados no nível `page`/shell e passados por props.
7. **Tipos explícitos em queries Prisma** — ver `ARCHITECTURE.md` §5.2.

## Pós-deploy (obrigatório em produção)

```bash
pnpm --filter @torcida/db db:push
pnpm --filter @torcida/db db:enable-pg-trgm
pnpm --filter @torcida/db backfill:perfis-torcedores-publicos   # se ainda não rodou
```

Sem `db:push`, `FeedTimeline` e índices novos não existem — leitura de rede
degrada ou falha. Sem `db:enable-pg-trgm`, busca usa fallback ILIKE (correto,
porém mais lenta em bases grandes).

## Como medir

- **Dev:** log `[prisma] GET /portal/comunidade — N queries`
  (`PrismaQueryLogger` + `query-metrics.js`).
- **Network:** primeira carga = HTML/RSC; scroll = `GET /api/comunidade/feed`;
  chat colapsado = só `/api/conversas/resumo`.
- **Comparar:** 1ª vs 2ª visita em &lt;2 min (cache `unstable_cache` quente).

## Plano futuro — nível profissional

Priorizado por **impacto × esforço × dependência de infra**. Cada fase exige
aprovação humana antes de implementação (`product-strategy` + `performance`).

### Fase C — refinamento zero-infra (próximos 2–4 sprints)

**Entregue parcialmente (2026-07-16):** C2 `revalidateTag` + tags em caches;
C1 windowing (`useFeedWindow` + `content-visibility`); C3 hook compartilhado
`useComunidadeInfiniteFeed` (substitui Map duplicado); C5 `ComunidadePrefetchLink`;
C4 e2e budget Comunidade; C6 hashtags com TTL 300s + invalidação on-write.
**Pendente:** TanStack Query/Virtual quando `@tanstack/*` instalável no ambiente.

| # | Recorte | Por quê | Esforço |
|---|---------|---------|---------|
| C1 | **Virtualização** de listas longas (`@tanstack/react-virtual` ou equivalente) em feed infinite, notificações e inbox | DOM e hidratação custam mais que query após ~50 cards | Médio |
| C2 | **`revalidateTag` na timeline** ao publicar/editar/ocultar post e ao follow/unfollow | Hoje TTL implícito; invalidação explícita reduz staleness pós-escrita | Baixo |
| C3 | **TanStack Query** no client (quando install estável) substituindo cache `Map` manual | Dedupe, retry, staleTime por rota; menos código bespoke | Médio |
| C4 | **E2E de latência Comunidade** — estender `nav-latency.portal.spec.ts` com budget de queries/API por rota | Regressão automática no CI | Baixo |
| C5 | **Prefetch on-hover** em cards de perfil/hashtag no feed | Alinha com padrão da navbar | Baixo |
| C6 | **Materialized view ou job** para hashtags trending (refresh 5–15 min) | `groupBy` semanal ainda pesado em tenants muito ativos | Médio |

### Fase D — tempo quase real e consistência multi-instância

**D1 entregue (2026-07-16):** bridge `realtime-bus.ts` com `REDIS_URL` opcional
(ioredis + Upstash Free). Sem env → in-memory (1 réplica). Com `rediss://` →
pub/sub cruzando réplicas; eco da própria instância é ignorado. **Custo: $0**
no free tier (256 MB · 500k comandos/mês).

#### Setup Upstash Free (produção)

1. Criar DB em [upstash.com](https://upstash.com) → Redis → Free.
2. **Connect** → copiar **Redis URL** (`rediss://default:…@….upstash.io:6379`).
3. Railway → serviço web → Variables → `REDIS_URL=<cole a URL>`.
4. Redeploy. Logs: ausência de `[realtime-bus] Redis … error` = ok.
5. Sem `REDIS_URL` o app segue igual (fallback in-memory).

| # | Recorte | Por quê | Esforço | Status |
|---|---------|---------|---------|--------|
| D1 | **Redis pub/sub** para `feed-bus` e `notificacoes-bus` | SSE in-memory não cruza réplicas | Médio | ✅ código; ativar com env |
| D2 | **Worker assíncrono** para fan-out (`scheduleFanoutPostParaRede`) | Post com rede grande não bloqueia request HTTP | Médio | ✅ 2026-07-16 |
| D3 | **SSE mensageria** (inbox + thread) + polling lento como fallback | Menos requests; melhor em dia de jogo | Médio | ✅ 2026-07-16 |
| D4 | **Invalidação coordenada** de caches `unstable_cache` via tags por tenant | Evitar TTL fixo como única estratégia | Médio | parcial (C2 tags) |

**D2:** ao publicar, `materializarTimelineAutor` (sync, 1 row) + fila
`torcida:queue:fanout-timeline` (Redis LPUSH/BRPOP se `REDIS_URL`; senão
in-process). Worker consome `fanoutSeguidoresPostParaRede`. Sem custo extra.

**D3:** `mensageria-bus` + `GET /api/conversas/stream` e `/api/conversas/[id]/stream`.
Ao enviar mensagem, ping na thread e na inbox de cada membro. Clients
escutam SSE; polling 60s como rede de segurança.

### Fase E — busca e descoberta avançada

| # | Recorte | Por quê | Esforço |
|---|---------|---------|---------|
| E1 | **Meilisearch / Typesense** (índice denormalizado de membros, posts, canais) | `pg_trgm` resolve typo; não resolve ranking complexo nem facetas | Alto |
| E2 | **Ranking personalizado** (features: rede, tenant, recência, engajamento, afiliação) com A/B offline | Heurística atual é baseline; ML/heurística tunável vem depois | Alto |
| E3 | **Sugestões de seguir** pré-computadas por tenant (tabela `SugestaoAutor` ou job) | Aside deixa de depender de queries ad hoc | Médio |

### Fase F — infra e observabilidade (quando métricas justificarem)

| # | Recorte | Gatilho | Esforço |
|---|---------|---------|---------|
| F1 | **PgBouncer / Prisma Accelerate** | Contenção de conexões ou p95 de query &gt; SLA | Médio–Alto |
| F2 | **Read replica** para feeds e buscas | CPU do primary &gt; 70% sustentado | Alto |
| F3 | **OpenTelemetry** — span por rota Comunidade + contagem Prisma exportada | Debug em produção sem adivinhar | Médio |
| F4 | **CDN** (Cloudflare já documentado) + cache de avatar/mídia estática | LCP em 4G no dia de jogo | Baixo (config) |

### Critérios de decisão (não pular fases)

- **Não** adicionar Redis/WebSocket só por estética — exigir evidência de
  múltiplas instâncias ou SLA de freshness &lt; 5s.
- **Não** migrar busca para engine externo enquanto `pg_trgm` + índices não
  estiverem em produção e medidos.
- **Manter** autorização server-side e `tenantId` em toda mutação — cache
  nunca substitui `assertPermission`.

## Handoff para agentes

| Agente | Quando acionar |
|--------|----------------|
| `performance` | Nova feature em feed/busca/polling; regressão de queries |
| `data-model` | Novas tabelas materializadas, índices, jobs de backfill |
| `implementation` | Codificar recorte aprovado (Fable) |
| `qa-verification` | Vitest + e2e latência antes de merge |
| `product-strategy` | Priorizar Fase C vs D vs escopo de ranking/busca |

## Referências no código

| Área | Caminho |
|------|---------|
| Cache tags | `apps/web/src/lib/comunidade-cache.ts` |
| Infinite hook | `apps/web/src/lib/use-comunidade-infinite-feed.ts` |
| Windowing | `apps/web/src/lib/use-feed-window.ts` |
| Prefetch hover | `apps/web/src/components/portal/comunidade-prefetch-link.tsx` |
| Feed + ranking | `apps/web/src/lib/feed.ts` |
| Timeline | `apps/web/src/lib/feed-timeline.ts`, `feed-timeline-queue.ts` |
| Busca | `apps/web/src/lib/comunidade-busca.ts` |
| Stories | `apps/web/src/lib/stories.ts` |
| SSE feed | `apps/web/src/lib/feed-bus.ts`, `realtime-bus.ts`, `use-feed-stream.ts` |
| SSE notif | `apps/web/src/lib/notificacoes-bus.ts`, `realtime-bus.ts` |
| SSE mensagens | `apps/web/src/lib/mensageria-bus.ts`, `use-mensagem-stream.ts` |
| Chat resumo | `apps/web/src/app/api/conversas/resumo/route.ts` |
| Scripts DB | `packages/db/scripts/enable-pg-trgm.js` |
| Schema | `packages/db/prisma/schema.prisma` (`FeedTimeline`, índices `Post`) |
