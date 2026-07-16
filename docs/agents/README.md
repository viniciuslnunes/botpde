# Time de agentes — Torcida SaaS

Modelo de trabalho assistido por IA: **Opus planeja, Fable implementa.** Os agentes
vivem em `.claude/agents/*.md` e são invocáveis pelo Claude Code (aparecem em
`/agents`). Este README explica quando usar cada um.

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

## Papéis

| Agente | Quando usar | Model |
|---|---|---|
| `research-dominio` | Entender o nicho, benchmarks, riscos — antes de decidir | opus |
| `aliancas-torcidas` | Estudar alianças/rivalidades; recomendar aliados na config | opus |
| `product-strategy` | Decidir o quê construir e em que ordem | opus |
| `data-model` | Propor/validar entidades Prisma e integridade | opus |
| `rbac` | Permissões, autorização e visibilidade cross-tenant | opus |
| `loja` | Catálogo, sacola, checkout, cupons, pedidos e estoque | opus |
| `performance` | Auditar latência, queries, cache, bundle e polling; planejar otimizações zero-custo | opus |
| `ux-review` | Revisar fluxo/telas (usa o skill `impeccable` no detalhe visual; captura PNGs reais via Playwright, ver `apps/web/e2e/README.md`) | opus |
| `qa-verification` | Verificar antes de dar como pronto; rodar Vitest | opus |
| `implementation` | Codificar o combinado, com escopo mínimo | **fable** |
| `news-curator` | Curar fila de notícias externas: aprovar/rejeitar com justificativa | opus |

## Fluxo recomendado por feature

1. **Entender** → `research-dominio` (+ `aliancas-torcidas` se for do tema).
2. **Recortar** → `product-strategy` decide escopo e fase.
3. **Modelar** → `data-model` (dados) + `rbac` (acesso/visibilidade); para loja, também `loja`.
4. **Desenhar** → `ux-review` valida jornada e estados.
5. **Performance** (quando relevante) → `performance` audita impacto em TTFB/queries antes de fechar plano em páginas pesadas, feeds ou polling novo.
6. **Fechar plano** (Opus) → aprovação humana.
7. **Implementar** → `implementation` (Fable) segue `CLAUDE.md`.
8. **Verificar** → `qa-verification` confere DoD e roda testes.

## Performance (plano concluído — manutenção contínua)

As Fases 1–5 de otimização web estão documentadas em `ARCHITECTURE.md` §5.6
(commits `99443a7` → `82ae6f3`). **Comunidade (2026-07-16):** ondas A–B, C, D1–D3
e F4 (Cloudflare) em `docs/data/modulo-comunidade-performance.md`.
CDN: `docs/ops/cloudflare-cdn.md`. Use o agente `performance` para:
- validar que uma feature nova não reintroduz N+1 ou prefetch agressivo;
- propor recortes quando navegação ou demo voltarem a degradar;
- decidir se o próximo passo é código ou infra (pooler, Meilisearch, etc.);
- **não** empurrar Fase E/F sem métrica (p95, conexões, `pg_trgm` medido).

Fase C e D (zero-custo) estão entregues (~**85–95%** do valor do plano sem
domínio). Ganhos por jornada (%) e gatilhos para reabrir: seção **Ganhos
estimados** em `modulo-comunidade-performance.md`. E/F e CDN exigem evidência
ou domínio próprio.

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


## Princípios

- Não implementar antes de o plano estar fechado e aprovado.
- Escopo mínimo e seguro; reutilizar o que já existe.
- Autorização sempre no servidor; auditar toda mutação.
- Cada feature justificada pelo domínio — nada de recurso "bonito" sem valor.
- Performance: medir antes de otimizar; preservar cache, Suspense e `useVisibleInterval`.
