# Identidade visual e cores — rivalidade no design

> Inteligência de domínio para o módulo Design e qualquer UI que pinte a
> marca da torcida. Complementa [`cultura-ideologia.md`](cultura-ideologia.md)
> (símbolos) e [`aliancas.md`](aliancas.md) (rivalidade: não sugerir aliado,
> moderar, **e** isolar UX/dados). Aqui o foco é **não pintar a casa com a
> cor do rival**.

**Consumidores:** `ux-review`, `implementation`, `product-strategy`,
`qa-verification`, `aliancas-torcidas` (avisos de cor). Spec técnica:
[`docs/data/modulo-design.md`](../data/modulo-design.md).

**Atualizado:** 2026-07-17 (estúdio Design + Gaviões / Corinthians).

## Por que isso importa

Cores da torcida e do time afiliado são patrimônio afetivo. Errar a cor
(principalmente **injetar verde** numa identidade alvinegra/rubro-negra) é
lido como ofensa ou desconhecimento do nicho — não como “escolha de UX
genérica”. O mesmo vale para **todas** as torcidas, não só Gaviões da Fiel.

Exemplos clássicos (Brasil):

| Identidade | Cores centrais | Cor sensível (rival / estranha) |
|---|---|---|
| Corinthians / Gaviões | preto, branco (+ vermelho de apoio) | verde (Palmeiras) |
| Flamengo / Nação | vermelho, preto | verde/branco de rival histórico em certos contextos |
| Palmeiras / Mancha | verde, branco | — verde **é** a marca |
| São Paulo | vermelho, preto, branco | — |
| Grêmio | azul, preto, branco | — |

Regra: **só use verde em ações/sugestões se a identidade da torcida ou do
clube afiliado já for verde.** Caso contrário, positivo/sucesso usa azul
neutro (`#1d4ed8`) ou tom derivado da marca — nunca emerald “de dashboard”.

## Regras de produto (obrigatórias)

1. **Prioridade das sugestões de paleta**  
   Exatamente **3** cards: marca da **torcida** (catálogo por slug — ex.
   Gaviões `#1a1a1a` — **nunca** o roxo `#7c3aed` da plataforma quando a cor
   do tenant ainda é o default) → escudo/logo → paleta do **clube** afiliado.
   Sem harmônicas genéricas, mono ou alto contraste na lista sugerida.

2. **Três cores por card**  
   Cada paleta sugerida exibe no máximo **3** swatches: primária ·
   secundária · destaque (accent do clube ou danger). Hex visível sob a
   barra.

3. **Preto é preto**  
   Cores quase neutras (P&B/cinza) **não** ganham saturação artificial no
   clamp de luminância — isso virava marrom e quebrava Gaviões/Corinthians/
   Vasco/Botafogo etc.

4. **Verde fora de contexto**  
   Filtrar de swatches e de cores extraídas do escudo quando a identidade
   não é verde (`isVerdeIdentidade` / `filtrarVerdeForaDeContexto` em
   `packages/types/src/design.js`).

5. **Contraste com marca escura**  
   Texto/ícone ativo na topbar e no menu admin **nunca** usa a primária
   crua como foreground se ela for quase preta. Usar `--color-*-fg`
   (`corMarcaLegivel` / `ajustarParaContraste`) + anel/ring de seleção.
   Badges soft idem. No tema **claro**, P&B fica em papel branco (sem misturar
   o preto no cinza) e secundária branca ganha fill/anel para o botão não sumir.

6. **Sucesso ≠ verde universal**  
   Default de `actions.success` = azul. Verde só via `derivarAcoesDaMarca`
   quando a marca/clube já carrega verde.

## O que não fazer

- Sugerir paletas “bonitas” de color-theory sem olhar afiliação.
- Hardcodar `emerald-*` / `#059669` em CTAs de RSVP, contraste OK, ou
  botões “positivo” no estúdio.
- Tratar personalização visual como cosmético de SaaS genérico — no nicho
  é identidade e rivalidade.
- Expor seletor intermediário confuso (popover) antes do color picker
  nativo no admin Design.

## Ligação com rivalidade de dados

A rivalidade em `aliancas.md` / `SaasRivalidade*` bloqueia **visibilidade**
e recomendações de aliados. A regra de **cor** é paralela e preventiva:
mesmo sem grafo de rival carregado, não inventar hue típico do rival na UI
da torcida. Se houver fato novo de “cor ofensiva” por praça, registre aqui
com fonte + data (mesmo protocolo do README de knowledge).
