# Módulo — Portal de notícias e fórum (praça)

Praça de **notícias + fórum** dentro da Comunidade, no canal ativo (CN, torcida
ou unidade). Não é um item extra na top bar: Comunidade continua o único atalho;
a subnav ganha Feed | Notícias | Fórum.

Imprensa de terceiros **não é republicada**. `Noticia` só guarda título, resumo,
URL e fonte; o clique sai para o veículo (Lei 9.610/98). Artigo próprio da
torcida/unidade é conteúdo nosso. Sem scraper, sem embed de corpo alheio.

## Superfícies

| Destino | Âncora | Conteúdo |
|---|---|---|
| `/portal/comunidade/noticias` | escopo do canal | Imprensa (`Noticia`) só em `nacional`; artigos (`ArtigoPortal`) no tenant |
| `/portal/comunidade/forum` | escopo do canal | Tópicos (`ForumTopico`) do clube **ou** do tenant, nunca os dois juntos |
| Feed Descobrir | mesmo escopo | Tópico entra como `PostSocialItem` (`forum`) no ranking `scoreDescobrirPost` — mídia, apoio e resposta no card; clique abre o tópico |

`?escopo=` / cookie `comunidade_escopo` decide o canal. PDE não vê artigo da
Sede; Sede não vê artigo da PDE; CN não lista `ArtigoPortal`.

A faixa **Na praça** acima do feed continua só com imprensa (CN) e artigos
(torcida/unidade). Tópico **não** vai mais em lote nessa faixa — compete no
Descobrir com os posts (teto de 8 candidatos por página). Seguindo / grupos /
canal **não** misturam fórum.

## Origens (rótulo no card)

1. **Imprensa** — `Noticia` APROVADA, `afiliacaoId`. Só CN.
2. **Oficial** — `ArtigoPortal.origem = OFICIAL`. Exige `announcements:publish` no tenant ativo.
3. **Verificada** — sócio com `SaasMembro.fonteVerificadaEm`; artigo de opinião, não trilho oficial.
4. **Fórum** — UGC (`community:post` / torcedor na CN). No feed, o badge Fórum
   vai no card de publicação; o clique abre `/portal/comunidade/forum/[id]`.

Ordenação do mix de **notícia/artigo** na faixa: `ordenarCardsPraca` (imprensa →
oficial → verificada → fórum, depois recência). No **feed**, o tópico usa o
mesmo score do Descobrir (`freshness` 72h, reações, comentários/respostas,
mídia, pin +8 — **não** o boost institucional de comunicado).

## Isolamento (invariante)

Artigo e tópico **não** herdam fan-out de comunicado. Query **exige**
`tenantId` (torcida/unidade) ou `afiliacaoId` (clube). Sem `OR` ancestral.

Função pura: `wherePracaNoEscopo` em `packages/types/src/portal-noticias-forum.js`.

## Engajamento

- Fórum: respostas + voto +1/−1; listagem Recentes / Populares / Mais vistos.
  No feed Descobrir: **Apoiar** (`PracaVoto` +1) e **Comentar** (`ForumResposta`)
  no próprio card, sem `revalidatePath` do feed (overlay, como reação de post).
  Clique em título/hora ou "Ver discussão" abre o tópico para a thread completa.
- Artigo e notícia: comentário nosso + voto no **card**; texto da matéria continua no veículo.
- Ranking geral (limiar 5 pontos) e janela de 7 dias; **não** concede RBAC.
- Teto de 40 sinais baratos (tópico, resposta, voto emitido) por 7 dias no canal.
- Faixa épico/lendário é rótulo de volume, não cargo.
- Moderação no tenant (`community:moderate`): fixar / ocultar.

## Quem publica

| Ação | Gate |
|---|---|
| Tópico / resposta (torcida/unidade) | `community:post` no tenant |
| Tópico / resposta (CN) | `assertComunidadeNacional` (torcedor do clube) |
| Artigo oficial | `announcements:publish` no **tenant ativo** |
| Curar imprensa | `news:curate` (já existe) |
| Selo verificada | liderança (`announcements:publish`) + `AuditLog` |
| Moderar | `community:moderate` |
| Editar / excluir tópico próprio | autor (`editarTopico` / `excluirTopico`) |

O tópico usa o **mesmo `FeedComposer` do feed** (mídia, menções, emoji). A primeira linha vira o título da listagem; o corpo e os anexos ficam no tópico como prévia de publicação. Seed de volume: `pnpm --filter @torcida/db seed:forum-praca` (Gaviões + CN do Corinthians).

## Schema

`ForumTopico` (com `midiaUrls`, como o Post), `ForumResposta`, `PracaVoto`, `PracaComentario`, `ArtigoPortal`,
`ForumScoreEvento`, `ForumScoreSaldo`. Selo em `SaasMembro`.

Pós-merge: `schema:deploy` HML→prod (`docs/ops/schema-deploy.md`).
