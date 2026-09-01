# Fontes de dados sobre clubes e torcidas — catálogo avaliado

> Estudo de fontes para enriquecer `Afiliacao`, `TorcidaConhecida` e
> `RivalidadeClube` com dado **verificável**. Cada fonte aqui foi testada de
> fato (baixada, parseada e cruzada com o banco), não apenas citada.
> **Consulta: 2026-08-27.** Resultado medido do cruzamento:
> [`docs/data/auditoria-catalogo-clubes.md`](../data/auditoria-catalogo-clubes.md).

## Regra de ouro deste domínio

Não existe uma fonte única boa para clube brasileiro. Existe uma **fonte certa
por campo**, e o erro clássico é usar uma fonte fora do que ela mede:

| Pergunta | Fonte certa | Fonte errada que parece certa |
|---|---|---|
| Este clube existe e joga profissionalmente? | **CBF — RNC** | Ogol / Wikipédia (listam extintos e amadores) |
| Em que cidade fica? | **Wikidata + Ogol + malha IBGE** | endereço da torcida (traz bairro/estádio) |
| Quantos torcedores tem? | **Datafolha** (pesquisa de opinião) | IBOPE Repucom (mede seguidor, não torcedor) |
| Qual o alcance digital? | **IBOPE Repucom** | Datafolha |
| Em que divisão joga em 2026? | **CBF / ge** (lista da temporada) | RNC (é ranking de 5 anos, não divisão) |
| Esta torcida é regularizada? | **Federação estadual + CNPJ** | portal colaborativo |
| Quem é rival de quem? | lista de clássicos **filtrada por estado** | lista de clássicos crua (mistura marketing) |

## Camada 1 — Fontes oficiais (confiança alta)

### CBF — Ranking Nacional de Clubes (RNC)

- **O que é:** lista oficial e anual dos clubes ranqueados pela CBF, com
  federação (UF) e pontuação acumulada. Edição 2026: **235 clubes**, revisada
  em 23/12/2025 e divulgada em 24/12/2025.
- **Critério:** participação nas Séries A, B, C e D do Brasileiro e na Copa do
  Brasil nos **últimos 5 anos** (Convenção de Pontos do RNC).
- **Formato:** PDF de 3 páginas em duas colunas (originado de xlsx). Extraído
  com `pdftotext` (modo cru + `-layout`) e reconstruído — o modo cru dá a
  coluna esquerda em sequência e o direito vem em linhas-resumo `Fed. ...` /
  `Pontos ...`. Resultado: `packages/db/src/data/cbf-ranking-clubes-2026.json`.
- **Para que serve aqui:** (1) **prova de existência profissional** — clube fora
  do RNC não disputou competição nacional em 5 anos; (2) **relevância** para
  ordenar catálogo e busca no onboarding; (3) **cobertura**: as 27 UFs
  aparecem, então serve de checklist nacional.
- **Não serve para:** divisão da temporada (o RNC é acumulado, não a Série de
  2026) nem para clube que só disputa estadual.
- Fonte: [CBF — informe RNC/RNF 2026](https://www.cbf.com.br/a-cbf/noticias/informes-cbf/a/cbf-divulga-ranking-nacional-de-clubes-e-de-federacoes-do-futebol-masculino-para-2026)
  · [PDF do RNC 2026](https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/RNC_Ranking_Nacional_dos_Clubes_2026_27e24418e7.pdf).

### Federações estaduais — torcidas organizadas cadastradas

- **FPF (São Paulo)** publica a *Relação de Torcidas Cadastradas*: **135
  torcidas** com nome, clube e cidade (referência 21/02/2024). É o registro
  administrativo da federação — o mais próximo de um "cadastro oficial de
  torcida organizada" publicado no país.
  Dataset: `packages/db/src/data/fpf-torcidas-cadastradas-sp.json`.
- **Cuidado de leitura:** ausência na lista **não** prova que a torcida não
  existe — prova que ela não constava como cadastrada naquela data. Presença,
  sim, é prova forte de regularidade.
- O PDF bloqueia user-agent de bot (HTTP 403 em fetch simples); baixar com
  `curl -A "Mozilla/5.0"`.
- Não foi localizada lista pública equivalente em FERJ (RJ) e FMF (MG) —
  backlog de coleta.
- Fonte: [FPF — Relação Torcidas Cadastradas](https://futebolpaulista.com.br/Repositorio/Noticia/10293/10293_2122024143746_5.pdf).

### IBGE

- **Malha municipal** (já no repo, `apps/web/src/lib/data/municipios-brasil.json`,
  5.571 municípios): usada aqui como **validador** do campo cidade — se a
  cidade do clube não é município daquela UF, o dado está sujo.
  Pegadinha conhecida: no DF só existe **Brasília**; Gama, Ceilândia e
  Sobradinho são regiões administrativas, não municípios.
- **Censo 2022** (API `servicodados.ibge.gov.br`, agregado 9514, variável 93):
  base populacional para converter percentual de pesquisa em número absoluto.
  População de 16 anos ou mais = **160.131.985** (203.080.756 residentes menos
  40.129.261 de 0–14 anos e 2.819.510 de 15 anos).

### Planalto — Lei Geral do Esporte (texto integral)

Fonte primária do compliance do produto. As correções aplicadas em
[`contexto-legal.md`](contexto-legal.md) saíram da leitura do texto da lei, não
de imprensa secundária.

## Camada 2 — Dados abertos estruturados (confiança alta a média)

### Wikidata (SPARQL)

- **Cobertura medida** (`?c wdt:P31/wdt:P279* wd:Q476028 ; wdt:P17 wd:Q155`):
  **1.744 clubes brasileiros** — fundação (P571) em 1.174, sede (P159) em
  1.151, estádio (P115) em 994, site oficial (P856) em 573.
- **Não** serve para cores (P462 existe em 3 clubes) nem redes sociais
  (Instagram em 126). Para cor de marca, seguir
  [`identidade-visual-cores.md`](identidade-visual-cores.md).
- **Licença CC0** — pode versionar no repo sem atrito.
- **Operação:** a query que sobe a cadeia `P131*` até a UF estoura o timeout de
  60s do endpoint (HTTP 504); a versão que funciona pede só a cidade e resolve
  a UF localmente contra a malha do IBGE. Coletor: `coleta:wikidata-clubes`;
  query, metadados e resultado em
  `packages/db/src/data/wikidata-clubes-br.json`.

**Três armadilhas medidas em 2026-09-01** (todas custaram ficha errada em
produção — ver `docs/data/auditoria-catalogo-clubes.md` §5.1):

1. **O clube tem várias entidades com o MESMO rótulo.** Time feminino, time B,
   futsal, beach soccer e o clube extinto que antecedeu o atual são verbetes
   separados, todos rotulados "Sport Club Corinthians Paulista" ou "Clube de
   Regatas do Flamengo". Casar por nome pega o que vier primeiro. Discriminar
   por **P31** só resolve parte (o feminino do Corinthians está tipado como
   `Q476028`, clube de futebol, igual ao principal); o resto sai da
   **descrição** em pt/en ("clube brasileiro de futebol feminino"). Excluir por
   P31 exige cuidado: "clube de remo" e "rugby union club" aparecem **na mesma
   entidade** do clube de futebol (Sportivo Sergipe rema), então esses tipos não
   servem de filtro.
2. **`P576` (extinção) é o desempate que ninguém lembra.** Grêmio Esportivo
   Novorizontino foi extinto em 1999 e Cascavel EC em 2001; os clubes que jogam
   hoje com esse nome são outros verbetes. Sem olhar P576 a ficha fica com a
   fundação do clube morto.
3. **`P17` (país) não é confiável e `P1083` (capacidade) não é única.** O ABC de
   Natal tem `P17 = Campeonato Brasileiro Série C` — filtrar só por
   `P17 = Q155` apaga o clube da coleta inteira (a saída é aceitar também
   `P159/P17 = Q155`, sede em município brasileiro). E o mesmo estádio tem
   várias capacidades sem ranking: o Morumbi declara **120.000** (recorde de
   1977), 71.200 e 67.052 — pegar a maior gravou o recorde histórico como
   lotação.

### Ogol

Já no repo (`ogol-clubes-brasil.json`, 9.858 registros paginados). Bom para
cidade, ano de fundação e logo — **mas contém duplicatas do mesmo clube** (o
mesmo `slug` aparece com e sem cidade/UF), o que gera match ambíguo. Usar
sempre deduplicado por `ogolId` e com UF obrigatória.

### Cloudinary — cor do clube a partir do escudo

`CLUBE_PALETAS` (`packages/types/src/design.js`) é curada à mão e cobre ~35
clubes; o catálogo tem 409. Como os escudos já estão no nosso Cloudinary, a
Admin API (`/resources/image/upload/{public_id}?colors=true`) devolve a
distribuição de cores da imagem — ponto de partida honesto para os outros.

- Coleta: `coleta:cores-escudos` (serializa as chamadas, respeita
  `x-featureratelimit-remaining` e para sozinho se a cota horária acabar).
  250 escudos consumiram ~215 chamadas da cota de 500/h.
- Resultado versionado em `cores-escudos.json`; quem grava no banco é
  `seed:ficha-clubes`, e **curadoria sempre ganha** (`coresFonte` distingue
  `design:CLUBE_PALETAS` de `escudo:cloudinary`).
- **Limite que obriga revisão:** a ordem sai da área que a cor ocupa na imagem,
  não da identidade do clube — num escudo preto e branco o branco pode vir como
  primária, e detalhe dourado do brasão vira acento que a torcida não usa.
  Preto e branco **não** são filtrados: são cores legítimas (Corinthians,
  Santos, Botafogo, Vasco) — ver [`identidade-visual-cores.md`](identidade-visual-cores.md).

### API-Football (pago, decisão #7)

Contrato e cota em [`api-football-referencia.md`](api-football-referencia.md).
Além de partidas, o `GET /teams` traz `founded` e o objeto `venue` (nome,
cidade, capacidade) — fonte natural para estádio dos clubes **da elite**; fora
dela a cobertura cai e o Wikidata cobre mais.

## Camada 3 — Pesquisa e mercado (fonte confiável, uso exige cuidado)

### Datafolha — tamanho de torcida

- Rodada mais recente: coleta em **22 e 23/07/2026**, publicada em 01/08/2026.
  2.004 entrevistados de 16+ anos, 139 municípios das 5 regiões, margem ±2 p.p.
- Flamengo 22%, Corinthians 14%, Palmeiras 7%, São Paulo 6%, Cruzeiro 4%,
  Vasco 3%, Grêmio 3%; Atlético-MG, Internacional, Santos e Fluminense com 2%;
  Bahia, Botafogo, Vitória, Athletico, Sport e Remo com 1%. **22% não torcem
  para nenhum time.** Recortes: Flamengo 34% no Norte/Centro-Oeste e 29% no
  Nordeste; no Sudeste Corinthians 20% × Flamengo 16% (empate técnico); no Sul,
  Grêmio 20% e Internacional 15%.
- **Uso correto:** é a única fonte que responde "quantos torcedores"; o
  absoluto sai de percentual × base IBGE 16+. Dataset:
  `packages/db/src/data/torcedores-pesquisa-datafolha.js`.
- **Limite honesto:** com ±2 p.p., clube de 1–2% está dentro do ruído — mostrar
  faixa, nunca número cheio. E a pesquisa enxerga ~17 clubes; os outros 300 do
  catálogo seguem sem estimativa de torcida.
- Fontes: [CNN Brasil](https://www.cnnbrasil.com.br/esportes/futebol/datafolha-flamengo-segue-com-a-maior-torcida-do-brasil/)
  · [Lance!](https://www.lance.com.br/futebol-nacional/flamengo-segue-com-ampla-vantagem-sobre-o-corinthians-no-ranking-de-torcidas.html).

### IBOPE Repucom — base digital

Continua válido para o que sempre mediu: soma de seguidores nas redes oficiais
do Top 50. Ver [`futebol-dados-publicos.md`](futebol-dados-publicos.md).
**Nunca** apresentar como "torcedores".

### Sócio-torcedor (levantamento ge, jan/2026)

Séries A e B somam **mais de 1,5 milhão de sócios adimplentes**. Topo:
Palmeiras 167.909 (Avanti), Atlético-MG 144.431 (Galo na Veia), Corinthians
118.545 (Fiel Torcedor), Flamengo ~118.000 (Nação), Internacional 108.809,
Grêmio 101.651, Cruzeiro 88.096, Bahia ~76.000, Vasco 67.739, Santos 57.836.

**Por que isso importa para o produto:** é o benchmark de associativismo
brasileiro — mesmo problema da torcida organizada (captar, cobrar mensalidade,
manter adimplência, provar tamanho). Altas de 36% (Galo), 40% (Corinthians) e
53% (Vasco) em seis meses mostram mercado de filiação paga em expansão. Serve
de argumento comercial e de referência de metas no módulo de associação.
Fonte: [O Tempo / levantamento ge](https://www.otempo.com.br/sports/atletico/2026/1/31/atletico-e-cruzeiro-estao-no-top-10-dos-clubes-com-mais-socios-no-pais-veja-levantamento).

### CNPJ — dados abertos da Receita Federal

Torcida organizada com estatuto é **associação civil com CNPJ**. Os dados
públicos da Receita são redistribuídos por APIs gratuitas e sem chave —
**BrasilAPI** (`/api/cnpj/v1/{cnpj}`), **minhaReceita** e **OpenCNPJ** — e
devolvem razão social, situação cadastral, data de abertura, CNAE e endereço.

Uso possível (backlog, não implementado): validar o CNPJ informado pela torcida
no onboarding, exibir situação cadastral no perfil e detectar torcida
baixada/suspensa. Sem SLA — tratar como enriquecimento opcional, com
`isXConfigured()` e degradação graciosa, igual ao LiveKit.

## Camada 4 — Colaborativo (confiança média, sempre confirmar)

`organizadasbrasil.com` (origem do `torcidas-conhecidas.js`, 546 registros) e as
listas de clássicos da Wikipédia. São insubstituíveis em cobertura — não existe
outra lista com 546 organizadas — mas trazem torcidas extintas, grafias
variantes e datas conflitantes. O cruzamento com a lista da FPF mostra o
tamanho do problema: das 112 torcidas paulistas do catálogo, **50 não constam
como cadastradas** na federação.

## Rivalidade: a armadilha metodológica

A Wikipédia lista "clássicos" — e mistura três coisas diferentes:

1. **Rivalidade local** (Ba-Vi, Re-Pa, Atletiba, Clássico-Rei): confronto real
   entre torcidas da mesma praça. **É isto que deve isolar** no produto.
2. **Rivalidade estadual não-local** (Goiás × Itumbiara): real, porém mais
   fraca.
3. **"Clássico" interestadual** (Flamengo × São Paulo, Corinthians × Cruzeiro):
   rivalidade de calendário e de mídia. Se isso virar `RivalidadeClube`, o
   isolamento apaga boa parte da malha nacional de interação sem ganho algum de
   segurança — e o seed de teste do repo já contém um par assim
   (Flamengo × São Paulo, em `scripts/lib/lote-nacional.js`).

Por isso o dataset `rivalidades-clubes.js` só aceita pares **intraestaduais**,
marcados como `MUNICIPAL` ou `ESTADUAL`.

## Fontes descartadas (e por quê)

| Fonte | Motivo |
|---|---|
| Painel "Sports" do Google | Sem API pública; scraping da SERP viola ToS (já documentado em `futebol-dados-publicos.md`) |
| football-data.org | Free cobre só a Série A; sem estaduais em nenhum plano |
| Transfermarkt / Sofascore (scraping) | ToS proíbem; Sofascore entra só como **widget** oficial |
| "Cadastro Nacional de Torcedores" | **Não existe** — o dispositivo foi vetado (ver `contexto-legal.md`) |

## Manutenção

| Fonte | Cadência | Como |
|---|---|---|
| CBF RNC | anual (dezembro) | baixar PDF, reparsear, gerar `cbf-ranking-clubes-<ano>.json`, rodar `seed:clubes-rnc` |
| Séries A–D | anual (dez/jan) | atualizar `series-brasileirao-<ano>.js` + `db:repair-series-afiliacoes` |
| Datafolha | ~anual | trocar percentuais, datas e recalcular absolutos em `torcedores-pesquisa-datafolha.js` |
| IBOPE Repucom | mensal | fluxo já descrito em `docs/data/torcedores-estimados.md` |
| FPF torcidas | quando a federação republicar | `curl` com user-agent de navegador + `seed:torcidas-registro` |
| Wikidata | sob demanda | `coleta:wikidata-clubes` + `seed:ficha-clubes -- --corrigir-ficha` |
| Cores do escudo | quando entrarem escudos novos | `coleta:cores-escudos` + `seed:ficha-clubes` |

Medição do estado a qualquer momento: `audit:catalogo-clubes` (sai com código 1
se achar rivalidade interestadual isolando, homônimo novo ou ficha ancorada na
entidade errada do Wikidata). Invariantes puros: `test:catalogo-clubes`.

Agentes: `research-dominio` (novas fontes), `data-model` (campos novos),
`aliancas-torcidas` (rivalidade), `implementation` (seeds),
`qa-verification` (invariantes de casamento).
