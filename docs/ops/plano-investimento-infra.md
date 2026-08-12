# Plano de investimento em infra (performance + ads)

> Decisão de reflexão **2026-07-23** (fundador + agentes `performance` /
> `product-strategy`). Não é ordem de execução automática — é memória para
> retomar o assunto. Execução exige medição + aprovação humana.

## Contexto de negócio (não esquecer)

- **“Produção” hoje** = ambiente principal de **demo / apresentação**, não
  escala comercial com milhares de concorrentes.
- **Modelo de receita desejado:** plataforma **gratuita** para usuários e
  torcidas; retorno via **publicidade** (atenção + pageviews + inventário
  limpo). Não priorizar cobrança de mensalidade SaaS como narrativa de
  receita do fundador (paridade comercial com concorrentes continua útil
  como *produto operacional* da torcida — ver `plano-paridade-concorrentes.md`).
- Ambição de base (ex.: % de bases grandes tipo Corinthians) é **depois** de
  retenção operacional. Escala nacional **não** justifica Faixa C/D agora.
- Orçamento típico na data da decisão: ~R$30/mês Railway + gasto alto em IA
  (Cursor/Claude). Intenção: realocar parte do corte de Claude Code para
  infra **mínima** que profissionaliza a 1ª carga — não queimar em escala.

## Diagnóstico (1ª carga lenta)

O teto zero-custo de **código** da Comunidade (~85–95%) já foi capturado
(`docs/data/modulo-comunidade-performance.md`). A percepção “amadora” na
1ª visita combina sobretudo:

1. **Sem domínio → F4 CDN = 0%** — `/_next/static` no origin Railway; LCP
   em 4G sofre. Runbook: `docs/ops/cloudflare-cdn.md` (estimativa doc:
   ~40–60% no LCP estático **com** CDN).
2. **Cold / idle** do `torcida-web` após inatividade.
3. **RTT app↔Postgres** se serviços/regiões diferirem (private networking
   já remove proxy público — ver `ARCHITECTURE.md` §2.5; colocation ainda
   importa).
4. **HTML/RSC autenticado** dinâmico — TTFB do documento não some só com
   mais React.
5. **`REDIS_URL` opcional** — impacto baixo na 1ª carga com 1 réplica;
   importa para SSE / 2ª réplica (Upstash Free já documentado).

**Não** reabrir ondas A–D da Comunidade, Meilisearch, Neon/Vercel ou pooler
“por hábito”. Gatilhos: mesmo doc de performance + §5.4 do `ARCHITECTURE.md`.

## Faixas de investimento (ordem financeira)

Preços **aproximados** (USD/BRL flutuam). Validar fatura Railway na hora.

| Faixa | Custo/mês (aprox.) | O quê | Retorno esperado | Quando NÃO |
|-------|--------------------|--------|------------------|------------|
| **A — Fundação** | R$0–40 (domínio ~R$40–80/**ano**) | Domínio próprio + Cloudflare Free + Upstash Free (`REDIS_URL`) + mesma região web/DB + `PERF_METRICS=1` + keep-alive leve se cold confirmado | LCP estático bem melhor; demos menos “frias”; fan-out multi-réplica pronto; métricas reais | Sem domínio = CDN não liga |
| **B — Demo quente** | R$80–200 | Mais CPU/RAM no web e/ou Postgres Railway; evitar scale-to-zero | Menos cauda lenta em call/piloto; dezenas de usuários — **não** vira app nativo | Antes de medir A; se o problema for só LCP de assets |
| **C — Pilotos / dia de jogo leve** | R$250–500 | Colocation séria (ideal público BR); PgBouncer/pooler **só** com contenção; Redis pago só se Free estourar (~500k cmds/mês) | TTFB RSC ~20–50% **se** RTT DB for o vilão; dezenas–baixa centena concorrentes | &lt;50 simultâneos sem saturação CPU/conexões; **não** migrar Vercel+Neon sem critério §5.4 |
| **D — Escala ads** | R$800+ | Read replica (F2), mais réplicas, obs paga | Milhares / inventário nacional | **Agora** — produto incompleto e sem pageviews que paguem a conta |

### Orçamento liberado (orientação product-strategy)

Se cortar Claude Code (~R$150–220/mês liberados):

- **Agora:** ~**20–30%** em infra (~R$40–65) → cabe **Faixa A** (+ headroom
  mínimo se medição pedir).
- **70–80%** em **Cursor + reserva** — velocidade para fechar núcleo que
  faz gente voltar (pré-requisito de qualquer ads).
- Subir para **40–50% infra** só quando: (a) LCP/sessão em piloto real
  piorar com carga, ou (b) bill/latência Railway no teto, ou (c) inventário
  ads a ≤1 ciclo de go-live.

## Roadmap sugerido (4–8 semanas) — retomar daqui

| Semana | Ação |
|--------|------|
| 1 | Medir (checklist abaixo). Região web = Postgres? Private networking? `REDIS_URL`? `pg_trgm`? |
| 1–2 | **Faixa A** se ainda não feita |
| 3–4 | Comparar LCP / `wallMs`/`dbMs`. **Faixa B** só com cauda lenta / demos frias |
| 5–8 | Pilotos reais. **Faixa C** só com evidência. Resto → features de **retorno** (atenção recorrente), não ERP novo |

## Checklist antes de pagar (obrigatório)

- [ ] `PERF_METRICS=1` no `torcida-web` → p95 `queries` / `dbMs` / `wallMs`
- [ ] DevTools: 1ª carga vs 2ª (&lt;2 min); LCP, TTFB HTML, peso `/_next/static`
- [ ] `e2e/nav-latency.portal.spec.ts` (+ measure Comunidade se regressão)
- [ ] Railway: mesma região web↔DB? CPU/RAM/restart após idle?
- [ ] Env: `REDIS_URL`? checklist pós-deploy do doc Comunidade
- [ ] Após domínio: `cf-cache-status: HIT` em `/_next/static`
- [ ] Pico leve (10–30 abas) antes de comprar pooler

## Ads × performance (critério de produto)

No modelo 100% ads, performance da **1ª carga mobile 4G** (LCP até 1º
conteúdo útil, INP de engajamento, CLS estável para slots futuros) é
**capacidade de inventário**, não “dívida técnica estética”.

Gastar em infra só quando um **degrau mensurável** estiver bloqueado:

| Gate | Sinal para gastar | Caso contrário |
|------|-------------------|----------------|
| Demo / piloto | Bounce na 1ª carga; timeouts; “não dá pra mostrar” | Feature + wins de código já no teto Comunidade |
| Base real | Uso diário + retorno de sessão | Não comprar escala “por se” |
| Ads | Inventário viewável + brand safety mínima + tráfego recorrente | Não pagar capacidade sem usuários |

**Riscos do 100% ads no nicho:** brand safety/rivalidade; moderação como
custo fixo (LGE); chicken-egg CPM; sazonalidade dia de jogo; escala
prematura (“% de 35M”) antes de retenção.

## Corte de custo (o outro lado deste plano)

Este doc responde **quando gastar mais**. O inverso — o que a Railway cobra
hoje, projeto a projeto, e qual corte compensa — está em
[`custo-railway-projetos.md`](./custo-railway-projetos.md) (medido 2026-08-12).
Resumo: a conta dobrou por causa da **subida de produção**, não do HML; 33% do
gasto é de bots Discord que não são deste produto; e matar o Postgres de
homologação economizaria ~R$10/mês ao preço de perder o único gate antes de
prod — decisão registrada como **rejeitada**.

## Fontes cruzadas

- `ARCHITECTURE.md` §2.5 (deploy/custo), §5.4 (provedor DB), §5.6 / §5.6.1
- `docs/ops/custo-railway-projetos.md` — fatura real por projeto + backlog Discord
- `docs/data/modulo-comunidade-performance.md` — baseline, Fases E/F, ganhos %
- `docs/ops/cloudflare-cdn.md` — Faixa A / F4
- `docs/ops/deploy-multi-tenant.md` — domínio / `ROOT_DOMAIN` / OAuth

## Status

| Item | Estado (2026-07-23) |
|------|---------------------|
| Plano documentado | ✅ este arquivo |
| Faixa A executada | ⬜ pendente (domínio + CF + Upstash + métricas) |
| Faixa B+ | ⬜ só com evidência pós-A |
