# Barras de rolagem

Tokens em `apps/web/src/app/globals.css` (`:root` / `.dark`), regras na seção
`── Barras de rolagem`. Zero JS, zero bundle, zero biblioteca de scroll
customizado — é pintura do compositor.

## A regra que dita a forma do bloco

As duas APIs de scrollbar são **mutuamente exclusivas no Chromium**. Medido
aqui (Chromium headed, Windows, barra clássica):

| declaração | largura efetiva |
| --- | --- |
| nada | 15px (nativo) |
| `scrollbar-width: thin` | 10px |
| `::-webkit-scrollbar { width: 6px }` | 6px |
| `::-webkit-scrollbar` **+** `scrollbar-color` | **15px** — pseudo ignorado |
| `::-webkit-scrollbar` **+** `scrollbar-width: thin` | **10px** — pseudo ignorado |

Ou seja: declarar as duas "para cobrir todo mundo" é o erro clássico — desliga
em silêncio justamente a que desenha melhor. Por isso cada motor recebe **uma**
via:

- **Firefox** → `scrollbar-width` + `scrollbar-color` no `<html>` (herdam), sob
  `@supports (-moz-appearance: none) or (-moz-orient: inline)`. As duas
  condições foram medidas como falsas no Chromium — é um gate mais seguro que
  `@supports selector(::-webkit-scrollbar)`, que não distingue nada se um dia o
  Firefox aceitar o seletor. `scrollbar-color` herda o valor **já resolvido**,
  então variante que troca `--scrollbar-thumb` (`neutra`, `sobre-escuro`,
  `idle`) reaplica `scrollbar-color` dentro do mesmo `@supports`.
- **Chromium / Safari** → `::-webkit-scrollbar*`, que é o único caminho com
  raio, inset, `:hover` e `:active`.

**Nunca** reintroduzir `scrollbar-width: thin` num container específico: além de
redundante (o `thin` do Firefox já desce por herança do `<html>`), ele desliga o
`::-webkit-scrollbar` naquele elemento. Foi o que aconteceu no `meet-room.css`,
onde as duas declarações foram removidas.

## Reatividade à identidade do tenant

O polegar é `rgb(var(--color-primary-fg) / α)` — **`--color-primary-fg`, não
`--color-primary`**. É o mesmo motivo dos badges (ver `identidade-visual-cores.md`):
`-fg` é a marca já corrigida pelo `TenantDesignBridge` para ser legível **sobre
a superfície**, recalculada por tema. Com `--color-primary` cru, marca preta
sumiria no escuro e marca branca sumiria no claro.

Consequência: mudar a cor no `/admin/design` muda a barra de rolagem, nos dois
temas, sem uma linha de código.

Medido com marca `#991b1b`: trilho de 12px, polegar pintado de 6px, cor
`rgb(224,186,186)` = a marca a 30% sobre o branco.

## Anatomia

```
--scrollbar-size: 12px    trilho (área de hover e de arrasto)
--scrollbar-inset: 3px    borda transparente do polegar
                          → desenho de 6px, pegada de 12px
```

O inset é `border: var(--scrollbar-inset) solid transparent` +
`background-clip: padding-box`. O polegar respira sem encolher o alvo: a caixa
que recebe `:hover` e o arrasto continua valendo os 12px inteiros.

## `scrollbar-gutter: stable` no `<html>`

São 10+ lugares travando `document.body.style.overflow = 'hidden'` (AppModal,
lightbox, stories, reels, sidebar mobile) e **nenhum** compensava a largura da
barra. Medido: o conteúdo saltava de 785px para 800px a cada abertura de modal.
Reservar a calha resolve todos de uma vez. É no-op onde a barra é overlay
(toque, macOS), então não custa largura no alvo mobile.

Para container interno que não pode saltar quando a lista cresce e passa do
teto: `.app-scrollbar-gutter`.

## Variantes

| classe | quando |
| --- | --- |
| `.app-scrollbar-none` | trilho horizontal de abas/chips, feed com snap — a barra é ruído |
| `.app-scrollbar-fina` | painel denso: popover, dropdown, chat, sidebar (8px / inset 2px) |
| `.app-scrollbar-idle` | trilho secundário — só aparece em `:hover`/`:focus-within`. A calha continua reservada, então revelar não desloca nada. **Não** usar onde a barra é a única pista de que há mais conteúdo |
| `.app-scrollbar-neutra` | tinta do texto em vez da marca, onde a cor do tenant competiria com o conteúdo (grade de mídia, tabela densa) |
| `.app-scrollbar-sobre-escuro` | superfície escura **nos dois temas** (palco do Meet, visor de mídia). Ali `--foreground` e `--color-primary-fg` são calculados contra a superfície do app, não contra o preto do palco — no tema claro o polegar sumiria. Valor fixo, de propósito |

Aplicado hoje: `AppModalBody` e `AppFormDrawer` (pega o conjunto de
modais/drawers), `AnchoredPopover` (menus/menções), emoji e sticker picker,
sino de notificações, thread de DM e inbox, chat de sala, comboboxes
(região, contexto, busca da comunidade, filtro de listagem, loja),
sidebar do admin e do super-admin (`fina` + `idle`), `.meet-room-root`
(tokens escuros fixos), feed de reels (`none`).

## O que NÃO se faz aqui

- Biblioteca de scroll customizado (OverlayScrollbars e afins): custo de bundle
  e de main thread para o que o CSS já faz.
- Esconder a barra "para ficar limpo" em conteúdo longo. `.app-scrollbar-none`
  é para trilho de navegação e feed com snap, não para lista.
- `transition` no polegar: está declarado, mas o Chromium não anima
  pseudo-elemento de scrollbar de forma confiável. Não conte com ela; também
  não custa nada.
- No toque (iOS/Android) a barra é overlay e some sozinha: todo este bloco é
  no-op no alvo mobile-first.
