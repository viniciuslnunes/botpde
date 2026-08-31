# Auditoria do catálogo de clubes e torcidas — 2026-08-27

> Cruzamento do que o sistema tem (`Afiliacao`, `TorcidaConhecida`,
> `RivalidadeClube`, `Sede`) contra fontes externas verificáveis, **e o que foi
> aplicado a partir disso**. Avaliação das fontes:
> [`docs/knowledge/fontes-dados-clubes.md`](../knowledge/fontes-dados-clubes.md).
> Decisões: `ARCHITECTURE.md` §5.29.
>
> Medição reproduzível a qualquer momento:
> `TORCIDA_ENV=local pnpm --filter @torcida/db audit:catalogo-clubes`.
>
> **Estado de aplicação:** tudo abaixo já rodou no **banco local de
> desenvolvimento**. HML e produção ainda precisam do `db:push` (o schema mudou)
> e da execução dos seeds — ver § Como aplicar em HML/prod.

## Placar — antes e depois

| Dimensão | Antes | Depois | Fonte |
|---|---|---|---|
| Clubes no catálogo | 318 | **409** | CBF/RNC 2026 |
| Ranqueados pela CBF presentes | — | **228 de 235** | CBF/RNC 2026 |
| Do RNC ausentes | **91** | **1** (`Rio Branco VN/ES`, homônimo a resolver) | CBF/RNC 2026 |
| Ano de fundação | 0 | **364 (89%)** | Wikidata + Ogol |
| Estádio | 0 | **251 (61%)** | Wikidata |
| Capacidade do estádio | 0 | **183 (45%)** | Wikidata |
| Coordenada do estádio | 0 | **212 (52%)** | Wikidata |
| Site oficial | 0 | **209 (51%)** | Wikidata |
| Cor primária | 0 | **271 (66%)** | paleta curada + escudo (Cloudinary) |
| QID do Wikidata | 0 | **270 (66%)** | Wikidata |
| Cidade válida na UF | 91% (32 inválidas) | **100%** | malha municipal do IBGE |
| Rivalidades de clube | **12 (do seed de teste)** | **66** (65 isolam) | clássicos curados |
| Torcidas no catálogo | 546 | **602** | FPF (SP) |
| Torcidas com registro na federação | 0 | **129** | FPF (SP) |
| Torcidas com ano de fundação | 0 | **519** | parse do campo textual |
| Homônimos não resolvidos | 1 | **0** | fusão curada |

## 1. Clubes: faltava um terço do futebol profissional ranqueado

O **RNC 2026 da CBF** (235 clubes, nome + federação + pontos, PDF revisado em
23/12/2025) é a prova de atividade profissional recente. No cruzamento inicial,
**91 clubes ranqueados não existiam no catálogo** — e não eram obscuros:
Amazonas (40º), Tombense (42º), Retrô (49º), Ypiranga-RS (50º), Athletic-MG
(51º), Aparecidense, Floresta, Manaus, Altos, Águia de Marabá, Maricá, Audax
Rio, Portuguesa-RJ, Inter de Limeira, Real Brasília.

**Aplicado:** `seed:clubes-rnc` criou **92 clubes** (com cidade, fundação,
estádio, site, QID e id do Ogol já preenchidos onde as fontes tinham) e gravou
`rncPosicao`/`rncPontos`/`rncEdicao` em **228**. Em seguida
`db:repair-series-afiliacoes` preencheu a série dos novos.

O seed **não apaga** clube fora do RNC: 181 linhas seguem no catálogo como
clube histórico ou amador (Tupi, São Caetano, Metropolitano, Goytacaz) — a
torcida deles existe. Ausência do RNC virou dado (`rncPosicao: null`), não
exclusão.

### Bug de alias encontrado no caminho

`ALIASES` (`packages/db/src/data/afiliacoes-normalize.js`) tem um par de mão
dupla: `bragantino → red bull bragantino` **e** `red bull bragantino →
bragantino`. O casamento dependia do lado por onde se entrava, e o Bragantino
(**Série A 2026**) aparecia como ausente.

**Aplicado:** `chaveCanonicaClube` segue o alias até o ponto fixo e, ao fechar
ciclo, escolhe o menor nome em ordem lexical — determinístico dos dois lados.
Coberto por `test:catalogo-clubes`.

## 2. Cidade: 10% do catálogo não era município

Validando contra a malha do IBGE já versionada
(`apps/web/src/lib/data/municipios-brasil.json`, 5.571 municípios), 25 clubes
tinham cidade que não é município e 6 apontavam para município de outra UF. Os
valores entregam a causa — `"Estádio Moça Bonita"`, `"Centro"`,
`"571 Curitiba"`, `"Portão B13"`, `"1000"`, `"Acre"`, `"Corumbrá"`:
**a cidade do clube foi herdada do endereço da torcida** no scrape original. O
erro se propagou para `Sede` (69 casos), gerada do mesmo catálogo.

**Aplicado:** `seed:ficha-clubes -- --corrigir-cidades` corrigiu 24 casos em que
Wikidata e Ogol concordavam; `repair:clubes-curados` fechou os 12 restantes com
dataset curado, fonte e grau de confiança
(`packages/db/src/data/clubes-correcoes-curadas.json`) — incluindo
`Teófilo Ottoni → Teófilo Otoni` (grafia oficial do IBGE),
`Blumenal Esporte Clube → Blumenau Esporte Clube` (a torcida vinculada é a "BEC
Manguaça") e `Associação Atlética Luziânia` de DF para **GO** (Luziânia é
município goiano). Resultado: **100% das cidades válidas**.

Exceção deliberada no validador: Gama, Ceilândia e Sobradinho são regiões
administrativas do DF, não municípios, e continuam aceitas.

## 3. Torcedores estimados: 86% carregava um número sem significado

274 clubes tinham `torcedores_estimados = 471.612` — o piso do Top 50 do IBOPE
aplicado a todo mundo fora dele. Não vazava na tela (a UI mostra "base digital
não estimada"), mas era dado morto.

**Aplicado:** novo tier **`PESQUISA`** — Datafolha (coleta 22–23/07/2026, 2.004
entrevistados, ±2 p.p.) convertido pela população de 16+ do Censo 2022 do IBGE
(160.131.985). `resolverTorcedoresEstimados` passou a priorizar pesquisa sobre
IBOPE, então `seed:torcedores-estimados` já aplica os dois tiers. Hoje: **17
`PESQUISA`, 30 `IBOPE_DIGITAL`, 362 `LIMITE_ATE`**.

Na UI o tier tem copy própria — "cerca de 35,2 mi torcedores", não número cheio,
porque o valor é projeção sobre a população, não contagem; clube com 1–2% fica
marcado como dentro da margem no dataset.

## 4. Rivalidade: a feature existia, o dado não

`RivalidadeClube` tinha **12 pares, todos vindos de
`packages/db/scripts/lib/lote-nacional.js`** — o lote de teste. Como
`tenantsAreRivais`/`rivaisEntre` dependem exclusivamente desses pares:
**Remo × Paysandu não se isolavam** (8 tenants de cada lado), nem Ba-Vi,
Sport × Santa Cruz × Náutico, Fortaleza × Ceará, ABC × América-RN, Atletiba ou
CRB × CSA. **Vasco não tinha nenhuma rivalidade**, sendo o clube com mais
torcidas no catálogo.

**Aplicado:** dataset curado `rivalidades-clubes.js` com **83 pares**
intraestaduais extraídos das listas de clássicos da Wikipédia (Brasil, São
Paulo, Minas) e dos artigos de cada clássico; `seed:rivalidades-clubes` gravou
**66 pares** (54 novos), com `escopo` derivado da cidade do clube no banco.

Duas decisões de critério, ambas medidas:

- **Clássico interestadual não isola.** O par Flamengo × São Paulo do lote de
  teste foi reclassificado como `INTERESTADUAL` e deixou de isolar;
  `ESCOPOS_RIVALIDADE_ISOLANTE` (`@torcida/types`) é o único lugar para mudar
  isso. Filtro aplicado em `hierarquia.ts` e `perfil-visibilidade.ts`.
- **Nem todo clássico intraestadual isola.** A Wikipédia lista como "clássico
  regional" pares como Guarani × São Paulo, Ponte Preta × Corinthians e
  Figueirense × Criciúma — jogo tradicional, não conflito entre torcidas. O
  dataset marca `isola`, com o critério **mesma cidade ou clássico nomeado**:
  62 dos 83 isolam; os outros 21 ficam como contexto (rotular jogo, moderação).

Os 112 pares descartados na geração eram de clubes que não existiam no catálogo
— o §1 limitava diretamente a cobertura do isolamento, e por isso o seed de
clubes veio antes.

## 5. Homônimos: nome + UF não é chave

O cruzamento com o RNC expôs seis colisões (Bahia × Bahia de Feira, Democrata GV
× Democrata SL, Portuguesa × Portuguesa Santista, Rio Branco-ES × Rio Branco VN,
Vitória-ES × Porto Vitória, Anápolis FC × Grêmio Anápolis) e duas linhas
duplicadas do mesmo clube.

**Aplicado:**

- `indexarClubes` devolve as colisões em vez de escondê-las; o seed **pula e
  reporta** em vez de sobrescrever o clube errado;
- fusão curada de `Cia Norte` → `Cianorte` (o nome quebrado veio do scrape: a
  torcida "Ira do Leão" é do Cianorte Futebol Clube) e de `Gama` →
  `Sociedade Esportiva Gama`. A fusão move `Tenant`, `TorcidaConhecida`,
  `PerfilTorcedor`, `Partida` e `Noticia`, e **aborta se sobrar vínculo** —
  `Partida`/`Noticia` são Cascade e sumiriam em silêncio;
- ids externos (`wikidataQid`, `ogolId`) gravados para desempatar daqui em
  diante.

Sobra **1 caso para decisão humana**: `Rio Branco VN/ES` (147º no RNC) é
parecido demais com `Rio Branco Atlético Clube` para criar automaticamente.

## 6. Torcidas: metade das paulistas não constava do registro da federação

A FPF publica a *Relação de Torcidas Cadastradas* — 135 torcidas com nome, clube
e cidade (referência 21/02/2024). Contra as 112 de SP do catálogo: 73 casadas
(incluindo variações de grafia como `PAVILHÃO NOVE` ↔ `Torcida Pavilhão 9` e o
typo `Gladiaores` do próprio documento oficial), 56 cadastradas ausentes e 39
sem registro na lista.

**Aplicado:** `seed:torcidas-registro -- --importar-ausentes` normalizou **519
anos de fundação** (a fonte grava `"**/**/2006"`, `"23/10/1992"`), marcou **129
torcidas como `REGISTRADA_FEDERACAO`** e importou as **56 ausentes** com
`registroFonte` e `registroEm`. Quatro candidatas ficaram de fora por
similaridade com registro existente — decisão humana, não importação cega.

Fora de SP a situação continua `DESCONHECIDO`: não há lista publicada
equivalente em outras federações (backlog de coleta).

## O que sobra

| # | Item | Onde |
|---|---|---|
| P1 | `Rio Branco VN/ES`: confirmar se é clube distinto de `Rio Branco Atlético Clube` e criar | `clubes-correcoes-curadas.json` |
| P1 | 11 torcidas da FPF sem clube no catálogo (Grêmio Barueri, Capivariano, EC Primavera, Red Bull-SP…) | `seed:torcidas-registro` |
| P2 | Cores derivadas do escudo (`coresFonte: escudo:cloudinary`) precisam de revisão visual — a ordem vem da área na imagem, não da identidade | `/super-admin/clubes/[id]` |
| P2 | 68 clubes ainda sem escudo; 123 sem `apiExternalId` | pipelines já existentes |
| P2 | Registros de outras federações (FERJ, FMF, FGF…) | pesquisa |
| P3 | Validar CNPJ da torcida via BrasilAPI/minhaReceita no onboarding | backlog de produto |
| P3 | 4 torcidas "parecidas" da FPF: confirmar se são a mesma do catálogo | `seed:torcidas-registro` |

## Como aplicar em HML/prod

O schema mudou (campos novos em `Afiliacao`, `TorcidaConhecida` e
`RivalidadeClube`; enums `SituacaoRegistroTorcida`, `EscopoRivalidade` e o valor
`PESQUISA`). Sequência:

```bash
# 1. schema (workflow "Schema deploy" cobre HML e prod — ver docs/ops/schema-deploy.md)
pnpm --filter @torcida/db schema:deploy

# 2. catálogo, na ordem (cada um é idempotente e aceita --dry-run)
TORCIDA_ENV=<alvo> pnpm --filter @torcida/db seed:clubes-rnc
TORCIDA_ENV=<alvo> pnpm --filter @torcida/db db:repair-series-afiliacoes
TORCIDA_ENV=<alvo> pnpm --filter @torcida/db seed:ficha-clubes -- --corrigir-cidades
TORCIDA_ENV=<alvo> pnpm --filter @torcida/db repair:clubes-curados
TORCIDA_ENV=<alvo> pnpm --filter @torcida/db seed:rivalidades-clubes
TORCIDA_ENV=<alvo> pnpm --filter @torcida/db seed:torcidas-registro -- --importar-ausentes
TORCIDA_ENV=<alvo> pnpm --filter @torcida/db seed:torcedores-estimados

# 3. conferir
TORCIDA_ENV=<alvo> pnpm --filter @torcida/db audit:catalogo-clubes
```

A coleta de cores (`coleta:cores-escudos`) é opcional e só precisa rodar de novo
quando entrarem escudos novos — o resultado fica versionado em
`cores-escudos.json` e é o seed que grava no banco.
