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
   Default de `actions.success` = azul na plataforma. Verde entra quando a
   identidade já é verde **ou** quando o arquirrival é outra família e o
   motor recolore o azul default (Galoucura × Máfia Azul → verde da Mancha,
   aliada). Gaviões continua sem verde: o tabu é o dado `#006437`.

7. **Cor de arquirrival é dado**  
   Cada clube tem um hex curado em `CLUBE_COR_ARQUIRRIVAL` (Gaviões/Corinthians
   → `#006437` Palmeiras; Galoucura/Atlético-MG → `#003da5` Cruzeiro). Se o
   primeiro clássico **compartilha o P&B** (Santos × Corinthians), essa
   rivalidade não gera hue a isolar — `proporCorArquirrival` pula e pega o
   próximo (Palmeiras / Mancha verde). Accent do rival alvinegro (bordo) não
   conta. Curadoria `null` vence o walk (Cruzeiro × Galo não inventa verde
   América). A unidade confirma ou escolhe o hex em Design › Identidade
   (`brand.arquirrival`); vazio no JSON ainda usa o catálogo em runtime
   (`Tenant.corArquirrival`). A UI (`resolverCorSemRivalidade` nos
   departamentos, `sanearAcoesContraRivalidade` nos tokens `actions.*`) usa
   esse hex. **A família do arquirrival não pinta o painel em hipótese alguma**
   (nem `sky-*` / `blue-*` / `#2563eb` crus). Aliada (Mancha × Galoucura) pode.

## O que não fazer

- Sugerir paletas “bonitas” de color-theory sem olhar afiliação.
- Hardcodar `emerald-*` / `green-*` / `#059669` em CTAs de RSVP, carteirinha,
  toasts, contraste OK, ou botões “positivo”. Usar `.text-success` /
  `.alert-success` / `.btn-success` (`actions.success`). **Tipo de unidade
  (Sede/Subsede/PDE) também:** tokens `--color-primary` / muted / secondary,
  nunca `bg-emerald-*` / `bg-blue-*`. CI: `pnpm --filter @torcida/web lint:rival-hues`.
- Pintar card de departamento com a cor canônica crua (`#047857` financeiro,
  `#4d7c0f` carnaval) sem `resolverCorSemRivalidade` — isso é verde de
  Palmeiras na casa de Gaviões (e azul de Grêmio na casa do Inter, etc.).
- Deixar `actions.info` / badge Aviso / `.alert` informativo no azul padrão
  (`#2563eb`) quando o arquirrival da unidade for azul (Galoucura × Máfia Azul).
  Tokens de ação passam por `sanearAcoesContraRivalidade`.
- Hardcodar `sky-*` / `blue-*` / `indigo-*` / `#2563eb` em fluxo de tenant
  (ensaio, inbox, mapa, pedido confirmado, **badge SUBSEDE**, cargo Vice).
  Usar `--color-info` / `--color-success` / marca — o token já foi saneado
  contra o arquirrival. Hex gravado (departamento, cargo) passa por
  `resolverCorSemRivalidade` na leitura e na escrita.
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
