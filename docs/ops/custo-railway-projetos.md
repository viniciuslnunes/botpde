# Custo Railway — mapa por projeto e plano de consolidação

> Levantamento **2026-08-12** (fundador + análise em sessão). O gatilho foi a
> conta ter dobrado. Este doc registra **o que realmente custa**, qual corte
> compensa, e o que ficou como backlog (separar o Discord deste projeto).
>
> Complementa: [`plano-investimento-infra.md`](./plano-investimento-infra.md)
> (quando **gastar** mais), [`plano-ambientes-e-dominio.md`](./plano-ambientes-e-dominio.md)
> (papel de HML/prod), [`schema-deploy.md`](./schema-deploy.md) (por que HML existe).

## 1. Retrato medido (ciclo 29/jul → 29/ago, 14 dias corridos)

Plano **Hobby** ($5/mês, com $5 de uso incluso). Uso até 12/08: **$3,74**.
Projeção da Railway: **$9,67** (≈ R$52 a R$5,4/USD). Antes disso os docs
registravam ~R$30/mês — dobrou.

| Projeto | Uso 14d | % | Projeção 31d | É o Setorize? |
|---|---:|---:|---:|---|
| `setorize-torcidas` | $1,6500 | 44,1% | ~$3,65 | **sim** — web prod + web hom + Postgres prod |
| `dbo-bot-pde` | $0,8675 | 23,2% | ~$1,92 | **sim (parcial)** — é o Postgres **HML**, e também guarda o bot legado |
| `bot-fivem` | $0,6306 | 16,8% | ~$1,40 | não — bot Discord separado, **precisa continuar no ar** |
| `bot-pde` | $0,4097 | 10,9% | ~$0,91 | não — bot Discord legado, **candidato a eliminar** |
| `dbo-bot-fivem` | $0,1844 | 4,9% | ~$0,41 | não — banco do `bot-fivem`, **candidato a eliminar** |
| `worthy-reverence` | $0,0009 | 0,02% | — | apagado em 2026-08-12, irrelevante |
| **Total** | **$3,7431** | 100% | ~$8,29 linear | |

A projeção linear dá $8,29 e a Railway estima $9,67. A diferença (+$1,38) é
consistente com **produção ter subido em 10–11/08**: os últimos dias do ciclo
rodam dois ambientes, os primeiros rodavam um.

### O que isso quer dizer

1. **O que dobrou a conta foi produção, não homologação.** O ambiente prod
   (Postgres novo + segundo serviço web) nasceu 2 dias antes desta medição, e é
   exatamente o que não se corta.
2. **Um terço da fatura não é deste produto.** `bot-fivem` + `bot-pde` +
   `dbo-bot-fivem` = $1,2247 (32,7%), ou ~$2,71/mês projetados.
3. O uso ainda está **dentro dos $5 inclusos** ($3,74 de $5,00). O $9,67 é
   projeção, não cobrança realizada.

## 2. Decisão — o HML fica (2026-08-12)

**Proposta avaliada:** matar o Postgres de homologação e substituí-lo por dumps
periódicos restaurados no Docker de cada dev.

**Rejeitada.** Motivos, na ordem do peso:

1. **Preço errado pelo risco.** O HML custa ~$0,87/ciclo (~$1,92/mês, ≈R$10).
   Em troca dele vai embora o **único gate automatizado entre um
   `schema.prisma` quebrado e o banco de produção**: o
   [`schema-deploy.yml`](../../.github/workflows/schema-deploy.yml) roda
   `db:push` em HML primeiro e só segue para prod se HML passar. Pesa ainda mais
   hoje, porque o approve manual de produção está **desligado** (TEMP em
   [`schema-deploy.md`](./schema-deploy.md)) — HML é a barreira que sobrou.
2. **O dump viria de onde?** Sem HML, a única origem é produção — cópias do
   banco com contas reais no laptop de cada dev. É o oposto da regra 2 de
   [`plano-ambientes-e-dominio.md` §5](./plano-ambientes-e-dominio.md), e um
   problema de LGPD que não se resolve com R$10/mês.
3. **HML valida o que o Docker local não reproduz:** private networking,
   `ROOT_DOMAIN` com wildcard, sessão entre apex e `{slug}.homolog`, OAuth por
   apex, Cloudinary isolado, SSL do wildcard.
4. **A metade útil da proposta já existe.**
   [`scripts/db-local-sync.ps1`](../../scripts/db-local-sync.ps1) já faz
   `pg_dump` remoto → restore no container local, usando a imagem `postgres:18`
   como ferramenta. Não é trabalho novo; falta só apontar a origem para HML.

**Corolário de método:** para dev, a fonte preferencial de dados é **seed, não
dump**. O `packages/db` tem 26 seeds (`seed:catalogo-producao`,
`seed:corinthians-teste`, `seed:jornadas`, `seed:convites-teste`…) — base
determinística, sem dado pessoal, reproduzível em CI. O dump fica como atalho de
quem tem acesso a HML.

**Se um dia o custo do HML precisar ir a zero:** mover o Postgres HML para
**Neon Free** (0,5 GB, scale-to-zero; o banco tem 95 MB). O gate continua
funcionando — o workflow só precisa de uma `DATABASE_URL` pública. A decisão #4
de [`plano-ambientes-e-dominio.md`](./plano-ambientes-e-dominio.md) escolheu
2× Postgres na Railway por **simplicidade**, não por limitação técnica; se a
prioridade virar custo, é esse o trade a reabrir.

## 3. Ordem de corte (do maior retorno ao menor)

| # | Ação | Economia/mês | Esforço | Estado |
|---|---|---:|---|---|
| 1 | Web de **homolog** dormindo (scale-to-zero / sleep) — só acorda para validar | a medir, dentro dos $3,65 do projeto | baixo | ⬜ |
| 2 | Eliminar `bot-pde` + `dbo-bot-fivem` | ~$1,32 | **alto** — exige refatoração (§4) | ⬜ |
| 3 | Isolar o projeto Discord num Railway próprio | não economiza, **separa a conta** | médio | ⬜ |
| 4 | Postgres HML → Neon Free | ~$1,92 | médio | ⬜ só se 1–3 não bastarem |

O item 1 vem primeiro porque é o único com retorno imediato e risco nulo — mas
depende de uma medição que ainda **não foi feita**: como os $1,65 de
`setorize-torcidas` se dividem entre web prod, web hom e Postgres prod. Roteiro
e critérios de decisão no **§5**.

## 4. Backlog — tirar o Discord deste projeto

> **Não executado.** Intenção do fundador (2026-08-12): manter este repositório
> e este projeto Railway **só para o Setorize Torcidas**, mover os bots Discord
> para um projeto isolado, e eliminar os bancos deles guardando o estado **dentro
> do próprio Discord**. Exige refatoração antes.

### 4.1 O que já se sabe (medido)

- **`bot-fivem` continua vivo.** Não é candidato a desligamento; a mudança
  desejada é ele deixar de depender de `dbo-bot-fivem`.
- **`bot-pde` é o bot legado deste monorepo** (`apps/bot`, Discord.js 14, JS
  puro, `pg` cru — sem Prisma).
- **`dbo-bot-pde` é compartilhado, e isso é o detalhe que trava tudo.** Medido em
  2026-08-12: o banco tem **90 tabelas** — as **85 do Prisma** (schema do web,
  hoje o HML) **e** as **5 do bot legado**, em `snake_case` e fora do
  `schema.prisma`:

  | Tabela do bot legado | Uso |
  |---|---|
  | `membros` | cadastro do bot |
  | `produtos` | catálogo do bot |
  | `pedidos` | pedidos do bot |
  | `bot_config` | configuração por guild |
  | `aprovacoes_recrutamento` | fila de recrutamento |

  Consequência prática: **`dbo-bot-pde` não pode ser apagado** enquanto for o
  HML — mas as 5 tabelas do bot são um conjunto disjunto, extraível e
  descartável **sem tocar** no schema Prisma. Desligar o serviço `bot-pde` não
  remove o banco; são coisas separadas.

### 4.2 Perguntas a responder antes de planejar

Levantadas, **não** respondidas — são o ponto de partida da próxima sessão:

1. O `bot-pde` ainda é usado por alguém, ou o web já cobre tudo que ele fazia?
   (`membros`/`produtos`/`pedidos` do bot têm equivalente no SaaS: `SaasMembro`,
   módulo Loja.) Se estiver morto, desligar é só desligar.
2. "Guardar informação no Discord" cobre quais casos? Mensagem fixada, canal de
   log, embed editável e `nickname`/cargo servem para estado pequeno e legível;
   **não** servem para consulta relacional, histórico auditável ou volume.
   Definir por tabela qual vira o quê — `bot_config` é candidato natural,
   `pedidos` provavelmente não.
3. Limites do Discord como armazenamento: rate limit da API, tamanho de embed,
   perda de dado se um canal for apagado, e ausência de transação. Qual é o
   custo aceitável de perder esse estado?
4. Os dois bots vão para **um** projeto Railway novo ou dois? Repositório
   separado ou continuam no monorepo?
5. O que acontece com o histórico das 5 tabelas — exporta, migra ou descarta?

### 4.3 Ordem provável (esboço, a validar)

1. Confirmar se `bot-pde` está morto → se sim, desligar o serviço (economia
   imediata, refatoração zero).
2. Refatorar `bot-fivem` para não depender de `dbo-bot-fivem` → desligar esse
   banco.
3. Mover os bots para projeto/repo próprio.
4. Dropar as 5 tabelas legadas de `dbo-bot-pde` (o banco segue como HML).

Passo 1 e 2 são independentes e já dão os ~$1,32/mês. O 3 e o 4 são higiene de
arquitetura, não economia.

## 5. Próximo passo — abrir o breakdown de `setorize-torcidas`

**Pendente. É o que fazer antes de cortar qualquer coisa**, porque é o maior
item da fatura (44%) e o único com ganho de risco zero.

No painel da Railway, expandir `setorize-torcidas` (a seta à direita, ou
**Show Breakdown** no topo da página de Usage). Os $1,65 se dividem entre pelo
menos três serviços:

| Serviço | Environment | Custo esperado | O que checar |
|---|---|---|---|
| `torcida-web` | `setorize-torcidas-prod` | o maior — é o que atende usuário | tem que estar ligado |
| `torcida-web` | `setorize-torcidas-hom` | **suspeito nº 1** | está rodando 24/7 sem ninguém usando? |
| Postgres prod | `setorize-torcidas-prod` | pequeno (base recém-semeada) | — |

### O que a medição decide

- **Se o web de hom estiver próximo do web de prod:** está ligado à toa. Ligar
  o *app sleeping* / scale-to-zero desse serviço (settings do serviço no
  environment `setorize-torcidas-hom`). Ele só precisa acordar quando você for
  validar uma feature; a primeira carga depois de dormir é lenta e isso é
  aceitável para homologação. Ganho direto, refatoração zero, **nada** perdido —
  o gate do `schema-deploy.yml` fala com o **Postgres**, não com o web, então
  continua funcionando com o serviço dormindo.
- **Se o web de hom já for irrelevante:** o gasto está concentrado em prod, a
  fatura é o preço de ter produção no ar, e a economia real só vem do §4 (tirar
  o Discord). Nesse caso **não** mexer em mais nada de ambiente.
- **Se o Postgres prod aparecer alto:** anômalo para uma base que só tem
  catálogo semeado (11/08) — investigar antes de aceitar (conexões presas,
  backup, volume superdimensionado).

### Registrar aqui o resultado

| Serviço | Custo medido | Data | Ação tomada |
|---|---|---|---|
| `torcida-web` prod | ⬜ | | |
| `torcida-web` hom | ⬜ | | |
| Postgres prod | ⬜ | | |

Sem esses três números, qualquer decisão de corte além do §4 é palpite — foi
exatamente o erro que esta análise começou corrigindo.

## 6. Anti-padrões registrados nesta análise

- Cortar o ambiente que **protege** produção para economizar ~R$10/mês.
- Distribuir dump de **produção** para máquina de dev (LGPD).
- Concluir que "o banco de homolog dobrou a conta" sem abrir o **Usage by
  Project** — 56% do gasto estava fora do projeto do produto, e um terço nem era
  deste produto.
- Tratar `dbo-bot-pde` como "banco do bot" e apagá-lo: ele **é o HML**.
- Comparar fatura projetada com gasto realizado como se fossem a mesma coisa
  (o uso ainda estava dentro da franquia de $5).
