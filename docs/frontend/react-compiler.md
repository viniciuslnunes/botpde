# React Compiler — estado em render, não em effect

O `eslint-plugin-react-hooks` v6 (Next 16) traz as regras do React Compiler.
Elas ficam como **aviso** em `apps/web/eslint.config.mjs`, de propósito: sinalizam
débito real sem barrar o build.

Em 2026-08-12 o passivo caiu de **100 para 19** avisos. Este guia é o que
aprendemos ali — leia antes de escrever `useEffect` novo, e antes de "consertar"
um aviso destes por conta própria.

## Por que não é só lint

As duas regras que dominavam o passivo apontavam defeito de verdade:

- **`react-hooks/refs`** — `const xRef = useRef(v); xRef.current = v` no corpo do
  componente é escrita durante o render. Com render concorrente, um render
  descartado já teria sujado a ref.
- **`react-hooks/set-state-in-effect`** — `useEffect(() => setX(prop), [prop])`
  aplica o valor **um frame depois**. Esse frame é visível: menu que sobrevive à
  navegação, campo de busca com o termo antigo, lista ordenada errado, barra de
  persistência cinza com os CTAs desabilitados (o que a UX proíbe — ver
  `CLAUDE.md` § UX).

Achados concretos da limpeza:

- `feed-composer` media o DOM no render (`getClientRects()`) para saber se o
  gatilho "+" mobile existia. Era uma media query disfarçada, e errava no
  primeiro paint.
- `image-upload-field` guardava nome/tamanho do arquivo em ref, mas **lia no
  render**: a drop zone não re-renderizava ao trocar de arquivo, só pegava
  carona no render seguinte.
- As buscas com debounce mostravam o resultado do termo anterior sob o termo
  novo, porque a lista era zerada num effect.

## Primitivas (use estas antes de inventar)

| Hook | Quando | Onde |
| --- | --- | --- |
| `useLatestRef(v)` | ref que só precisa carregar o valor mais recente para effects/handlers | `lib/use-latest-ref.ts` |
| `useHidratado()` | conteúdo que só existe no browser (portal, storage, medida) | `lib/use-hidratado.ts` |
| `useMediaQuery(q)` | decisão por breakpoint **depois** de hidratar | `lib/use-media-query.ts` |
| `useOnline()` | `navigator.onLine` reativo | `lib/use-online.ts` |

`useLatestRef` escreve em `useInsertionEffect`, que roda **antes** dos layout
effects, dos effects e de qualquer handler: quem lê a ref de dentro de effect,
handler, timer ou callback assíncrono continua vendo o valor daquele render.
O que ele **não** cobre é leitura durante o render — aí use o valor direto.

O ESLint não sabe que hook custom devolve ref estável, então ele pede a ref nas
deps do effect. **Inclua**: a identidade do objeto não muda, nenhum effect passa
a re-rodar.

## Receitas

### 1. Sincronizar com prop do servidor

O RSC revalida sem desmontar o componente. Ajuste **no render**, comparando com
o último valor sincronizado — padrão oficial do React:

```tsx
const [itens, setItens] = useState(itensIniciais)
const [sincronizado, setSincronizado] = useState(itensIniciais)
if (itensIniciais !== sincronizado) {
  setSincronizado(itensIniciais)
  setItens(itensIniciais)
}
```

Serve igual para "fechar menu ao navegar" (chave = `pathname`) e "resetar ao
trocar de item" (chave = id).

### 2. Busca com debounce

Não zere `resultados`/`carregando` dentro do effect. Guarde o **par
(termo, itens)** da última busca concluída e derive o resto:

```tsx
const [busca, setBusca] = useState({ termo: '', itens: [] })
const termoBusca = q.trim().length >= 2 ? q.trim() : ''
const visiveis = busca.termo === termoBusca ? busca.itens : []
const carregando = termoBusca !== '' && busca.termo !== termoBusca
```

O effect só grava **depois do await** — inclusive em falha, senão o
"carregando" derivado nunca desliga. Em `abort` não grave: quem assumiu a busca
é que vai gravar. De brinde, resultado de termo antigo deixa de aparecer sob o
termo novo.

### 3. Estado que era só derivação

Se o effect existe apenas para corrigir um estado que já é função de outros
valores, **não é estado**. Foi o caso do `viewport` dos mapas do Brasil (função
de busca/uf/região) e da aba do painel de mapa em `sede-forms`.

### 4. Browser como fonte externa

`useSyncExternalStore`, não effect + setState. O snapshot do servidor é o
neutro (`false` para media query, `true` para `useOnline`, `null` para storage).

## Armadilhas

- **Ref em render conta igual.** Trocar `setState` em effect por
  `ref.current = x` no render só troca `set-state-in-effect` por `refs`. Em
  `post-media` a saída foi a ref guardar **qual** versão do embed foi montada,
  em vez de um booleano que precisava ser zerado.
- **Não chame callback do pai durante o render.** Em `afiliacoes-console` o
  reset do form foi para o render, mas `onCriado?.()` ficou em effect: o pai
  pode dar setState, e isso seria render aninhado.
- **Cuidado com a semântica da dependência.** Em `sticky-persist-bar` o effect
  rodava só na **transição** de `locked` — focar a barra sem nada a salvar
  segurava ela aberta. Uma derivação ingênua teria matado esse comportamento.
- **Nem todo aviso é defeito.** Medição em `useLayoutEffect`
  (`anchored-popover`) é o uso correto do padrão.

## O que sobra (19, 2026-08-12)

**2 sem correção**, documentados no próprio arquivo:

- `sedes-map` — `react-hooks/immutability` na poda de markers. Limitação do
  compilador com interop imperativo do Google Maps. Tirar da ref piora: em
  `useState` ele passa a acusar também "cannot modify local variables".
- `use-mensagem-list-window` — "Compilation Skipped": o `useVirtualizer` do
  `@tanstack/react-virtual` mede e muta no render. É bailout informativo (o hook
  funciona, só não é memoizado); só sai trocando a biblioteca.

**17 `set-state-in-effect`**: `wizard` (4, restauração de rascunho do
sessionStorage — o mais entrelaçado), `nickname-field` (2),
`anchored-popover` (2), `sedes-explorer` (2),
`use-comunidade-canal-atividade` (2) e 5 avulsos.

A parada foi por julgamento: nesses a reescrita mexe em fluxo de verdade e o
ganho é menor que o risco de regressão em tela sem teste de UI. Ataque **um por
vez**, conferindo a tela depois de cada um — não em lote.
