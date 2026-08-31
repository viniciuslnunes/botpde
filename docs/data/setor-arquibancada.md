# Setor da torcida na arquibancada

> Planejamento (2026-08-26). **Implementado** no tenant da Sede: picker em
> `/admin/configuracoes?secao=afiliacao`, card de onboarding, perfil público da
> torcida. **Planejado (2026-08-26):** visão derivada do clube — disposição de
> todas as TOs no bowl. Domínio: `docs/knowledge/glossario.md` § Identidade e
> arquibancada. Copy: sempre **Setor Norte / Sul / Leste / Oeste** — nunca
> “Gol Norte”.

O dado registra **onde a torcida sede se concentra no estádio do time apoiado**.
Unidades da worktree (subsede/PDE) herdam; não escolhem. O sócio vê no card; a
liderança da sede cadastra. Não é planta do estádio nem SKU de ingresso.

## Fontes

| Insumo | O que entra | Confiança |
|--------|-------------|-----------|
| Estádios BR (Neo Química, Maracanã, Arena do Grêmio, MorumBIS, Mineirão/MRV, Allianz/Nubank, Fonte Nova) + fala das TOs | Cardeais, Geral, visitante, nomes comerciais | Alta nos cardeais e na copy; média no mapeamento de cores Mineirão |
| Tratado interno *Anatomia e geometria setorial* (2026-08-26) | Camadas FIFA da arena (N/S = festa; Oeste = hospitalidade; visitante = célula isolada; orientação N–S do gramado; curva europeia ≠ diagonal de engenharia) | **Média** na taxonomia; **baixa** nos números (C-value, 300% de preço, vazão de vômito) — o texto não traz fonte. Não copiar física/óptica/yield para o modelo |

## O que gravar (v1)

No **tenant raiz da Sede** (`Tenant`), não em `Sede` (endereço) nem em `Afiliacao`
(várias TOs do mesmo time ocupam lugares diferentes).

| Campo | Valores | Obrigatório |
|-------|---------|-------------|
| Cardeal | `NORTE` · `SUL` · `LESTE` · `OESTE` | sim |
| Geral | boolean — em pé / popular daquele lado | não |
| Nome local | texto — “Arquibancada Norte”, “setor Amarelo” | não |
| Portão | texto — “Portão O”, “Portões Q, S, U e W” | não |

Anel (inferior / superior) fica para um ciclo seguinte: a identidade da TO é o
cardeal, não o andar.

Herança: `getTorcidaWorktree` / ancestral Sede. Unidades só leem.

## Picker (SVG genérico)

Como o mapa do Brasil: paths nossos, hover, clique. **Não** PNG/SVG de arena real.

- Oval/retângulo com **quatro cardeais** rotulados Setor Norte / Sul / Leste / Oeste.
- Gramado no eixo **Norte–Sul** (padrão FIFA de orientação do campo): gols nas
  cabeceiras. Norte no topo do desenho, ou o lado da festa em destaque depois
  que o cardeal estiver escolhido.
- Cantos do bowl **visíveis** (geometria), **não clicáveis à parte**. A diagonal
  de engenharia (NE/NO/SE/SO, “Oeste Inferior Corner” na bilheteria) não é
  identidade de organizada. A *Curva* europeia/argentina (Curva Nord) é o
  **próprio** Setor Norte/Sul, não o canto.
- Toggle opcional **Geral** (em pé) depois do cardeal — não é quinto retângulo.
- Fora do mapa: visitante, camarote, Gold, tribuna, PCD, família, blocos 101A.

Cadastro: admin da sede (identidade / config). Onboarding do sócio **mostra**,
não pergunta.

## O que o tratado confirma (e o que descartamos)

**Entra no plano**

- Norte/Sul = território de alta energia (bateria, em pé, contenção). É o default
  da organizada da casa.
- Leste/Oeste = laterais; Oeste costuma ser o “panóptico” (tribuna, TV, Gold).
  Continuam no picker porque o recorte histórico às vezes foi lateral.
- Geral / Safe Standing / “setor organizadas” = subtipo da cabeceira, não cardeal
  novo. No BR a copy é **Geral**, não Safe Standing.
- Visitante = célula de segurança (portão isolado, “gaiola”). Fora da identidade
  da sede em casa.
- Orientação N–S do gramado = regra de desenho do SVG, não campo de banco.
- Portão de entrada acompanha o setor (o sócio *entra* por um portão para *ficar*
  num setor). Texto livre, sem enumerar portões do país.

**Não entra no modelo**

- Valor C, paraboloide hiperbólico, vômito hidráulico, vidro com argônio.
- Yield management, fator sol, índice de centralidade, mosaico de cadeira para TV.
- Sub-blocos 101A/101B, Tunnel Club, Skybox, AR zones, paredes móveis.
- Oito zonas clicáveis (quatro cardeais + quatro cantos).

Essas camadas descrevem como a *arena vende ingresso*. A torcida declara um
lugar social estável: Setor Norte (Geral, Portão O).

## Superfícies

| Onde | Papel | Estado |
|------|--------|--------|
| `/admin/configuracoes` (ou identidade da Sede) | Picker + Geral + nome local + portão. Gate: liderança da raiz | feito |
| Card da torcida no onboarding / Associe-se | Só leitura, herdado da sede | feito |
| Portal (identidade da torcida) | Só leitura | feito |
| Bowl do clube (passo Torcida / Associe-se) | Leitura agregada: todas as TOs visíveis da afiliação no esquemático | **planejado** |
| Super-admin detalhe do clube | Linha de setor na lista de TOs | fora do v1 |

Não misturar com `Sede.capacidade` nem com lotação de `Evento`.

## Riscos

- Copy “Gol Norte” vaza de sites de ingresso — invariante de UI/teste.
- Rivalidade: o mapa é da *própria* torcida no estádio da *própria* afiliação.
  Não virar mapa de confronto nem “onde o rival senta”.
- Fonte Nova e ferraduras: um cardeal pode não ter assento. O SVG genérico
  mostra quatro lados; não desligar lado por estádio na v1.
- Tratado sem fonte: não usar números dele em copy nem em seed.

---

## Visão do clube — disposição das organizadas (planejado)

> Recorte fechado para implementação. Sem mudança de schema: o clube **não
> grava** setor; a Sede de cada TO continua sendo a única escrita. A visão é
> o inverso da leitura que já existe: dado o time, onde cada organizada se
> concentra. Aprovação: este doc. Implementação: agente `implementation`.

### Por que existe

O catálogo de `Afiliacao` (passo Clube, grade de escudos, `/super-admin/clubes`)
não mostra setor — várias TOs do mesmo time ocupam lugares diferentes. O card
da torcida mostra só a linha daquela Sede. Falta o recorte **como um todo**:
no estádio do time, Norte tem quem, Sul tem quem.

Dois eixos geográficos, um recorte de clube:

| Eixo | Pergunta | Superfície já existente |
|------|----------|-------------------------|
| País | Onde a unidade fica? | Mapa do Brasil em Ver no Brasil (`/portal/mapa-brasil`) / onboarding |
| Estádio | Onde a organizada canta no sábado? | **Este bowl** (novo) |

### Fonte (só leitura)

- Entrada = o mesmo conjunto de `getTorcidasPorAfiliacao` / vitrine Associe-se:
  tenants **raiz**, ativos, não sintéticos, sem ancestral (Caso B some como TO
  separada), **sem canal restrito**.
- Cada item já traz `setor` (`cardeal` + `geral` + `nomeLocal` + `portao`).
- Agrupar no cliente (ou helper puro) — **zero query nova**.
- Sem colunas em `Afiliacao`. Sem cadastro no super-admin. Sem a plataforma
  arbitrar “quem manda” num cardeal ocupado por duas TOs: as duas aparecem.

Função pura em `packages/types/src/setor-arquibancada.js`:

```
agruparTorcidasPorCardeal(torcidas) → {
  porCardeal: { NORTE, SUL, LESTE, OESTE },
  semPosicao: [...],   // setor null — não pintam o bowl
  ocupados: Cardeal[]  // cardeais com ≥1 TO
}
```

Geral **não** abre quinto balde: TO com Norte+Geral entra em `NORTE`. Hatch no
setor se **pelo menos uma** TO daquele cardeal marcou Geral.

### Superfícies do v1

1. **`/portal/associe-se`** — coluna da lista de torcidas, **acima** da grade,
   só enquanto nenhuma TO está escolhida (passo de unidades some o bowl: o
   mapa do Brasil continua à esquerda).
2. **Onboarding `PassoTorcida`** — o mesmo componente, acima de “Ou escolha
   sua organizada”. O card “Sou só torcedor do {clube}” **não** entra no
   filtro do bowl.

Fora do v1: grade de clubes (ainda não há time), `PassoUnidade`, perfil
público de uma TO (já tem a linha dela), super-admin.

### Interação

- Bowl **some** se `ocupados.length === 0` (ninguém cadastrou). Não desenhar
  estádio oco.
- Cardeal **ocupado**: preenchido + badge com a contagem. Clique filtra a
  grade às TOs daquele lado. Segundo clique no mesmo lado (ou “todas”) limpa.
- Cardeal **vazio**: visível, não clicável (filtrar para lista vazia é ruído).
- TO sem posição: fica na grade quando o filtro está limpo; some quando um
  cardeal está selecionado.
- Hover/foco no setor: lista curta ao lado ou abaixo (nome + linha
  `formatarSetorArquibancada`). Nomes **não** vão para dentro do SVG.
- Copy do bloco: “Onde as organizadas se concentram” / “No estádio do
  {apelido}. Cada torcida declara o próprio lugar.” Nunca “mapa de confronto”,
  “visitante”, “onde o rival senta”.

### UI / componentes

O picker admin hoje é seleção **simples**
(`components/admin/setor-arquibancada-picker.tsx`). Onboarding **não** importa
de `admin/`.

- Extrair paths + gramado + rótulos canônicos para um bowl compartilhado
  (ex.: `components/setor-arquibancada/bowl.tsx`).
- `SetorArquibancadaPicker` — modo cadastro (um cardeal, hatch = Geral da
  própria TO).
- `SetorArquibancadaClube` — modo ocupação (N cardeais ocupados, badge,
  filtro). Client component; dados já vieram no RSC.

Mesmo SVG genérico. Sem PNG/planta de arena.

### Cache e invalidação

`getTorcidasPorAfiliacao` já é `React.cache` (request). `salvarSetorArquibancada`
já dá `revalidatePath` em `/onboarding` e `/portal`. Completar com
`/portal/associe-se` (path exato; `/portal` sozinho não revalida filho).

### Testes (Vitest)

- Agrupamento: duas TOs no Norte (uma Geral), uma no Sul, uma sem setor →
  `ocupados = [NORTE, SUL]`, `semPosicao` com 1, Norte com 2.
- Filtro: cardeal selecionado devolve só aquele lado; limpar devolve todas
  (exceto as regras de vitrine já aplicadas a montante).
- Copy: nenhum rótulo do bowl contém “gol”.
- Canal restrito: o helper **não** filtra isolamento — o caller já entrega o
  conjunto visível (invariante documentada; não duplicar R5 aqui).

### Fora deste recorte

- Anel inferior/superior.
- Planta real, visitante, camarote, TO de outro clube.
- Escritas no clube / super-admin escolhendo setor pela TO.
- Seed obrigatório de Gaviões (opcional depois; a visão degrada para “sem bowl”
  até a Sede cadastrar).

### DoD

- Associe-se: com ≥1 TO do clube com setor, o bowl aparece; clique filtra;
  canal restrito não pinta.
- Onboarding passo Torcida: o mesmo, sem quebrar o card de torcedor global.
- Admin picker continua funcionando (paths extraídos, não copiados à mão em
  dois arquivos).
- `pnpm --filter @torcida/web test` nos testes de setor + onboarding-torcidas.
- Sem `schema.prisma`. Sem `db:push`.
