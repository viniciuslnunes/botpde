# Comunidade — performance e escalabilidade

> Plano de otimização da Comunidade entregue em **2026-07-16** (`0dca679` na
> `main`). Live UX zero-custo (`f6690cb`): ping SSE pós-fan-out + auto-refetch no
> topo. **2026-07-17:** engajamento overlay; publish + prepend client; nav-back
> sem remount; busca typeahead (`modo=rapida`). Complementa `ARCHITECTURE.md`
> §5.6 e `docs/data/modulo-comunidade.md`. Agente responsável por novas
> auditorias: `performance`.

## Objetivo

Reduzir round-trips ao Postgres remoto (Railway), melhorar percepção de uso
contínuo (scroll, SSE, chat colapsado) e preparar o feed social para escala
sem trocar de stack — zero Redis/WebSocket obrigatório nesta fase.

## O que foi entregue

### Onda A — quick wins (zero infra)

| Item | Arquivo(s) | Efeito |
|------|------------|--------|
| Comentários lazy | `post-engagement.tsx` | Sem fetch de comentários no mount |
| SSE feed + refresh | `feed-live-banner.tsx`, `use-feed-stream.ts`, `feed-live-refresh.ts` | Topo: auto-refetch; rolado: banner |
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
| **B3** SSE invalidação | `feed-bus.ts`, `/api/comunidade/feed/stream` | Long-poll ping → refetch do trecho atual |
| **B4** Timeline materializada | `FeedTimeline`, `feed-timeline.ts`, `actions.ts` | Fan-out on write para rede/seguindo |
| **B5** Ranking Descobrir | `scoreDescobrirPost`, `rankDescobrirPosts` | Recência + engajamento + boost local |
| **B6** Busca `pg_trgm` | `comunidade-busca.ts`, `enable-pg-trgm.js` | Similaridade + índices GIN; fallback ILIKE |
| **B6.1** Busca typeahead (2026-07-17) | `modo=rapida`, `postIncludeBusca`, fix `GROUP BY` | Dropdown leve; SQL DISTINCT+ORDER BY quebrava API (`42P10`) |

### Busca — hot path e armadilhas (2026-07-17)

Commit de referência: `e4a30ee` (fix SQL + `modo=rapida`).

| Superfície | Endpoint | Trabalho |
|------------|----------|----------|
| Dropdown do feed (`comunidade-search-bar.tsx`) | `GET /api/comunidade/busca?q=&modo=rapida` | Membros (avatar/nome) + hashtags + posts leves; **sem** canais, badges, follow, contagens |
| Página `/portal/comunidade/busca` | `GET /api/comunidade/busca?q=` (`completa`) | Tudo acima + canais/unidades + badges + follow |

**Armadilha SQL (regressão clássica):** com `pg_trgm` ligado,

```sql
SELECT DISTINCT m.user_id … ORDER BY similarity(…)
```

falha no Postgres (`42P10`). O catch só trata “extensão ausente”; o 400 virava
“Nenhum resultado” no dropdown se a UI engolia `!res.ok`. **Invariante:**
candidatos de membros usam `GROUP BY m.user_id, u.nome` +
`MAX(similarity(bio))`. Ver `docs/data/modulo-comunidade.md` § busca.

**Padrões a preservar:**
- Typeahead sempre `modo=rapida`; página completa = default.
- Posts de busca: `postIncludeBusca` / `projetarPostBusca` (não `postInclude` cheio).
- Erro de API ≠ empty state (dropdown e página).
- `podeVerCanal` em paralelo na busca completa.
- **Não** Meilisearch (E1) sem p95 medido **com** `pg_trgm` em produção.

### Caches e hot paths (pós-B)

| Bloco | Padrão | TTL / escopo |
|-------|--------|----------------|
| Discover base | `unstable_cache` em `feed.ts` | 60s por tenant + escopo visível |
| Sugestões aside | `unstable_cache` + filtro por usuário | 120s base pública |
| Canais visíveis | `unstable_cache` + membership por request | 120s base + query leve |
| Hashtags em alta | `unstable_cache` | 120s |
| Stories rings | `unstable_cache` + privacidade por request | 60s |
| Salas ao vivo | `React.cache` + `unstable_cache` | Por request + 15s cross-request |
| Privacidade autores | `React.cache` em `getAutoresSemAcesso` | Por request |
| Eventos composer + aside | `React.cache` `getEventosFuturosVisiveis` | Por request |
| Tenant ativo | `React.cache` `getActiveTenant` | Por request (layout + page) |
| Salas no chrome | `listSalasAtivas` no layout (`ComunidadeLayoutChrome`) + dedupe `React.cache` se a page também pedir | Por request |

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
| GET | `/api/comunidade/feed/stream` | Long-poll ping (sem payload; ≤~25s) |
| GET | `/api/conversas/resumo` | `naoLidas` + flags de bloqueio |

## Padrões obrigatórios (features novas na Comunidade)

1. **Separar base pública de estado do usuário** — cache cross-request só para
   dados que não dependem de reação/voto/RSVP/privacidade; overlay por request.
2. **Batch antes de loop** — `getAutoresSemAcesso`, `canFollowUsers`,
   `filtrarPostsVisiveis`; nunca `podeVerPost` por item em lista grande.
3. **Infinite scroll via API** — não recarregar documento; cursor keyset no
   backend; `history.replaceState` para deep-link parcial.
4. **SSE = ping, não payload** — cliente refetcha o trecho do **topo** se
   estiver perto do scroll top (`FEED_NEAR_TOP_PX`); longe do topo, banner
   pede clique. Debounce `FEED_SSE_DEBOUNCE_MS` (250ms). Ping do servidor só
   após fan-out da timeline (`feed-timeline-queue`), para o filtro Seguindo
   já ter a linha materializada. **Transporte = long-poll ~25s** (`ping`|`idle`,
   flush imediato de `: connected`) — hold sem TTFB gerava 502 no Railway;
   stream aberto por minutos → edge RST mid-stream vira `ERR_HTTP2_PROTOCOL_ERROR`.
5. **Chat colapsado = resumo** — inbox completa só quando o usuário expande.
6. **Uma leitura, vários consumidores** — dados compartilhados (ex.: salas)
   no layout chrome ou page, com `React.cache` se layout + page chamam a
   mesma lib no mesmo request.
7. **Tipos explícitos em queries Prisma** — ver `ARCHITECTURE.md` §5.2.
8. **Overlay de engajamento sem `revalidatePath` do feed** — reação/comentário
   são estado otimista no cliente (`PostEngagement`). Revalidar
   `/portal/comunidade` a cada clique força RSC do feed inteiro (dezenas–
   centenas de queries) e mascara erros de Server Action em produção como
   *“An error occurred in the Server Components render”*. Notificações e
   `AuditLog` de comentário saem via `after()` + `notificarSafe`.
9. **Voltar ao feed sem skeleton bloqueante** — Suspense dos posts usa
   `ComunidadeFeedBootstrap` (TanStack no layout, `gcTime` 20 min). Aside
   salas/chat no layout (`ComunidadeLayoutChrome`) fica `display:none` fora
   do feed (sem unmount). Composer/card sob Suspense com `React.cache`.
   `listSalasAtivas` e `getActiveTenant` em `React.cache` (salas também tem
   `unstable_cache`) para dedupe layout + page no mesmo request. Medir:
   `e2e/feed-nav-back.measure.ts`.

## Engajamento — hot path (2026-07-17)

Correção de produção + otimização em `reagirPost` / `comentarPost`
(`comunidade/actions.ts`). Escopo de produto/visibilidade:
`docs/data/modulo-comunidade.md` § engajamento.

| Técnica | Efeito |
|---------|--------|
| Sem `revalidatePath('/portal/comunidade')` (nem `/portal`) na reação; comentário também sem revalidate de feed | POST deixa de esperar RSC do feed |
| Authz + `findUnique` do post em `Promise.all` | Menos waterfall |
| `podeEngajarPostVisivel` (fast-path tenant/clube; fallback hierarquia) | Evita resolver todos os tenants visíveis no caso comum (CN / mesmo clube) |
| `resolverContextoEngajamento`: 1× `SaasMembro`; carteirinha + permissões em paralelo | −1 query vs `assertMembroAtivo` duplicado |
| Reação: `deleteMany` (descurtir) / `upsert` (add·troca) | 1 RTT no toggle-off |
| Comentário: `create` sem `include` do autor (usa sessão); audit + notifs em `after()` | Menos join + resposta imediata |
| Notificação de reação/comentário/menção em `after()` | Fora do caminho crítico |

**Teto deste fluxo:** auth + post em paralelo → 1–2 writes. Próximo salto
(API dedicada, contadores denormalizados) só com p95 pedindo — não otimizar
por hábito.

| Cenário | Antes | Depois | Ganho estimado |
|---------|-------|--------|----------------|
| Curtir / comentar no feed (mesmo tenant ou CN) | Action + `revalidatePath` do feed (RSC completo) | Mutação leve + UI otimista | **~70–95%** menos trabalho no POST (∝ tamanho do feed) |

## Publicar + feed client (2026-07-17)

Incidente: publicar “lento”, tempestade de requests depois, e o post **só
aparecia após F5**. Causa raiz: o feed vivo é **TanStack Query** — `revalidatePath`
+ `router.refresh()` (SSE perto do topo) forçavam RSC completo **sem** atualizar
a lista client. Sintoma no Network: `navbar-context`, `conversas`, RSC
`comunidade`, `feed`, `salas`, Sentry em cascata.

| Técnica | Efeito |
|---------|--------|
| Composer emite `comunidade:post-publicado` (+ `PostPublicadoPreview` opcional) | Infinite feed faz **prepend otimista** imediato |
| Soft hydrate / `invalidateQueries` leve após create | Confirma com servidor sem limpar a lista |
| Sem `revalidatePath('/portal/comunidade')` no path de publicar | Action não espera RSC do feed |
| `invalidarLeituraComunidade` / `revalidateTag` mantidos | Cache cross-request fica coerente |
| `FeedLiveBanner` **não** chama `router.refresh()` perto do topo | Ping SSE → só refetch TanStack do topo |
| Caminho crítico da action = create + timeline do autor; hashtags/menções/audit/`Perfil` via `after()` | Menos trabalho síncrono na action |
| Descobrir: ranking **unificado** (rede + sugestões); API/SSR usam `feed.posts` | Post do autor não some quando há `postsSugeridos` |

**Invariante:** se a UI do feed é client (Query/Virtual), mutação bem-sucedida
**deve** atualizar o cache client (evento / prepend / `setQueryData`). RSC
sozinho **não** é fonte da lista.

**Medição local (super-admin E2E):** `e2e/publish-latency.measure.ts` →
`cardMs` ~**520 ms** (Publicar → card). Com isso, **não** otimizar publicar por
hábito — só com p95 novo ou regressão. Conta de teste: early-return em
`assertAutorPublicacaoPost` (super-admin); authz de membro **não** era o
gargalo nessa medição.

## Voltar ao feed (Buscar / Classificação) — 2026-07-17

Navegar para Buscar/Classificação e voltar remountava shell + chat + salas e
zerava a percepção do TanStack (Suspense skeleton + SSR seed).

| Técnica | Arquivo(s) | Efeito |
|---------|------------|--------|
| Fallback Suspense = `ComunidadeFeedBootstrap` | `_components/comunidade-feed-bootstrap.tsx` | Mostra cache quente em vez de skeleton vazio |
| `gcTime` 20 min no Query provider | `comunidade-query-provider.tsx` | Cache sobrevive à saída do feed |
| SSR seed só se cache vazio | `use-comunidade-infinite-feed.ts` | Não sobrescreve lista quente |
| `ComunidadeLayoutChrome` (salas + chat) no layout | `comunidade-layout-chrome.tsx`, `layout.tsx` | `display:none` fora do feed — **sem unmount** |
| Page fina + Suspense composer/card | `composer-context.ts`, `*-section.tsx` | Layout resolve chrome; page não bloqueia no composer |
| Prefetch on-hover abas Descobrir/Seguindo | `comunidade-feed-tabs.tsx` | Volta mais rápida |
| `React.cache` em `listSalasAtivas` + `getActiveTenant` | `salas.ts`, `tenant.ts` | Dedupe layout ↔ page no mesmo RSC |

Medir: `e2e/feed-nav-back.measure.ts` (`firstPostMs`, contagens de
`conversas/resumo` / feed / RSC).

**Próximos quick wins (só após medir de novo):** uma assinatura SSE; defer do
rail; cortar soft-refetch ~600 ms em posts só-texto.

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

## Ganhos estimados (cenários) — baseline pós A–D / C3

> **Estimativas de engenharia**, não lab medido em produção. Variam com
> tamanho do tenant, 4G vs Wi‑Fi e cache quente/frio. Usar para priorizar e
> comunicar — não como SLA. Atualizar quando houver p95 real.

### Por jornada

| Cenário | Antes (ordem de grandeza) | Depois | Ganho estimado |
|---------|---------------------------|--------|----------------|
| 1ª carga Comunidade (RSC + asides) | Queries em série / N+1 / salas 3× | Batch + caches + salas 1× + Suspense | **~40–60%** menos trabalho no servidor |
| 2ª visita &lt;2 min (cache quente) | Quase tudo de novo no Postgres | `unstable_cache` + tags | **~50–70%** menos hits nos blocos cacheados |
| Scroll do feed | Reload ou DOM enorme | Infinite API + Virtual + Query | **~70–90%** menos DOM após ~50 posts; sem reload de documento |
| Novos posts (SSE) | Ping cedo / lista estática | Ping **pós-fan-out**; auto-refetch no topo (~250ms); banner se rolado | Quase em tempo real no topo; “Seguindo” consistente |
| Chat colapsado | Inbox completa no mount | Só `/api/conversas/resumo` | **~80–95%** menos payload/queries de DM no mount |
| Badge / nova DM | Poll 15s | SSE (+ poll 60s fallback) | **~75–90%** menos polls; latência ~0–15s → **~&lt;1s** |
| Publicar post (rede grande) | Fan-out sync na action | Autor sync + fila Redis | **~60–90%** menos tempo na action (∝ seguidores) |
| Publicar → card no feed (client) | `revalidatePath` + refresh RSC; lista TanStack não atualizava | Prepend otimista + sem refresh RSC; action leve (`after`) | Percepção ~**sub-segundo** local (~520 ms medido); sem tempestade RSC |
| Voltar Buscar/Classificação → Feed | Remount chat/salas + skeleton Suspense | Chrome no layout + bootstrap TanStack + `gcTime` 20 min | Sem “reload” percebido se cache quente |
| SSE entre réplicas | In-memory só na réplica local | Redis pub/sub (`REDIS_URL`) | De **0%** → **~100%** dos pings cruzam réplicas |
| Busca | ILIKE / agregação pesada | `pg_trgm` + batch (após `db:enable-pg-trgm`); dropdown `modo=rapida` (sem canais/badges/follow; posts leves) | **~30–70%** em bases grandes; **~40–60%** menos trabalho no typeahead vs página completa |
| Assets estáticos (CDN) | Sempre origin Railway | Cloudflare Free | **0%** sem domínio próprio; **~40–60%** LCP estático com domínio |
| Reação / comentário no feed | `revalidatePath` + RSC do feed | Overlay otimista + mutação leve (`after` notifs) | **~70–95%** menos trabalho no POST |

### Por camada do plano

| Camada | Cobertura zero-custo | Peso típico no caminho crítico |
|--------|----------------------|--------------------------------|
| A–B (batch, timeline, APIs, busca) | ~100% | ~45% da melhoria de servidor |
| C (tags, Query, Virtual, prefetch) | ~100% | ~25% (percepção / client) |
| D1–D3 (Redis SSE, mensagens, fan-out) | ~100% | ~25% (tempo real + publish) |
| F4 CDN | runbook pronto | **0%** até haver domínio |
| E / F1–F3 | sob métrica / $ | **0%** até evidência |

**Pacote profissional sem domínio e sem infra paga:** ~**85–95%** do valor
planejado capturado. Restante ≈ CDN + E/F sob evidência.

### Modos de uso

| Modo | Situação | Ordem de melhoria vs. baseline pré-ondas |
|------|----------|------------------------------------------|
| Dia comum, 1 réplica, Redis on | Produção típica atual | ~**2×** mais eficiente em feed/chat |
| Dia de jogo (scroll + DMs) | SSE + Virtual + resumo | ~**3×** melhor percepção |
| Com domínio + Cloudflare | Futuro | +**~20–30%** só no LCP de JS/CSS |

### O que isso não é

- Não é “site X% mais rápido” em todo clique — TTFB de HTML/RSC + Postgres
  remoto continua dominante.
- Sem `db:push` / `db:enable-pg-trgm`, timeline/busca **não** entregam o ganho.
- Sem domínio, F4 permanece **0%**.

### Gatilhos para reabrir o plano (não otimizar por hábito)

1. Busca lenta **com** `pg_trgm` ligado (p95 / reclamações) → considerar E1.
2. Contenção de conexões Postgres → F1.
3. Domínio próprio comprado → ativar F4 (`docs/ops/cloudflare-cdn.md`).
4. Várias réplicas / dia de jogo degradando com Redis já on → medir antes de D4+/F.
5. `cardMs` de publicar (measure) **regredindo** vs ~520 ms baseline local →
   reabrir hot path de publish (não “otimizar por hábito” abaixo disso).
6. `firstPostMs` ao voltar de Buscar/Classificação degradado com cache quente →
   checar remount do chrome / `gcTime` / seed SSR sobrescrevendo Query.

## Plano futuro — nível profissional

Priorizado por **impacto × esforço × dependência de infra**. Cada fase exige
aprovação humana antes de implementação (`product-strategy` + `performance`).

### Fase C — refinamento zero-infra (próximos 2–4 sprints)

**Entregue (2026-07-16):** C1–C6 — windowing TanStack Virtual + Query no infinite
feed/rede, `revalidateTag`, prefetch hover, e2e budget, hashtags com TTL/invalidação.
Provider: `ComunidadeQueryProvider` no layout da Comunidade.

| # | Recorte | Por quê | Esforço | Status |
|---|---------|---------|---------|--------|
| C1 | **Virtualização** (`@tanstack/react-virtual` / `useWindowVirtualizer`) | DOM após ~50 cards | Médio | ✅ |
| C2 | **`revalidateTag`** nos caches Comunidade | Staleness pós-escrita | Baixo | ✅ |
| C3 | **TanStack Query** (`useInfiniteQuery`) no feed/rede | Dedupe, retry, staleTime | Médio | ✅ |
| C4 | **E2E de latência Comunidade** | Regressão no CI | Baixo | ✅ |
| C5 | **Prefetch on-hover** perfil/hashtag | Alinha navbar | Baixo | ✅ |
| C6 | Hashtags trending TTL 300s + tag on-write | Escala trending | Baixo | ✅ (MV job ainda futuro) |

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
in-process). Worker consome `fanoutSeguidoresPostParaRede` e **só então**
dispara `emitFeedPing` (SSE). Sem custo extra.

**D3:** `mensageria-bus` + `GET /api/conversas/stream` e `/api/conversas/[id]/stream`.
Ao enviar mensagem, ping na thread e na inbox de cada membro. Clients
escutam long-poll SSE (`ping`|`idle`); polling 60s como rede de segurança.

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
| F4 | **CDN** Cloudflare Free | LCP em 4G no dia de jogo | Baixo | ✅ runbook `docs/ops/cloudflare-cdn.md` + headers origin |

### Checklist pós-deploy (produção)

Rodar uma vez após merge das ondas A–D / C3:

```bash
pnpm --filter @torcida/db db:push
pnpm --filter @torcida/db db:enable-pg-trgm
```

| Check | Como |
|-------|------|
| `REDIS_URL` | Upstash Free ligado; logs sem `[realtime-bus] Redis … error` |
| Timeline / índices | `db:push` ok |
| Busca | `db:enable-pg-trgm` ok; senão fallback ILIKE |
| CDN | Cloudflare Free + `cf-cache-status: HIT` em `/_next/static` |
| Mensagens SSE | Enviar DM → badge/inbox atualiza sem esperar 60s |
| Feed | Scroll infinite sem reload; Network só `/api/comunidade/feed` |

**E1 (Meilisearch):** só se, após `pg_trgm` em produção, busca continuar lenta
com evidência (p95 / reclamações). Não contratar engine sem medir.

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
| `performance` | Nova feature em feed/busca/polling; regressão de queries; typeahead vs `completa` |
| `data-model` | Novas tabelas materializadas, índices, jobs de backfill; E1 só com p95 |
| `implementation` | Codificar recorte aprovado (Fable); preservar `modo=rapida` / `GROUP BY` |
| `qa-verification` | Vitest + e2e; smoke busca (erro ≠ vazio; `vi` → 200) |
| `ux-review` | Estados loading/erro/vazio do dropdown de busca |
| `product-strategy` | Priorizar Fase C vs D vs escopo de ranking/busca; não E1 sem métrica |

## Referências no código

| Área | Caminho |
|------|---------|
| Cache tags | `apps/web/src/lib/comunidade-cache.ts` |
| Infinite hook | `apps/web/src/lib/use-comunidade-infinite-feed.ts` (TanStack Query) |
| Windowing | `apps/web/src/lib/use-feed-window.ts` (`@tanstack/react-virtual`) |
| Query provider | `apps/web/src/components/portal/comunidade-query-provider.tsx` (`gcTime` 20 min) |
| Prefetch hover | `apps/web/src/components/portal/comunidade-prefetch-link.tsx` |
| Feed + ranking | `apps/web/src/lib/feed.ts` (Descobrir unificado → `posts`) |
| Timeline | `apps/web/src/lib/feed-timeline.ts`, `feed-timeline-queue.ts` |
| Live refresh | `apps/web/src/lib/feed-live-refresh.ts`, `feed-live-banner.tsx` (sem `router.refresh`) |
| Publish client | `feed-composer.tsx` → evento `comunidade:post-publicado`; prepend no infinite |
| Layout chrome | `comunidade-layout-chrome.tsx`, `comunidade-feed-bootstrap.tsx`, `composer-context.ts` |
| Busca | `comunidade-busca.ts`, `postIncludeBusca`/`projetarPostBusca` em `feed.ts`, `comunidade-search-bar.tsx` (`modo=rapida`), `api/comunidade/busca` |
| Stories | `apps/web/src/lib/stories.ts` |
| Salas / tenant | `salas.ts` (`listSalasAtivas` + `React.cache`), `tenant.ts` (`getActiveTenant` + `React.cache`) |
| SSE feed | `apps/web/src/lib/feed-bus.ts`, `realtime-bus.ts`, `use-feed-stream.ts` |
| SSE notif | `apps/web/src/lib/notificacoes-bus.ts`, `realtime-bus.ts` |
| SSE mensagens | `apps/web/src/lib/mensageria-bus.ts`, `use-mensagem-stream.ts` |
| Chat resumo | `apps/web/src/app/api/conversas/resumo/route.ts` |
| Measure e2e | `e2e/publish-latency.measure.ts`, `e2e/feed-nav-back.measure.ts` (`--project=measure`) |
| Scripts DB | `packages/db/scripts/enable-pg-trgm.js` |
| Schema | `packages/db/prisma/schema.prisma` (`FeedTimeline`, índices `Post`) |
