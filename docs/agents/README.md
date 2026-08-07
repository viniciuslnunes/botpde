# Time de agentes — Torcida SaaS

Modelo de trabalho assistido por IA: **planejar antes de codificar**, com escopo
mínimo na implementação. Use **Sonnet** ou o **modelo Auto** da sessão — não
fixar Opus para planejamento. Os agentes vivem em `.claude/agents/*.md` e são
invocáveis pelo Claude Code (aparecem em `/agents`). Este README explica quando
usar cada um.

## Memória de domínio compartilhada

Todos os agentes se apoiam na base de conhecimento em **`docs/knowledge/`**
(ver o índice em `docs/knowledge/README.md`): alianças e rivalidades,
perfis das torcidas do Brasil, estrutura/governança interna, cultura e
ideologia, contexto legal (Lei Geral do Esporte) e glossário do nicho.
Regras: cada fato tem fonte + data + grau de confiança; rivalidades existem
só para moderação; quem escreve lá são `aliancas-torcidas` e
`research-dominio` — os demais só leem. A cada decisão nova de produto ou
arquitetura, registre nos docs que os agentes leem (este é o protocolo de
"alimentar o time").

**Design / cores (2026-07-17):** rivalidade também é regra de UI — ver
`docs/knowledge/identidade-visual-cores.md` e `docs/data/modulo-design.md`.
Agentes: `ux-review`, `implementation`, `qa-verification`, `product-strategy`
(+ `aliancas-torcidas` se surgir fato novo de cor ofensiva por praça).

## Papéis

| Agente | Quando usar |
|---|---|
| `setup` | Onboarding de máquina: Node/pnpm, Docker, Postgres local, sync, `.env` e secrets do time (`/setup` no Cursor; script `scripts/dev-setup.*`) |
| `research-dominio` | Entender o nicho, benchmarks, riscos — antes de decidir |
| `aliancas-torcidas` | Estudar alianças/rivalidades; recomendar aliados na config |
| `product-strategy` | Decidir o quê construir e em que ordem |
| `data-model` | Propor/validar entidades Prisma e integridade |
| `rbac` | Permissões, autorização e visibilidade cross-tenant |
| `loja` | Catálogo, sacola, checkout, cupons, pedidos e estoque |
| `performance` | Auditar latência, queries, cache, bundle e polling; planejar otimizações zero-custo |
| `ux-review` | Revisar fluxo/telas (usa o skill `impeccable` no detalhe visual; captura PNGs reais via Playwright, ver `apps/web/e2e/README.md`) |
| `qa-verification` | Verificar antes de dar como pronto; rodar Vitest |
| `implementation` | Codificar o combinado, com escopo mínimo |
| `news-curator` | Curar fila de notícias externas: aprovar/rejeitar com justificativa |

## Fluxo recomendado por feature

1. **Entender** → `research-dominio` (+ `aliancas-torcidas` se for do tema).
2. **Recortar** → `product-strategy` decide escopo e fase.
3. **Modelar** → `data-model` (dados) + `rbac` (acesso/visibilidade); para loja, também `loja`.
4. **Desenhar** → `ux-review` valida jornada e estados.
5. **Performance** (quando relevante) → `performance` audita impacto em TTFB/queries antes de fechar plano em páginas pesadas, feeds ou polling novo.
6. **Fechar plano** → aprovação humana.
7. **Implementar** → `implementation` segue `CLAUDE.md`.
8. **Verificar** → `qa-verification` confere DoD e roda testes.

## Performance (plano concluído — manutenção contínua)

As Fases 1–5 de otimização web estão documentadas em `ARCHITECTURE.md` §5.6
(commits `99443a7` → `82ae6f3`). **Comunidade (2026-07-16):** ondas A–B, C, D1–D3
e F4 (Cloudflare) em `docs/data/modulo-comunidade-performance.md`.
**Engajamento overlay (2026-07-17):** reação/comentário sem `revalidatePath` do
feed; gate CN em `modulo-comunidade.md` § engajamento — agente `performance` /
`implementation` / `rbac` / `qa-verification` devem preservar o padrão.
**Publish + nav-back (2026-07-17):** prepend otimista (`comunidade:post-publicado`);
sem refresh RSC ao publicar; Descobrir unificado; chrome salas/chat no layout;
`React.cache` salas/tenant; measure `publish-latency` / `feed-nav-back` — ver
`modulo-comunidade-performance.md` § publish / nav-back. Agentes:
`performance`, `implementation`, `qa-verification`, `ux-review`.
**Busca (2026-07-17):** typeahead `modo=rapida`; SQL membros com `GROUP BY`
(nunca `DISTINCT`+`ORDER BY similarity` — Postgres `42P10`); erro HTTP ≠ empty
state; `postIncludeBusca` — ver `modulo-comunidade.md` § busca e
`modulo-comunidade-performance.md` § B6.1. Agentes: `performance`,
`implementation`, `qa-verification`, `ux-review`.
CDN: `docs/ops/cloudflare-cdn.md`. Use o agente `performance` para:
- validar que uma feature nova não reintroduz N+1 ou prefetch agressivo;
- propor recortes quando navegação ou demo voltarem a degradar;
- decidir se o próximo passo é código ou infra (pooler, Meilisearch, etc.);
- **não** empurrar Fase E/F sem métrica (p95, conexões, `pg_trgm` medido).

Fase C e D (zero-custo) estão entregues (~**85–95%** do valor do plano sem
domínio). Live UX gratuito (`f6690cb`): ping SSE pós-fan-out; auto-refetch no
topo (~250ms); banner se rolado — ver `feed-live-refresh.ts` e § padrões / ganhos
em `modulo-comunidade-performance.md`. E/F e CDN exigem evidência ou domínio
próprio.

### Investimento em infra (demo / ads) — 2026-07-23

Memória de decisão: `docs/ops/plano-investimento-infra.md` (faixas **A–D**,
checklist de medição, orçamento liberado de IA, modelo ads gratuito).
Agentes: `performance` (stack/ROI) + `product-strategy` (quando gastar vs
feature). **Próximo degrau default = Faixa A** (domínio + Cloudflare Free +
Upstash Free + `PERF_METRICS`); não Neon/Vercel/pooler sem gatilho.

## Escudos de clubes (`Afiliacao`) — entregue (Fases A–F)

Inteligência de casamento clube ↔ imagem para o onboarding. **Fase A–F entregues**
(2026-07-13): Soccer Wiki, Ogol, TheSportsDB, placeholder `EscudoClube`, dedup.
Ver `docs/data/escudos-afiliacoes.md` e `ARCHITECTURE.md` §5.9.
Agentes: `data-model`, `research-dominio`, `implementation`, `qa-verification`.

## Estimativa de torcedores / base digital — em produção (2026-07-13)

Metadados no **card de clube** do onboarding: inscritos digitais (IBOPE Repucom
Top 50), teto conservador para demais clubes, sócios/torcedores da plataforma
com presença online.

| Doc | Conteúdo |
|-----|----------|
| `docs/data/torcedores-estimados.md` | Metodologia, tiers, comandos seed |
| `docs/knowledge/futebol-dados-publicos.md` | Fontes IBOPE, limitações, manutenção |
| `ARCHITECTURE.md` §5.10 | Decisões fechadas no repo |

**Regras de copy:** Top 50 → “inscritos digitais”; plataforma → contagem real;
sem dado → “até X torcedores ou menos” (X = menor valor conhecido, dinâmico).
Coleta mensual offline — **nunca** IBOPE em runtime.

Agentes: `research-dominio` (atualizar knowledge), `data-model` (enum/campos),
`ux-review` (card/tooltip), `implementation` (seed + UI), `qa-verification`
(`test:torcedores-estimados`, Vitest format-contagem).

## Departamento no onboarding — preferência ≠ membership (2026-07-17)

Inteligência do fluxo recrutamento → departamentos. Commit `b0a5e3a`.

| Regra | Detalhe |
|-------|---------|
| Preferência | `SaasMembro.departamentoId` no cadastro de sócio |
| Membership | Só em `aprovarMembro` (perfil `Membro · área` + sync); opção **Sem área** |
| Pendente/Reprovado | Sem `UserDepartamento`; equipe filtra; reprovar/reverter limpa |
| Admin | Coluna Departamento na fila; diálogo “Aprovar e incluir em X?” |
| Repair | `pnpm --filter @torcida/db db:repair-departamento-orfaos` |
| Doc | `docs/data/modulo-departamentos.md`, `spec-onboarding.md`, `estrutura-governanca.md` |

**Anti-padrão:** upsert de área em `solicitarVinculo`; write-on-GET na equipe;
aprovar “no escuro” sem mostrar o departamento.

Agentes: `data-model`, `rbac`, `implementation`, `ux-review`, `qa-verification`.

## Agenda unificada + `Partida` — entregue (2026-07-17)

Hub único de eventos (decisão **1A** + fases **2C**). Commit `36071fa`.
Doc canônico: `docs/data/modulo-eventos.md`; decisão arquitetural: `ARCHITECTURE.md` §5.11.

| Entrega | Detalhe |
|---------|---------|
| Hub | `/admin/eventos`, `/portal/eventos`; vistas lista/semana/mês; redirects caravanas/bateria |
| Capacidade | `LISTA_ESPERA` FIFO (`criadoEm`); promove ao liberar vaga |
| Série | `serieId` + edit/delete esta\|futuras |
| Mapa | `lat`/`lng` + embed OSM |
| Check-in | QR + fila offline (localStorage) |
| `Partida` | Global por `Afiliacao`; vínculo `Evento.partidaId`; cadastro rápido |
| Cron | `GET /api/cron/eventos-lembretes` |

**Anti-padrões:** apps separados caravanas/bateria; scrapar Google Sports SERP;
tratar Sofascore widgets como sync de `Partida`. Fontes de jogos:
`docs/knowledge/futebol-dados-publicos.md`. Decisão aberta #7 = provedor API.

Agentes: `product-strategy`, `data-model`, `research-dominio`, `implementation`,
`ux-review`, `qa-verification`, `rbac`.


## StickyPersistBar — some ao limpar dirty (2026-07-17)

Inteligência da barra Salvar/Cancelar compartilhada (admin Design, loja, sedes,
config/departamentos, onboarding).

| Regra | Detalhe |
|-------|---------|
| Dirty / pending | `locked` → barra sempre visível, borda de destaque |
| Limpo no load | Oculta; scroll pode mostrar; idle/clique fora → some |
| Sair de locked | Salvar, Descartar ou **reverter campos ao baseline** → **some na hora** |
| Anti-padrão | Ficar no visual cinza (unlocked) com hint/Ctrl+S sumidos e CTAs disabled |
| Fix | `setVisible(false)` ao destravar em `use-persist-bar-visibility.ts`; limpar `focusLocked` em `StickyPersistBar` quando `locked` vira false |
| Doc | `docs/frontend/motion.md` § barra; `docs/data/modulo-design.md` § estúdio |

Agentes: `ux-review`, `implementation`, `qa-verification`.

## Benchmark competitivo (gestão de torcidas) — 2026-07-16

Inteligência de mercado em `docs/knowledge/concorrentes-gestao.md` (TorcidaWeb,
Softaliza, TorcidasPRO, Clube Control). Plano acionável de paridade/diferenciação
em `docs/product/plano-paridade-concorrentes.md`.

**Regra para o time:** table stakes de **caixa + carteirinha QR + LGE** (Fase A)
antes de módulos de sede física (catracas, bar, day use). Não copiar o mapa de
31 módulos do Clube Control sem ICP de sede. Agentes: `research-dominio`
mantém o knowledge; `product-strategy` prioriza pelo plano; `data-model` /
`rbac` / `loja` / `ux-review` executam fases A–B.

## Princípios

- Preferir **Sonnet** ou o **modelo Auto** da sessão; não fixar Opus para planejamento.
- Novo clone / máquina nova → agente `setup` (`/setup`) antes de codar.
- Não implementar antes de o plano estar fechado e aprovado.
- Escopo mínimo e seguro; reutilizar o que já existe.
- Autorização sempre no servidor; auditar toda mutação.
- Cada feature justificada pelo domínio — nada de recurso "bonito" sem valor.
- Performance: medir antes de otimizar; preservar cache, Suspense e `useVisibleInterval`.
- Concorrência: fechar table stakes de associação (cobrança/carteirinha) sem
  abandonar diferenciais de organizada (hierarquia, alianças, departamentos).
