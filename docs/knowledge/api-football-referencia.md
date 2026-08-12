# API-Football (api-sports.io) — referência operacional

> Conhecimento acumulado sobre o provedor: contrato, cota, pegadinhas e limites
> **medidos** contra a API real em **2026-08-12** (versão da doc deles: 3.9.3).
> Decisão de adoção, custo e implementação: `docs/data/integracao-api-football.md`.
> Panorama de fontes de dados de futebol: `docs/knowledge/futebol-dados-publicos.md`.
>
> **Nota de método:** `api-football.com` e `api-sports.io` respondem **403 a
> acesso automatizado** (Cloudflare) — WebFetch e curl com UA de navegador
> falham. A documentação foi lida manualmente e colada por um humano; o que está
> marcado como **medido** veio de requisição real com chave própria.

## 1. Identidade e planos

| | |
|---|---|
| Base (direto) | `https://v3.football.api-sports.io` |
| Base (via RapidAPI) | `https://api-football-v1.p.rapidapi.com/v3` |
| Auth (direto) | header `x-apisports-key` |
| Auth (RapidAPI) | `x-rapidapi-key` + `x-rapidapi-host` |
| Dashboard | `dashboard.api-football.com` (consumo, plano, tester de endpoints) |

Assinar direto no site e assinar pela RapidAPI são caminhos distintos, com
headers distintos. Nosso adapter usa o **direto**.

## 2. Contrato de requisição

- **Só `GET`.**
- **Só o header `x-apisports-key` é aceito.** A doc avisa explicitamente:
  frameworks JS/Node que injetam headers automaticamente recebem erro — é
  preciso removê-los. Na prática, `fetch` nativo do Node funciona.
- Resposta sempre no envelope:

```json
{ "get": "...", "parameters": {}, "errors": [], "results": 0, "paging": {}, "response": [] }
```

- **`errors` pode vir preenchido com HTTP 200.** Tratar `res.ok` como sucesso é
  o erro clássico de integração aqui. Checar sempre `errors`, que ora é array
  vazio, ora objeto (`{"plan": "..."}`).

### Headers de resposta

| Header | Significado |
|---|---|
| `x-ratelimit-requests-limit` | cota diária do plano |
| `x-ratelimit-requests-remaining` | requisições restantes hoje |
| `X-RateLimit-Limit` | teto por **minuto** |
| `X-RateLimit-Remaining` | restantes no minuto |

### Política de rate limit (importante)

A doc deles é explícita: exceder a taxa por minuto, por uso contínuo excessivo
**ou por picos anormais de tráfego**, pode gerar bloqueio **temporário ou
permanente** pelo firewall, **sem aviso prévio**. Por isso o adapter percorre
competições em série — `Promise.all` sobre uma lista de ligas é exatamente o
padrão de pico que eles descrevem.

## 3. Cota

- Free: **100 requisições/dia**, **10/minuto**. Reset diário 00:00 UTC; sobra
  não acumula.
- **`/status` não consome cota** — use à vontade para health-check e para ler o
  plano/consumo por API em vez de abrir o dashboard.
- **Imagens não consomem cota** (ver §7).

## 4. Limites do plano free — **medidos**

Com chave free real, em 2026 (Y = 2026):

| Recurso | Resultado |
|---|---|
| Temporadas | **só 2022–2024** (regra `Y-4` a `Y-2`) |
| `/fixtures?...&season=2026` | `{"plan":"Free plans do not have access to this season, try from 2022 to 2024."}` |
| `/fixtures?...&next=5` | `{"plan":"Free plans do not have access to the Next parameter."}` |
| `/fixtures?...&last=3` | `{"plan":"Free plans do not have access to the Last parameter."}` |
| `/fixtures?live=all` | `results: 0`, `errors: []` — sintaxe aceita, dado vazio (é temporada corrente) |
| `/leagues?country=Brazil` | **liberado** — 109 ligas |
| `/teams?country=Brazil` | **liberado** — 1577 times, `paging.total: 1` |
| `/teams?search=` | liberado |
| `/standings?season=2026` | mesma trava de temporada |

**Consequência de produto:** o free serve para catálogo (ids, escudos) e para
histórico 2022–2024. Não serve para calendário do ano corrente nem placar.

## 5. Endpoints

Frequência de atualização e "chamadas recomendadas" são **da doc deles** — úteis
para dimensionar cron sem chutar.

| Endpoint | Para que serve aqui | Atualização | Recomendado |
|---|---|---|---|
| `/status` | plano, consumo | — | à vontade (grátis) |
| `/timezone` | lista de fusos válidos | nunca | 1 quando precisar |
| `/countries` | filtro de país | raro | 1/dia |
| `/leagues` | ids de competição, temporadas, **coverage** | várias/dia | 1/hora |
| `/leagues/seasons` | anos disponíveis | raro | 1/dia |
| `/teams` | id externo do clube → `Afiliacao.apiExternalId` | várias/semana | 1/dia |
| `/teams/statistics` | forma, gols, aproveitamento | 2×/dia | 1/dia (com jogo) |
| `/teams/seasons`, `/teams/countries` | apoio | várias/semana | 1/dia |
| `/venues` | estádios | várias/semana | 1/dia |
| `/standings` | classificação | 1/hora | 1/hora com jogo, senão 1/dia |
| `/fixtures` | **calendário e placar → `Partida`** | — | por competição + janela |
| `/fixtures/rounds` | rodadas (com `dates=true`, datas de todas numa call) | 1/dia | 1/dia |
| `/fixtures/headtohead` | histórico entre dois clubes | — | sob demanda |
| `/fixtures/statistics` (`half`), `/events`, `/lineups`, `/players` | detalhe de jogo | — | sob demanda |
| `/injuries`, `/predictions`, `/odds*`, `/transfers`, `/trophies`, `/sidelined`, `/coachs`, `/players*` | fora do nosso escopo hoje | — | — |

### Parâmetros de `/fixtures` que importam

`id`, `ids` (vários fixtures numa call), `league`, `season`, `team`, `live`,
`date`, `from`/`to`, `round`, `status` (aceita vários), `venue`, `timezone`.

**`timezone=America/Sao_Paulo` funciona** e devolve `2024-05-04T21:00:00-03:00`.
Sem ele, tudo vem UTC.

## 6. Semântica dos dados (as pegadinhas)

- **`season` é sempre o ano de 4 dígitos.** Temporada europeia 2018-19 → `2018`.
  Brasileirão é ano-calendário, então `season` = ano corrente. Simples aqui,
  traiçoeiro se um dia sincronizarmos liga europeia.
- **`coverage` varia por competição E por temporada.** `/leagues` devolve o que
  existe **naquele momento**: competição que ainda não começou vem com tudo
  `false`. `true` também não garante 100% de preenchimento. Conferir antes de
  sincronizar (a sonda imprime `standings` e `fixtures.events`).
- **Amistosos são exceção** à coverage declarada — livescore, eventos, escalação
  e estatística podem variar jogo a jogo.
- **Copa só ganha fixture quando os dois times são conhecidos.** Nas quartas, a
  semi só aparece depois de definidos os classificados — o calendário de mata-
  mata é incompleto por natureza, não é bug do sync.
- **Competições são renovadas automaticamente** quando a nova temporada sai, mas
  pode haver atraso entre o anúncio do calendário oficial e o dado na API.
- **`/teams` exige ao menos um parâmetro.** `country=Brazil` devolve tudo numa
  página (`paging.total: 1`) — não precisa paginar.
- **`venue.city` vem como `"Cidade, Estado"`** (ex.: `"Rio de Janeiro, Rio de
  Janeiro"`). O estado é o melhor sinal para desempatar clubes homônimos.
- **Dado sujo existe.** `Ypiranga-PE` aparece com cidade `Macapá, Amapá`. Não
  confiar em campo único para casamento.

### Ruído no catálogo de times

`/teams?search=corinthians` devolve 10 resultados: o profissional, o **feminino**
(`Corinthians W`), as **bases** (`U20`, `U23`) e **homônimos** de Malta, Gales e
EUA. Há ainda seleções (`national: true`) e times reservas (`Santos B`,
`CRB II`). Casar por nome sem filtro grava o id errado. Regra implementada em
`packages/db/src/data/api-football-match.js`.

### Status de partida (`fixture.status.short`)

| Código | Significado | Nosso `StatusPartida` |
|---|---|---|
| `TBD` | data/hora a definir | `AGENDADA` |
| `NS` | não começou | `AGENDADA` |
| `PST` | adiado | `AGENDADA` (provedor regrava a data) |
| `1H` `HT` `2H` `ET` `P` `LIVE` | em andamento / intervalo / prorrogação / pênaltis | `AO_VIVO` |
| `SUSP` `INT` | suspenso / interrompido | `AO_VIVO` (não terminou) |
| `FT` `AET` `PEN` | encerrado (normal / prorrogação / pênaltis) | `ENCERRADA` |
| `AWD` `WO` | vitória por decisão / W.O. | `ENCERRADA` |
| `CANC` `ABD` | cancelado / abandonado | `CANCELADA` |

Código desconhecido cai em `AGENDADA` de propósito: eles adicionam códigos sem
avisar, e sumir com o jogo da Agenda é pior que exibi-lo como agendado.

## 7. Imagens (fora da cota)

```
https://media.api-sports.io/football/teams/{team_id}.png
https://media.api-sports.io/football/leagues/{league_id}.png
https://media.api-sports.io/football/venues/{venue_id}.png
https://media.api-sports.io/flags/{country_code}.svg
```

- **Não contam na cota diária** e são gratuitas, mas têm limite por segundo/
  minuto. A doc recomenda **rebater em CDN próprio** (eles sugerem BunnyCDN;
  aqui já usamos Cloudinary via `migrate-escudos-cloudinary.js`).
- **Aviso legal deles, textual:** não detêm os direitos desses ativos; logos e
  marcas podem pertencer a ligas, federações e clubes; o uso em produto pode
  exigir autorização adicional, e **a responsabilidade é de quem publica**. Não
  são afiliados nem endossados por nenhuma liga ou marca.
- **Pendência de verificação:** `media.api-sports.io` **não resolveu no DNS** da
  máquina de dev em 2026-08-12 (`Non-existent domain`), embora as URLs venham
  dentro das respostas da API. Confirmar no navegador antes de depender do CDN.

## 8. Widgets — existem, e não usamos

Eles oferecem widgets web-component (`<api-sports-widget>`) para jogos, jogo,
time, jogador, classificação, liga, h2h, além de F1 e MMA. Funcionam em **todos
os planos, inclusive free**, com temas (white/grey/dark/blue ou CSS custom),
idioma (`data-lang`, com arquivo de tradução próprio) e `data-target-*` para
abrir em modal ou container.

**Por que ficam fora do Torcida SaaS:**

1. A `data-key` fica **visível no HTML** do cliente. Mitigável só por allowlist
   de domínio/IP no dashboard (ou proxy próprio).
2. **Cada visita gasta requisição.** A doc deles exemplifica: 80 visitas/minuto
   = **115.200 requisições/dia** sem cache. Com 100/dia, morre no primeiro
   minuto de pico.

Display na Comunidade continua com os widgets **Sofascore**
(`docs/data/modulo-sofascore-widgets.md`), que não consomem cota nossa.

## 9. Changelog relevante (3.9.3)

Recursos recentes que podem encurtar trabalho futuro:

- `/fixtures`: parâmetro **`ids`** (vários fixtures — com eventos, escalações,
  estatísticas e jogadores — numa única chamada); campo `extra` (acréscimos);
  campo `standings` (se a competição tem classificação); `venue`; `status`
  múltiplo.
- `/fixtures/rounds`: `dates=true` devolve as datas de cada rodada.
- `/fixtures/statistics`: `half=true` para estatística do 1º tempo.
- `/injuries` e `/sidelined`/`/trophies`: parâmetros de lote (`ids`, `players`,
  `coachs`).
- Novos: `/players/profiles`, `/players/teams`, `/odds/live`, `/teams/countries`.

## 10. Ids brasileiros (medidos)

| id | Competição | id | Competição |
|---|---|---|---|
| 71 | Série A | 76 | Série D |
| 72 | Série B | 73 | Copa do Brasil |
| 75 | Série C | 475 | Paulista A1 |
| 476 | Paulista A2 | 605 | Paulista A3 |
| 477 | Gaúcho 1 | 604 | Catarinense 1 |
| 606 | Paranaense 1 | 602 | Baiano 1 |
| 609 | Cearense 1 | 603 | Paraibano |
| 74 | Brasileiro Feminino | 520–625 | demais estaduais |

Times: Corinthians **131**, Palmeiras **121**, São Paulo **126**, Santos **128**,
Flamengo **127**, Vasco **133**, Botafogo **120**, Grêmio **130**,
Atlético-MG **117**, Fortaleza **154**. Catálogo completo em
`packages/db/src/data/api-football-times-br.json` (snapshot versionado).

Lista viva: `GET /leagues?country=Brazil` — a sonda `pnpm apif:probe` imprime id,
faixa de temporadas, temporada corrente e coverage.

## 11. Alternativa avaliada: football-data.org

| | |
|---|---|
| Base | `https://api.football-data.org/v4` · header `X-Auth-Token` |
| Sem token | só `/competitions` e `/areas`; 100 req/24h |
| Free (€0) | 12 competições (TIER_ONE), **10 req/min sem teto diário**, temporada corrente, mas **placar e cronograma atrasados** |
| Livescore | €12/mês · Deep data €29 · Standard €49 (30 comps) · Pro €199 (100 comps) |

Cobertura brasileira medida (`GET /v4/competitions`, 189 competições):

| Competição | Tier | Plano |
|---|---|---|
| Brasileirão Série A (`BSA`, 2013) | TIER_ONE | **free** |
| Série B (`BSB`, 2029) | TIER_THREE | €49 |
| Copa do Brasil (`CDB`, 2037) | TIER_FOUR | €199 |
| Libertadores (`CLI`, 2152) / Sudamericana (`CS`, 2081) | TIER_FOUR | €199 |
| Paulistão, Carioca, estaduais | — | **não existem no catálogo** |

**Veredito:** cobre 1 das 6 competições que importam para uma torcida
brasileira, e cobertura equivalente à API-Football custaria €199/mês contra
US$19. Descartado como fonte — e **não** integrado em paralelo, porque duas
fontes duplicariam `Partida` (o mesmo jogo tem id diferente em cada uma, e o
unique por `fonteExternalId` não protege entre provedores).

## 12. Checklist de armadilhas

Antes de mexer no sync, reler:

1. `errors` com HTTP 200 → nunca confiar em `res.ok`.
2. Header extra → erro. Só `x-apisports-key`.
3. Pico de requisições → risco de bloqueio permanente. Serial, sempre.
4. `season` é ano de 4 dígitos; free trava fora de `Y-4..Y-2`.
5. Sincronizar **por competição**, nunca por clube (1 req cobre 20 clubes).
6. Nunca chamar em runtime de RSC/Server Action — job offline grava `Partida`.
7. Widget = chave exposta + cota por visita.
8. Nome de time exige filtro (feminino, base, reservas, homônimos).
9. Chave em variável de ambiente + allowlist de domínio/IP no dashboard.

## 13. Fontes

- Documentação oficial (lida manualmente — o site bloqueia fetch):
  [api-football.com/documentation-v3](https://www.api-football.com/documentation-v3)
- [Como funciona o ratelimit](https://www.api-football.com/news/post/how-ratelimit-works)
- [Pricing](https://www.api-football.com/pricing) · [Dashboard](https://dashboard.api-football.com)
- [football-data.org — policies](https://docs.football-data.org/general/v4/policies.html)
  e [pricing](https://www.football-data.org/pricing)
- Medições próprias: `scripts/api-football/probe.mjs`

Agentes: `performance` (cota, cache, cadência), `data-model` (schema/índices),
`implementation` (adapters e job), `qa-verification` (mapa de status),
`research-dominio` (novos fatos aqui).
