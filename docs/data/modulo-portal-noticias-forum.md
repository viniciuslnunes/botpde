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
| `/portal/comunidade/noticias` | escopo do canal | Imprensa (`Noticia`) só em `nacional`; artigos (`ArtigoPortal`) no tenant. Botão **Criar notícia** no cabeçalho abre o composer em blocos (`?criar=1`) e oculta o mural; cancelar/publicar volta à lista. Default **Mais vistas** (`visitas`). `/noticias/novo` redireciona para `?criar=1`. |
| `/portal/comunidade/forum` | escopo do canal | Abas `?aba=topicos` (lista) · `novo` (composer) · `ranking`. `/forum/novo` redireciona para `aba=novo`. |
| Feed Descobrir | mesmo escopo | Tópico entra como `PostSocialItem` (`forum`) no ranking `scoreDescobrirPost` — mídia, voto de tópico (concordo/discordo) e resposta no card; clique abre o tópico |

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
4. **Fórum** — UGC (`community:post` / torcedor na CN). No feed, o badge **Fórum**
   fica no canto superior direito do card, ao lado do menu de opções; **Ver no fórum**
   abre `/portal/comunidade/forum/[id]`. Notícia/artigo na faixa **Na praça** usa o
   badge **Notícias** no mesmo canto e **Ver nas notícias** para
   `/portal/comunidade/noticias/[id]`.

Ordenação do mix de **notícia/artigo** na faixa: `ordenarCardsPraca` (imprensa →
oficial → verificada → fórum, depois recência). No **feed**, o tópico usa o
mesmo score do Descobrir (`freshness` 72h, reações, comentários/respostas,
mídia, pin +8 — **não** o boost institucional de comunicado).

## Isolamento (invariante)

Artigo e tópico **não** herdam fan-out de comunicado. Query **exige**
`tenantId` (torcida/unidade) ou `afiliacaoId` (clube). Sem `OR` ancestral.

Função pura: `wherePracaNoEscopo` em `packages/types/src/portal-noticias-forum.js`.

## Engajamento

- Fórum: respostas + voto +1/−1. Listagem default **Em alta** (`scoreHotTopico`:
  recência 72h, Wilson da aprovação, respostas, voto líquido com negativo 2×,
  mídia, pin). Recentes / Mais vistos continuam como recorte. `?ordem=populares`
  mapeia para `em_alta`.
  No feed Descobrir **e** nas listagens de Notícias/Fórum: **Concordo** / **Discordo**
  (`PracaVoto` +1/−1) e **Responder** no próprio card — inclusive resposta em cima de
  outra resposta. Sem `revalidatePath` do feed (overlay). Clique em título/hora ou
  **Ver no fórum** abre o tópico para a thread completa.
- Artigo e notícia: comentário nosso + voto no **card** (módulo Notícias e praça);
  texto da matéria continua no veículo.
  Qualquer comentário aceita várias respostas (`PracaComentario.parentId`). Visual:
  **Responder · N respostas ∨** na mesma linha (`ComentarioRespostasBloco`), lista
  achatada sob a raiz e composer embutido na thread — sem escada de indentação.
- **Editar / excluir o próprio comentário (2026-09-03):** menu ⋯ na linha, via o
  mesmo `ComentarioMenu` do post da Comunidade — a superfície muda, o componente
  não. Actions: `editarComentarioPraca`/`excluirComentarioPraca` (notícia e artigo)
  e `editarRespostaForum`/`excluirRespostaForum` (tópico). **A dona da regra é a
  action, não a UI**: o `findFirst` filtra por `autorId: session.user.id` (por isso
  não existe "editar comentário dos outros" nem para quem modera — moderação é
  ocultar, não reescrever), reconfere o escopo com `podeVerArtigoNoEscopo` /
  `podeVerTopicoNoEscopo`, grava `AuditLog` (`PRACA_COMENTARIO_EDITADO|EXCLUIDO`,
  `FORUM_RESPOSTA_EDITADA|EXCLUIDA`) e revalida as rotas. Resposta recusada
  (`oculto`) não abre o menu. Excluir resposta de fórum decrementa
  `ForumTopico.respostasCount` só quando ela contava.
  Onde a lista é estado de cliente (feed/reel), o componente atualiza local e
  **reparenta os órfãos** (`parentId → null`, mesma regra de
  `montarArvoreComentarios`); onde vem de RSC (detalhe da praça e do tópico), é
  `router.refresh()`.
- Ranking de pessoas (limiar 5 pontos) e janela de 7 dias; **não** concede RBAC.
- Teto de 40 sinais baratos (tópico, resposta, voto emitido) por 7 dias no canal.
- Faixa épico/lendário é rótulo de volume, não cargo.
- Moderação no tenant (`community:moderate`): aprovar / recusar (motivo) /
  fixar / ocultar tópico; recusar/restaurar resposta. Comunicação
  (`announcements:publish`) publica na hora. UGC da torcida/unidade entra
  `PENDENTE` (autor vê o próprio; fila no topo da lista). CN publica
  `VISIVEL` na hora — não há tenant dono da fila.

## Quem publica

| Ação | Gate |
|---|---|
| Tópico / resposta (torcida/unidade) | `community:post` no tenant |
| Tópico / resposta (CN) | `assertComunidadeNacional` (torcedor do clube) |
| Artigo oficial | `announcements:publish` no **tenant ativo** **e** canal elegível (oficial da torcida/unidade ou `portalNoticiasVerificado`) |
| Curar imprensa | `news:curate` (já existe) |
| Selo verificada | liderança (`announcements:publish`) + `AuditLog` — artigo sai `VERIFICADA`; ainda exige canal elegível |
| Moderar (aprovar/recusar/ocultar/fixar) | `community:moderate` |
| Editar / excluir tópico próprio | autor (`editarTopico` / `excluirTopico`) |

O tópico usa o **mesmo `FeedComposer` do feed** (mídia, menções, emoji), em
duas colunas no desktop (escrita à esquerda, prévia à direita). A primeira
linha vira o título da listagem; o corpo e os anexos ficam no tópico. A lista
é compacta (capa 64–80px, como canal). Seed de volume:
`pnpm --filter @torcida/db seed:forum-praca` (Gaviões + CN do Corinthians).
Notícias já ranqueadas (Mais vistas / Em alta / Recentes):
`pnpm --filter @torcida/db seed:noticias-praca` (Gaviões, PDE FIEL BAIXADA, Camisa 12; IDs `noticias-demo-*`, sem `:` — o App Router cola a query no segmento e 404a; só local).

A notícia da torcida/unidade é uma **história em blocos** (texto, foto, vídeo,
embed de YouTube/Instagram/X/TikTok), no ritmo de um portal — não um único
texto com mídia no topo. Composer próprio (`NoticiaStoryComposer`); a leitura
é coluna estreita (título, linha fina, byline, corpo intercalado). Lista no
estilo mural/comunicados (card com a **primeira** mídia, pin, ocultar).
Ordenação reusa o ranking do fórum (`scoreHotTopico` em **Em alta**; **Mais
vistas** por `visitas`, default). Visita incrementa no detalhe, não no GET.
Canal elegível: `canalElegivelParaNoticia` — `canalOficial` da torcida/unidade
ou `Conversa.portalNoticiasVerificado` (portal oficial futuro). Sem canal
elegível, ninguém publica. Artigo antigo (só `corpo` + `midiaUrls`) continua
legível: `blocosDeArtigoLegado`.

## Schema

`ForumTopico` (com `midiaUrls` e `rejeitadoMotivo`; status `PENDENTE` |
`VISIVEL` | `REJEITADO` | `OCULTO` | `REMOVIDO`), `ForumResposta`, `PracaVoto`,
`PracaComentario`, `ArtigoPortal` (`midiaUrls`, `visitas`, `gostei`/`naoGostei`,
`fixado`, `conversaId`, `blocos` JSON da história), `Noticia.visitas`, `Conversa.portalNoticiasVerificado`,
`ForumScoreEvento`, `ForumScoreSaldo`. Selo em `SaasMembro`. Default do status
do tópico continua `VISIVEL` (seed e legado). UGC novo na torcida grava
`PENDENTE`.

Pós-merge: `schema:deploy` HML→prod (`docs/ops/schema-deploy.md`).
