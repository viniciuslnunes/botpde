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

O trilho usa `--grid-base` (a mesma tinta do `.app-shell-bg`), não
`transparent`. No Chromium a track transparente pinta o canvas do `<html>` —
mais preta que a grade — e vira filete à direita do painel.

## Sem calha no `<html>`

`scrollbar-gutter: stable` no `<html>` **não** entra. Admin, portal e
super-admin são `h-dvh` com o scroll no `<main>`: a viewport quase nunca
transborda, mas a calha reserva 12px mesmo assim. Com barra overlay (Windows 11,
Chrome, macOS) esse espaço fica vazio — filete preto à direita da barra do
painel, grade do `.app-shell-bg` parando antes da borda. Medido em
`/admin/design`.

A compensação de modal (barra clássica some com `body{overflow:hidden}`) fica em
`lockBodyScroll`: `padding-right` igual à largura da barra, só quando ela
existe. Overlay (`gutter === 0`) não desloca nada.

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

## Trilho horizontal: as setas do desktop (`ScrollRail`)

`.app-scrollbar-none` esconde a barra em todo trilho de abas. No toque isso é
correto — o dedo arrasta, e a barra overlay sumiria sozinha. No mouse ele apagava
a **única** pista de que existe aba fora da largura da coluna, e ali não há gesto
de arrastar equivalente: aba escondida virava aba inalcançável. Era o caso das
abas de módulo do admin em coluna estreita, do fórum da praça e da top bar do
portal entre 1280px e ~1500px.

`components/ui/scroll-rail.tsx` resolve o conjunto: envolve o trilho num wrapper
posicionado e sobrepõe uma seta em cada ponta.

- **Aparece por medição, nunca por contagem de itens.** `ResizeObserver` no
  trilho **e em cada filho** (a largura do trilho é a do pai — trocar de aba ou
  ganhar um badge muda o `scrollWidth` sem redimensionar o container),
  `MutationObserver` para item que entra/sai, e o evento de `scroll`. Tudo
  coalescido num `requestAnimationFrame`, que de quebra evita `setState`
  síncrono dentro do efeito (ver `react-compiler.md`).
- **Cada seta é independente:** a da esquerda só acende com `scrollLeft > 2px`
  (tolerância de subpixel), a da direita só enquanto sobrar conteúdo. Trilho que
  cabe inteiro não mostra nenhuma — é o "reativo" do pedido.
- **Só com ponteiro fino** (`(hover: hover) and (pointer: fine)`, via
  `useMediaQuery`): no toque a seta cobriria uma aba para resolver um problema
  que o dedo já resolve. Snapshot do servidor é `false`, então as setas entram
  depois da hidratação, sem divergência de HTML.
- **O esmaecimento é `mask-image`, não gradiente colorido.** O mesmo trilho
  aparece sobre card (`--surface`) e sobre página (`--background`); a máscara
  esvanece para transparente e serve os dois sem saber em qual está.
- **Fora da árvore de acessibilidade** (`aria-hidden` + `tabIndex={-1}`, os dois
  juntos — elemento focável escondido de AT é erro): quem usa teclado já anda
  pelas abas com as setas do teclado, e o foco rola o trilho sozinho. Por isso as
  setas moram no **wrapper**, nunca dentro do `role="tablist"`/`<nav>` — botão
  que não é aba dentro de um tablist é erro de ARIA. O wrapper é um `div` neutro
  e o trilho continua sendo a tag semântica (`as="nav"`).
- Rolagem de ~80% da largura visível, com `behavior: smooth` gateado por
  `prefers-reduced-motion`. Sobra sempre uma aba de âncora entre um clique e o
  seguinte.

Uso:

```tsx
<ScrollRail as="nav" aria-label="Seções do fórum" className="flex gap-5 px-1">
```

`className` vai para o trilho (o que rola, e o que recebe `role`/`aria-label`/
teclado); `wrapperClassName` para o que ocupa o lugar no layout do pai
(`flex-1`, `hidden xl:block`). `app-scrollbar-none` e `overflow-x-auto` já vêm
embutidos — não repita, e não reintroduza `[scrollbar-width:none]` ao lado do
webkit (é a armadilha das duas APIs, no topo deste doc).

Aplicado hoje: `AdminTabs` — e com ele todo o admin, incluindo
`AdminModuleTabs`/`AdminModuleTabBar` e `AdminPendingTabs` —, `MotionTabBar`,
`ComunidadeTabBar`, abas do fórum, pills da praça, abas do perfil, categorias da
loja e do cardápio do bar, seções do departamento, controle de acesso, filtros da
linha do tempo (Memória) e os dois trilhos de navegação da top bar do portal.

Fora de propósito: carrossel de mídia (`post-media`, `story-rings`, reels), que
tem controle próprio; tabela com `overflow-x-auto`, onde a barra é visível e a
seta atrapalharia; e trilho `lg:hidden`, que só existe no mobile (calendário da
Memória).

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
