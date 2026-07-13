# Dados públicos de futebol — torcedoria e presença digital

> Inteligência para enriquecer `Afiliacao` no onboarding. **Consulta 2026-07-13.**
> Dados operacionais: `docs/data/torcedores-estimados.md`.

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
magnitude acima** do teto conservador que usamos para clubes fora do ranking
(10 mil torcedores). Nunca misturar os dois tiers na copy sem qualificar.

### Contexto 2026 — limpeza no Instagram

A partir de mar/2026, banimentos/desativações de contas no Instagram reduziram
saldo de seguidores dos clubes (IBOPE Repucom, Jul/2026). Atualizações mensais
são necessárias — números podem cair mesmo com clube em boa fase esportiva.

## Estratégia no Torcida SaaS

Dois tiers em `Afiliacao` (seed offline, nunca API em runtime):

| Tier | Cobertura | Valor | UI no card |
|------|-----------|-------|------------|
| `IBOPE_DIGITAL` | Top 50 (total publicado ou integrante conhecido) | Inscritos reais | `67,5 mi inscritos digitais` |
| `LIMITE_ATE` | Demais ~274 clubes do catálogo | Teto 10.000 | `até 10 mil torcedores ou menos` |

**Presença na plataforma** (sócios/torcedores online) vem do sistema
(`User.ultimoAcessoEm`, agregação por clube canônico) — separado da estimativa web.

## Manutenção

1. Baixar edição mensal do IBOPE Repucom.
2. Atualizar `packages/db/src/data/ibope-ranking-digital.js`.
3. `pnpm --filter @torcida/db seed:torcedores-estimados`.
4. Validar cards em `/onboarding`.

Agentes: `research-dominio` (novos fatos aqui), `data-model` (schema),
`implementation` (seed), `ux-review` (copy dos tiers), `qa-verification` (testes).
