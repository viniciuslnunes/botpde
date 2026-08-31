# Dados públicos de futebol — torcedoria e presença digital

> Inteligência para enriquecer `Afiliacao` no onboarding. **Consulta 2026-07-13.**
> Dados operacionais: `docs/data/torcedores-estimados.md`.
>
> **Ampliação 2026-08-27:** este doc cobre a camada digital (IBOPE) e as APIs de
> jogos. Para a **fonte certa de cada campo de clube** — existência profissional
> (CBF RNC), cidade (Wikidata/Ogol/IBGE), tamanho de torcida por pesquisa
> (Datafolha), registro de torcida (federação estadual) e CNPJ —, ver
> [`fontes-dados-clubes.md`](fontes-dados-clubes.md); o cruzamento medido com o
> banco está em [`docs/data/auditoria-catalogo-clubes.md`](../data/auditoria-catalogo-clubes.md).

## IBOPE Repucom — Ranking Digital dos Clubes Brasileiros

**O que é:** levantamento **mensal** dos 50 clubes de futebol com maiores bases
digitais no Brasil.

**URL índice:** [iboperepucom.com/br/rankings](https://www.iboperepucom.com/br/rankings/)

**Métrica:** soma de **inscritos/seguidores** nos perfis **oficiais** do clube em:

Facebook · X (Twitter) · Instagram · YouTube · TikTok

**Critério de amostra (2026):** 20 times da Série A vigente + 30 clubes com
maiores bases digitais nas demais divisões.

**Confiança:** alta para totais publicados; média para extrapolações entre edições.

### O que NÃO é

- **Não** mede “quantos torcedores o clube tem no Brasil” (não é pesquisa de
  opinião/IBOPE de torcedoria presencial).
- **Não** deduplica pessoas (mesmo torcedor pode contar em 5 redes).
- **Não** cobre clubes fora do Top 50 monitorado (~268+ no nosso catálogo nacional).

### Referências usadas no projeto (Jul/2026)

| Fonte | Conteúdo |
|-------|----------|
| [IBOPE Repucom Jun/2026](https://www.iboperepucom.com/br/rankings/ranking-digital-dos-clubes-brasileiros-jun-2026/) | Metodologia, destaques, infográfico |
| [Cassio Zirpoli Jun/2026](https://cassiozirpoli.com.br/o-ranking-de-redes-sociais-ate-junho-de-2026-vitoria-passou-o-fortaleza/) | Top 5 BR + totais NE com posição |
| [ge Out/2025](https://ge.globo.com/rn/blogs/augustox/post/2025/09/03/flamengo-santos-ranking-digital-dos-clubes-brasileiros.ghtml) | Posições 6–20 |
| [PDF Poder360 / IBOPE Jan/2025](https://static.poder360.com.br/2025/01/ranking-digital-clubes.pdf) | Série histórica, metodologia |

### Ordens de grandeza (Jun/2026, confiança alta)

| Pos. | Clube | Inscritos digitais |
|------|-------|-------------------|
| 1º | Flamengo | ~67,5 mi |
| 2º | Corinthians | ~43,0 mi |
| 49º | Botafogo-PB | **471.612** (menor total publicado no Top 50) |

**Insight de produto:** o piso do Top 50 IBOPE (~472 mil inscritos) é **ordens de
magnitude acima** de qualquer estimativa razoável para clube fora do ranking.
Nunca misturar os dois tiers na copy sem qualificar.

**Estado real medido (2026-08-27):** os 274 clubes fora do Top 50 estão todos
gravados com `torcedores_estimados = 471.612` (o piso do IBOPE) e tipo
`LIMITE_ATE`. A UI não expõe esse número — `format-contagem.ts` devolve
*"base digital não estimada"* —, mas o valor no banco não significa nada.
Substituto com fonte: tier `PESQUISA` (Datafolha × base IBGE 16+) em
`packages/db/src/data/torcedores-pesquisa-datafolha.js`. Ver
[`docs/data/auditoria-catalogo-clubes.md`](../data/auditoria-catalogo-clubes.md) §3.

### Contexto 2026 — limpeza no Instagram

A partir de mar/2026, banimentos/desativações de contas no Instagram reduziram
saldo de seguidores dos clubes (IBOPE Repucom, Jul/2026). Atualizações mensais
são necessárias — números podem cair mesmo com clube em boa fase esportiva.

## Estratégia no Torcida SaaS

Dois tiers em `Afiliacao` (seed offline, nunca API em runtime):

| Tier | Cobertura | Valor | UI no card |
|------|-----------|-------|------------|
| `IBOPE_DIGITAL` | Top 50 (total publicado ou integrante conhecido) | Inscritos reais | `67,5 mi inscritos digitais` |
| `PLATAFORMA` | Clube com usuários aprovados no SaaS | Contagem real | `142 torcedores na plataforma` |
| `LIMITE_ATE` | Sem dado próprio | Menor valor conhecido (IBOPE × plataforma) | **`base digital não estimada`** (a copy "até X ou menos" não existe mais no código) |

**Presença na plataforma** (sócios/torcedores online) vem do sistema
(`User.ultimoAcessoEm`, agregação por clube canônico) — separado da estimativa web.

## Manutenção

1. Baixar edição mensal do IBOPE Repucom.
2. Atualizar `packages/db/src/data/ibope-ranking-digital.js`.
3. `pnpm --filter @torcida/db seed:torcedores-estimados`.
4. Validar cards em `/onboarding`.

Agentes: `research-dominio` (novos fatos aqui), `data-model` (schema),
`implementation` (seed), `ux-review` (copy dos tiers), `qa-verification` (testes).

---

## Calendário / tabela / painel “Sports” do Google — o que **não** existe de graça

> Consulta **2026-07-17**. Confiança: **alta** (documentação Google + ausência de
> produto público; painel SERP observado na UI).

Usuários (e stakeholders) frequentemente pedem “a API do Google Sports” — o painel
rico da busca (tabela, próximos jogos, notícias, técnico) ao pesquisar um clube.
**Não há API oficial gratuita da Google que devolva esse painel estruturado.**

| Caminho Google | O que entrega | Serve para `Partida` / tabela? |
|----------------|---------------|--------------------------------|
| Knowledge Graph Search API | Entidades (nome, tipo, descrição) | **Não** — sem standings/fixtures |
| Custom Search JSON API | Resultados de busca (links/snippets); free tier limitado | **Não** — não é dado esportivo estruturado |
| “Sports widget” / painel SERP | Só na UI da Busca Google | **Sem API pública** documentada |
| Scraping da SERP | HTML frágil | **Proibido** pelos ToS; quebra fácil; risco legal |

Scrapers comerciais (ex.: SerpApi e similares) podem expor o painel via proxy pago —
**terceiro pago**, não Google oficial; rate limits e ToS do scraper se aplicam.
Não tratar como “API Google grátis” em plano de produto.

### O que o Torcida SaaS deve usar em vez disso

Para popular `Partida` (global por `Afiliacao`) e enriquecer Agenda:

| Camada | Uso no produto | Notas |
|--------|----------------|-------|
| Cadastro manual / “partida rápida” | Já entregue (2026-07-17) | Form admin + vínculo `Evento.partidaId` |
| **API-Football** (`v3.football.api-sports.io`) | Sync de calendário/placar → `Partida` | **Decisão #7 fechada (2026-08-12): plano pago.** Free só 2022–2024. Referência: `docs/knowledge/api-football-referencia.md`; integração: `docs/data/integracao-api-football.md` |
| `football-data.org` | Descartado como fonte | Free cobre só Série A; sem estaduais em plano nenhum |
| Wikidata / dados abertos | Spike opcional (fixtures limitados) | Cobertura desigual BR |
| RSS / imprensa | Notícias (`Noticia`), não jogos | Curadoria via `news-curator` |
| Sofascore **widgets** oficiais | Display na Comunidade | Embed iframe — **não** alimenta `Partida` |

Doc operacional Agenda: `docs/data/modulo-eventos.md`. Widgets:
`docs/data/modulo-sofascore-widgets.md`.

**Regra para agentes:** se alguém pedir “integrar Google Sports / tabela Google”,
responder com esta seção; propor sync via provedor de futebol ou entrada manual —
nunca scraping SERP nem inventar endpoint Google inexistente.
