# Integração de provedor de jogos — API-Football (decisão #7)

> **Medido em 2026-08-12** contra a API real, com chave free do
> `dashboard.api-football.com`. Números aqui não são de blog nem de memória:
> vieram de requisição. Sonda: `scripts/api-football/probe.mjs` (`pnpm apif:probe`).
>
> Contexto: `docs/knowledge/futebol-dados-publicos.md` (por que não existe
> "API grátis do Google Sports") · `docs/data/modulo-eventos.md` (Agenda e
> `Partida`) · `ARCHITECTURE.md` §5.11 e §5.26.

## Veredito

**Provedor escolhido: API-Football (api-football.com / api-sports.io), plano pago.**
O tier gratuito **não** serve para popular `Partida` — trava de temporada, não de
volume. O concorrente `football-data.org` cobre no free só 1 das 6 competições que
importam para uma torcida brasileira, e o plano equivalente custa ~10× mais.

## O que o plano free da API-Football libera (medido)

| Recurso | Free | Evidência |
|---|---|---|
| Temporadas | **apenas 2022–2024** | `{"plan":"Free plans do not have access to this season, try from 2022 to 2024."}` |
| Parâmetro `next` | bloqueado | `{"plan":"Free plans do not have access to the Next parameter."}` |
| Parâmetro `last` | bloqueado | idem |
| `fixtures?live=all` | vazio na prática | `results: 0`, sem erro — dado ao vivo é temporada corrente |
| `/leagues`, `/teams` | **liberados** | 109 ligas BR; `teams?search=corinthians` → `id=131` |
| `/status` | **não consome cota** | documentado e confirmado |
| Imagens (escudos, logos) | **grátis, fora da cota** | `media.api-sports.io/football/teams/{id}.png` |
| Cota | 100/dia · 10/min | headers `x-ratelimit-*` |

Ou seja: dá para montar o **catálogo** (ids + escudos) e semear histórico
2022–2024 no free. Calendário do ano corrente e placar, não.

## Por que o custo do plano pago é irrelevante para nós

Uma requisição por **competição** traz a rodada inteira — não é 1 por clube:

```
/fixtures?league=71&season=2024&from=…&to=… → todos os jogos da janela
```

Somando Séries A/B/C/D + Copa do Brasil + Libertadores/Sul-Americana + os 27
estaduais, o Brasil inteiro custa **~35–50 requisições/dia**. Isso caberia até
nos 100/dia do free. O plano pago mais barato (~US$19/mês, 7.500/dia — **conferir
em Dashboard → Subscription**, o site bloqueia leitura automatizada) dá ~150× a
folga necessária.

**Regra:** sincronizar por competição + janela de datas. Nunca iterar clube a
clube — multiplica a cota por 20 sem ganho nenhum.

## Comparação com football-data.org (medida em 2026-08-12)

Catálogo público deles (`GET /v4/competitions`, sem token, 189 competições):

| Competição | id/code | Tier | Plano necessário |
|---|---|---|---|
| Campeonato Brasileiro Série A | 2013 `BSA` | TIER_ONE | **free** |
| Série B | 2029 `BSB` | TIER_THREE | Standard €49/mês |
| Copa do Brasil | 2037 `CDB` | TIER_FOUR | Pro €199/mês |
| Copa Libertadores | 2152 `CLI` | TIER_FOUR | Pro €199/mês |
| Copa Sudamericana | 2081 `CS` | TIER_FOUR | Pro €199/mês |
| Paulistão / Carioca / estaduais | — | — | **não existem no catálogo** |

Free do football-data: €0, `X-Auth-Token`, **10 req/min sem teto diário**,
temporada corrente, mas **placar e cronograma atrasados** (ao vivo = €12/mês).
Sem token, só `/v4/competitions` responde; o resto dá 403.

**Conclusão:** cobre Série A do ano corrente de graça — e só isso. O primeiro
trimestre da agenda de uma torcida paulista é Paulistão, que eles não têm em
plano nenhum. Cobertura equivalente à API-Football sairia €199/mês contra US$19.

### Por que NÃO integrar as duas fontes

O `@@unique([afiliacaoId, fonteExternalId])` **não** protege contra duplicata
entre provedores: o mesmo Corinthians×Palmeiras chega com id `1180400` numa
fonte e outro id na outra, passa nos dois unique e vira dois registros. Integrar
duas fontes exigiria campo `fonte` + deduplicação por chave natural
(`afiliacaoId` + data + adversário) — trabalho real para comprar 1 competição
de 6. Se um dia for necessário, é isso que precisa existir antes.

## Contrato de provedor (para a fonte ser trocável)

Fonte de jogos é **dependência externa opcional** (convenção do `CLAUDE.md`):
gate por `isProvedorPartidasConfigured()`, degradando para cadastro manual /
partida rápida — nunca quebrar a Agenda porque a API caiu ou a cota estourou.

```
apps/web/src/lib/partidas-sync/
  contrato.ts      puro — tipos, status, mando, janela, adoção de partida manual
  api-football.ts  adapter (fonte única hoje)
  sync.ts          job que casa fixture ↔ Afiliacao e persiste
```

O contrato devolve a forma normalizada que `Partida` consome; quem chama não
sabe qual provedor respondeu. Um segundo adapter (ex.: `football-data.ts`)
implementaria a mesma interface — mas ver § "Por que NÃO integrar as duas
fontes" antes: sem campo `fonte` + dedup por chave natural, duplica `Partida`.

## Mapeamento para o nosso modelo

Payload real (`/fixtures?team=131&season=2024&league=71&timezone=America/Sao_Paulo`):

| Campo nosso | Origem |
|---|---|
| `Afiliacao.apiExternalId` | `team.id` (ex.: Corinthians = **131**) |
| `Partida.fonteExternalId` | `fixture.id` — chave de idempotência do upsert |
| `Partida.dataHora` | `fixture.date` (pedir `timezone=America/Sao_Paulo`; padrão é UTC) |
| `Partida.local` | `fixture.venue.name` / `.city` |
| `Partida.competicao` | `league.name` (+ `league.round`) |
| `Partida.placarCasa` / `placarFora` | `goals.home` / `goals.away` |
| `Partida.mando` | derivado: `teams.home.id == apiExternalId` → `CASA` (a API não tem esse conceito) |

Mapa de `fixture.status.short` → `StatusPartida`:

| API | Nosso |
|---|---|
| `TBD`, `NS`, `PST` | `AGENDADA` (`PST` = adiado → regravar data) |
| `1H`, `HT`, `2H`, `ET`, `P`, `LIVE`, `SUSP`, `INT` | `AO_VIVO` |
| `FT`, `AET`, `PEN`, `AWD`, `WO` | `ENCERRADA` |
| `CANC`, `ABD` | `CANCELADA` |

### Ids de competições brasileiras (medidos)

| id | Competição | id | Competição |
|---|---|---|---|
| 71 | Serie A | 76 | Serie D |
| 72 | Serie B | 73 | Copa do Brasil |
| 75 | Serie C | 475 | Paulista A1 |

Lista completa por país: `GET /leagues?country=Brazil` (109 resultados) — a
sonda imprime id, temporadas, `current` e a **cobertura** (`standings`,
`fixtures.events`) de cada uma. Conferir cobertura **antes** de sincronizar.

## Escudos e imagens (frente independente do plano)

`media.api-sports.io/football/teams/{id}.png`, `/football/leagues/{id}.png`,
`/flags/{code}.svg` — **não contam cota**, cobrem o catálogo nacional inteiro e
a própria doc recomenda rebater em CDN próprio (já fazemos: Cloudinary,
`migrate-escudos-cloudinary.js`).

Duas ressalvas:

- **Matching não pode ser automático.** `teams?search=corinthians` devolve 10
  resultados incluindo `Corinthians W` (feminino), `U20`, `U23` e homônimos de
  Malta, Gales e EUA. Filtrar por `country=Brazil` **e** revisar à mão.
- **Direito de imagem.** A doc deles é explícita: não detêm os direitos dos
  escudos, o uso é "identificação descritiva" e a responsabilidade legal é de
  quem publica. Não é risco novo (já exibimos escudos), mas fica registrado.

## Restrições técnicas que quebram integração ingênua

- **Só `GET`, e só o header `x-apisports-key`.** A doc avisa que frameworks
  JS/Node que injetam headers extras recebem erro.
- **Firewall.** Pico anormal pode gerar bloqueio temporário **ou permanente, sem
  aviso**. Throttle explícito (10/min no free), nunca `Promise.all` sobre a lista
  de clubes.
- **`season` é o ano de 4 dígitos** (2018-19 → `2018`). Brasileirão é
  ano-calendário: `season` = ano corrente.
- **Nunca chamar em runtime de RSC/Server Action.** Sync é job offline que grava
  `Partida`; a página lê só o nosso banco.
- **Widgets da API-Sports: não usar.** Funcionam no free, mas expõem a API-KEY no
  HTML (`data-key`) e gastam requisição **por visita** — a própria doc exemplifica
  115.200 req/dia com 80 visitas/min. Display na Comunidade continua com os
  widgets Sofascore (`docs/data/modulo-sofascore-widgets.md`).

## Fase A — catálogo (implementada, 2026-08-12)

Independe da assinatura: usa só endpoints liberados no free.

```bash
pnpm --filter @torcida/db coleta:api-football-times  # 1 requisição
pnpm --filter @torcida/db seed:api-football-ids            # simula (padrão)
pnpm --filter @torcida/db seed:api-football-ids -- --apply --escudos
pnpm --filter @torcida/db test:api-football-match          # 9 invariantes
```

`GET /teams?country=Brazil` devolve **1577 times numa página só**
(`paging.total: 1`) — o catálogo inteiro custa **1 requisição**. Vira snapshot
versionado (`src/data/api-football-times-br.json`) e o casamento roda offline:
reprocessar não gasta cota.

**Resultado medido sobre 318 afiliações ativas** (banco local):

| | Antes das correções | Depois |
|---|---|---|
| Confiança alta | 155 | **195** |
| Revisão humana | 28 | **17** (inclui 2 de colisão) |
| Sem match | 135 | **106** |

Dois ajustes explicam o ganho, e ambos são regra de negócio, não tuning:

1. **Localização estrita no desempate.** `cidadesCompativeis` devolve `true`
   quando um lado é vazio — correto para "não contradiz", errado para eleger
   vencedor. Sem isso, `Flamengo SE` (cidade nula na API) empatava com o
   Flamengo do Rio. Agora candidato sem cidade nunca vence desempate, e a **UF**
   (extraída de `"Rio de Janeiro, Rio de Janeiro"`) decide antes da cidade.
2. **Cidade não veta candidato único.** Nosso catálogo tem bairro e erro de
   digitação no campo (`"Centro"`, `"1000"`, `"Corumbrá"`, `"Portão B13"`) —
   vetar por cidade mandava clube certo para a fila manual. Com nome único no
   Brasil, quem veta é a UF.

**Colisão de id externo (invariante de conjunto).** Um time da API é UM clube.
`Gama (DF)` e `Sociedade Esportiva Gama (DF)` — duas `Afiliacao` — casavam com o
mesmo id `1222`, porque são duplicata do nosso catálogo. Gravar os dois faria o
sync criar a **mesma partida duas vezes**, sem que
`@@unique([afiliacaoId, fonteExternalId])` percebesse: o `afiliacaoId` difere.
`detectarColisoesIdExterno` bloqueia **os dois lados** e manda para o relatório —
quem resolve é o merge do catálogo (`merge-torcidas-duplicadas.js`), não o seed.

Rede de segurança: casamento de confiança alta precisa compartilhar uma palavra
significativa com o nome da API, salvo quando veio de `ALIASES` (curadoria
humana — "Centro Sportivo Alagoano" → "CSA" não compartilha token e está
certo). Na auditoria dos 197, **nenhum** foi reprovado por essa regra.

Os 106 sem match são, na maioria, clubes pequenos com nome formal no nosso
catálogo e nome curto na API ("Associação Atlética Internacional de Limeira" ×
"Inter de Limeira"). O caminho é ampliar `ALIASES` em `afiliacoes-normalize.js`
— curadoria incremental, não código novo. Ambíguos e não casados ficam em
`src/data/api-football-report.json`.

## Fase B — sync de `Partida` (implementada, 2026-08-12)

Construída e validada contra a **temporada 2024** (liberada no free). O código é
idêntico para a temporada corrente: muda `API_FOOTBALL_SEASON`.

```
apps/web/src/lib/partidas-sync/
  contrato.ts      puro — status, mando, janela, adoção de partida manual
  api-football.ts  adapter (único provedor)
  sync.ts          job: casa fixture ↔ Afiliacao e persiste
apps/web/src/app/api/cron/partidas-sync/route.ts   cron (Bearer CRON_SECRET)
```

O diretório é `partidas-sync/` e não `partidas/` porque `lib/partidas.ts` já
existe (leitura da Agenda) e disputaria o especificador `@/lib/partidas`.

- **Schema:** `@@unique([afiliacaoId, fonteExternalId])` aplicado. No Postgres
  `NULL` não colide, então partida manual (sem `fonteExternalId`) segue livre.
- **Gate:** `isProvedorPartidasConfigured()` em `lib/env.ts`. Sem
  `API_FOOTBALL_KEY` o cron responde `configurado: false` **sem erro** — a
  Agenda continua no cadastro manual.
- **Custo:** 1 requisição por competição (`COMPETICOES_BR`, 6 hoje), em série —
  nunca `Promise.all`, por causa do bloqueio de firewall por pico.
- **Pacing obrigatório:** 6,5s entre chamadas + retry com recuo no HTTP 429.
  Sem isso, 6 competições em rajada estouram os 10/min do free — medido: a
  primeira versão do adapter tomou `429 Too many requests` na auditoria.
- **Recorte por competição:** `sincronizarPartidas({ competicoes: [71] })` para
  auditar/depurar sem gastar a cota inteira.
- **Erro do provedor falha alto.** `errors` preenchido com HTTP 200 (o caso de
  restrição de plano) vira exceção; o cron devolve 502 em vez de fingir sucesso.
- **Sem `AuditLog`:** não há ator humano, e forjar um poluiria a trilha
  administrativa.

### Adoção de partida manual (o que evita duplicata)

Um clássico entre dois clubes nossos vira **duas** `Partida` — uma por
`Afiliacao`, com mando espelhado. E antes de inserir, o sync procura partida
cadastrada à mão do mesmo jogo (±3h, adversário normalizado) e **adota**,
preenchendo o `fonteExternalId`. Sem isso, todo tenant que já usa a Agenda veria
o jogo duplicado no primeiro sync: o registro manual não tem `fonteExternalId` e
o unique não o alcança.

### Verificação

- `pnpm --filter @torcida/web test -- --run partidas-sync` — 14 testes do núcleo
  puro (mapa de status, mando, adoção, janela).
- `API_FOOTBALL_KEY=xxx pnpm --filter @torcida/web test -- --run partidas-sync-adapter`
  — 3 testes contra a **API real** (Série A 2024): fixtures normalizados, mando
  do Corinthians, e a temporada corrente estourando o erro de plano. Pulados
  automaticamente sem a chave, para não depender de rede nem gastar cota em CI.

## Como testar localmente

Referência da API (contrato, cota, pegadinhas): `docs/knowledge/api-football-referencia.md`.

**Pré-requisitos:** Postgres local (`docs/ops/postgres-local-dev.md`) e a chave em
`apps/web/.env.local` (**fonte única** — não passe prefixo na linha de comando):

```
API_FOOTBALL_KEY=...
API_FOOTBALL_SEASON=2024
```

Quem lê daí: o dev server (nativo do Next), os scripts do `@torcida/db`
(`loadEnvFiles`) e os comandos vitest de seed/auditoria
(`src/test/env-api-football.ts`). A suíte unitária **não** carrega a chave de
propósito — senão todo `pnpm test` bateria na API real e queimaria cota; o teste
de adapter continua exigindo o prefixo explícito.

Nada aqui exige assinatura — tudo roda na temporada 2024.

Lembre que **o banco local é snapshot, não réplica**: o que você sincronizar
aqui não aparece em HML/prod, e vice-versa.

### 1. O que a chave libera (5 requisições)

```bash
API_FOOTBALL_KEY=xxx pnpm apif:probe   # a sonda tem leitor proprio de .env
```

Imprime plano, cota, ligas BR com cobertura, e prova a trava de temporada.

### 2. Catálogo — ids dos clubes (1 requisição)

```bash
API_FOOTBALL_KEY=xxx pnpm --filter @torcida/db coleta:api-football-times
TORCIDA_ENV=local pnpm --filter @torcida/db seed:api-football-ids            # simula
TORCIDA_ENV=local pnpm --filter @torcida/db seed:api-football-ids -- --apply # grava
```

Sem `--apply` nada é escrito. Ambíguos e não casados ficam em
`packages/db/src/data/api-football-report.json`.

### 3. Testes puros (sem rede, sem banco)

```bash
pnpm --filter @torcida/db test:api-football-match      # 11 invariantes do casamento
pnpm --filter @torcida/web test -- --run partidas-sync # 14 do núcleo do sync
```

### 4. Adapter contra a API real (2 requisições)

```bash
API_FOOTBALL_KEY=xxx pnpm --filter @torcida/web test -- --run partidas-sync-adapter
```

Sem a chave, pula sozinho — CI não depende de rede nem gasta cota.

### 5. Ponta a ponta: sync gravando no banco (1 requisição por execução)

```bash
TORCIDA_ENV=local pnpm --filter @torcida/web audit:partidas-sync
```

Sincroniza uma semana da Série A/2024, confere que `Partida` foi criada com
`fonteExternalId`, mando e adversário corretos, valida **idempotência** (segunda
execução não cria linha) e **reverte** tudo no final — padrão de `audit:fluxos`.

### 6. A rota de cron (opcional — exige reiniciar o dev server)

Só se quiser exercitar o HTTP. Em `apps/web/.env.local`:

```
API_FOOTBALL_KEY=xxx
API_FOOTBALL_SEASON=2024
```

Reinicie o dev server (o Next lê `.env` no boot) e chame:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/partidas-sync
```

Sem `CRON_SECRET` no ambiente a rota não exige auth; com ele, header errado dá
401. Sem `API_FOOTBALL_KEY`, responde `configurado: false` — **sem erro**, que é
o comportamento correto da dependência opcional.

**Cuidado:** essa chamada usa `COMPETICOES_BR` inteiro (6 requisições, ~40s pelo
pacing) e **grava de verdade** no banco apontado pelo `.env.local`, sem reverter.

## Pendências

1. ~~`@@unique([afiliacaoId, fonteExternalId])`~~ — aplicado (B1).
2. `Afiliacao.apiExternalId`: **195 aplicados no banco local**. HML e prod ainda
   não — sem isso o sync não liga fixture a clube nesses ambientes.
3. Assinar o plano pago, confirmar a cota em Dashboard → Subscription e trocar
   `API_FOOTBALL_SEASON` para a temporada corrente (ou remover a variável, que
   cai no ano atual).
4. Agendar `/api/cron/partidas-sync` no Railway (1×/dia) com `CRON_SECRET`.
5. **Resetar a API-KEY** exposta em conversa (ver § Segurança da chave).
6. Fase B4 (placar ao vivo via `live=all`) — depois de B3 estável em produção.
7. Ampliar `ALIASES` para reduzir os 106 sem match.

## Segurança da chave

A API-KEY do free foi exposta em conversa em 2026-08-12 e **precisa de reset**
(Dashboard → Subscription). Em produção: variável de ambiente, allowlist de
domínio/IP no dashboard, e nunca no bundle client.

Agentes: `performance` (custo de cota e cache), `data-model` (unique/índices),
`implementation` (adapters e job), `qa-verification` (mapa de status).
