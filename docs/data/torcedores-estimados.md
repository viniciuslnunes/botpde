# Estimativa de torcedores / base digital por clube

> Dados **offline** (seed). Nunca consultar IBOPE ou redes em runtime.
> Inteligência de domínio: `docs/knowledge/futebol-dados-publicos.md`.
>
> **Revisão 2026-08-27 — leia antes de usar as tabelas abaixo.**
> 1. A copy `até X torcedores ou menos` descrita neste doc **não existe mais no
>    código**: `formatTorcedoresEstimados` (`apps/web/src/lib/format-contagem.ts`)
>    devolve `base digital não estimada` para `LIMITE_ATE`.
> 2. No banco, os **274 clubes** com `LIMITE_ATE` estão todos com o mesmo valor
>    (471.612, o piso do Top 50 IBOPE) — número sem significado, ainda que
>    invisível na UI.
> 3. Fonte nova para tamanho de torcida de verdade: **Datafolha 07/2026 × base
>    IBGE 16+** em `packages/db/src/data/torcedores-pesquisa-datafolha.js`
>    (tier `PESQUISA` proposto). Avaliação das fontes:
>    `docs/knowledge/fontes-dados-clubes.md`; medições:
>    `docs/data/auditoria-catalogo-clubes.md` §3.

## Objetivo

Todo clube em `Afiliacao` deve exibir uma estimativa **embasada** no card de onboarding:

| Tier | Quem | Valor | UI |
|------|------|-------|-----|
| **IBOPE_DIGITAL** | Top 50 monitorado pelo IBOPE Repucom | Total de **inscritos digitais** (5 redes) | `42,7 mi inscritos digitais` |
| **PLATAFORMA** | Clube com torcedores/sócios na plataforma | Contagem **real** aprovada | `142 torcedores na plataforma` |
| **LIMITE_ATE** | Sem IBOPE nem contagem na plataforma | Teto = **menor valor conhecido** (IBOPE curado × menor clube na plataforma) | `até 2 mil torcedores ou menos` |

> **Não há teto fixo de 10 mil.** O “10 mil” citado na pesquisa inicial era exemplo
> ilustrativo. O teto acompanha a base: quando o menor dado publicado for 2 mil,
> desconhecidos exibem “até 2 mil ou menos”.

## Fonte principal: IBOPE Repucom — Ranking Digital

Publicação mensal: [Rankings IBOPE Repucom](https://www.iboperepucom.com/br/rankings/)

### O que o ranking mede

- **50 clubes** com maiores bases digitais do Brasil
- Soma de seguidores/inscritos nos perfis **oficiais** em:
  - Facebook, X (Twitter), Instagram, YouTube, TikTok
- Critério (2026): 20 clubes da Série A + 30 maiores bases nas demais divisões
- **Não** é pesquisa de “quantos torcedores o clube tem no Brasil”
- Uma pessoa pode contar em várias plataformas e seguir clubes rivais

### Referências usadas no seed

| Edição | URL | Uso |
|--------|-----|-----|
| Jun/2026 | [IBOPE Repucom](https://www.iboperepucom.com/br/rankings/ranking-digital-dos-clubes-brasileiros-jun-2026/) | Top 5 nacional + clubes NE com totais exatos |
| Jun/2026 | [Cassio Zirpoli](https://cassiozirpoli.com.br/o-ranking-de-redes-sociais-ate-junho-de-2026-vitoria-passou-o-fortaleza/) | Top 5 BR + Top 15 NE (posição e total) |
| Out/2025 | [ge](https://ge.globo.com/rn/blogs/augustox/post/2025/09/03/flamengo-santos-ranking-digital-dos-clubes-brasileiros.ghtml) | Posições 6–20 |
| Jan/2025 | [PDF Poder360 / IBOPE](https://static.poder360.com.br/2025/01/ranking-digital-clubes.pdf) | Metodologia e série histórica |

### Menor total publicado no Top 50

**Botafogo-PB: 471.612 inscritos** (49º, Jun/2026). Clubes do Top 50 sem total exato na planilha recebem esse **piso** até a coleta mensal preencher o valor real.

### Teto fora do Top 50 (LIMITE_ATE)

Clubes sem IBOPE e **sem** torcedores/sócios na plataforma recebem o **menor valor
conhecido** entre:

1. Menor total publicado no JSON IBOPE (`calcularMenorValorEstimadosConhecido()`)
2. Menor clube com contagem real na plataforma (`getMenorContagemPlataformaGlobal()`)

Copy: **“até X torcedores ou menos”**, onde X é esse mínimo dinâmico (nunca 10 mil fixo).

Na UI (`getAfiliacoesParaOnboarding`), clubes com contagem real na plataforma
sobrescrevem LIMITE_ATE e exibem tier **PLATAFORMA**.

## Arquivos

```
packages/db/src/data/
  ibope-ranking-digital.js   # Tabela curada IBOPE (chave → inscritos)
  torcedores-estimados.js    # resolverTorcedoresEstimados(chave)
packages/db/scripts/
  seed-torcedores-estimados.js
```

Casamento com `Afiliacao`: `chaveGrupoClube(nome, uf)` em `afiliacoes-normalize.js`.

## Comandos

```bash
pnpm --filter @torcida/db db:push
pnpm --filter @torcida/db seed:torcedores-estimados
pnpm --filter @torcida/db seed:torcedores-estimados -- --dry-run
```

## Evolução (coleta mensal)

1. Baixar tabela/infográfico da edição do mês em iboperepucom.com
2. Montar JSON de entrada (ver `packages/db/src/data/ibope-ranking-input.example.json`)
3. `pnpm --filter @torcida/db coleta:ibope-ranking -- --import=entrada.json`
4. `pnpm --filter @torcida/db coleta:ibope-ranking -- --validate` (posições faltantes)
5. Rodar seed em staging → validar cards do onboarding → produção

Fonte editável: `packages/db/src/data/ibope-ranking-digital.json` (48+ clubes Jun/2026;
posições 47 e 50 pendentes de coleta mensal).

## Limitações (transparência na UI)

- Inscritos digitais ≠ torcedores presenciais
- Top 50 muda a cada mês (promoções/rebaixamentos, virais, limpezas do Instagram)
- Clubes fora do Top 50: estimativa **conservadora**, não ausência de torcedores
