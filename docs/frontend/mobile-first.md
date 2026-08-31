# Mobile-first — utilitários de toque, regras globais e armadilhas

O produto vira app iOS/Android, então telefone é o alvo, não uma adaptação.
Este guia é o "como fazer"; a decisão e o histórico das duas rodadas de
auditoria estão em `ARCHITECTURE.md` §5.20 e §5.20.1.

Regra de ouro: **quase tudo aqui já é global ou já existe como utilitário.**
Antes de escrever `min-h-11` na mão, confira se não é caso de uma das quatro
classes abaixo — ou de nada, porque a regra global já resolveu.

---

## 1. As quatro classes de alvo de toque

Todas valem **só** em `@media (pointer: coarse)`. No mouse a densidade do
desktop fica exatamente como está.

| Classe | Quando | O que faz |
|---|---|---|
| `.app-action` | Botão/ícone comum | 2.5rem no mouse, **2.75rem nos dois eixos** no toque |
| `.app-touch-target` | UI densa (abas, paginação, tabela) | 2.75rem nos dois eixos **só no toque** — não engorda o desktop |
| `.app-touch-line` | Link de texto solto, cabeçalho de coluna | Área de 44×44 por **pseudo-elemento**, sem mexer no layout |
| `.app-inset-x` | Barra que atravessa a tela | Reserva o recorte lateral (notch em paisagem) |

### `.app-action` vs `.app-touch-target`

`.app-action` impõe 2.5rem **também no mouse**. Numa tabela de admin isso
engorda a linha de quem opera no desktop — por isso a paginação e as abas de
módulo usam `.app-touch-target`, que só cresce no toque.

### A válvula `min-w-0` — importante

O `min-width` das duas primeiras é `:not(.min-w-0)`. Não é detalhe:

> A regra é *unlayered* e venceria o `min-w-0` do Tailwind. Um botão declarado
> `min-w-0 flex-1` está dizendo "preciso encolher". Forçar 44px de largura nele
> fez o card de patrimônio **cortar 20px** em 320px — regressão introduzida
> pela própria correção de alvo.

Se o seu elemento precisa encolher, declare `min-w-0` e use `.app-touch-line`,
cuja área cresce por pseudo-elemento sem disputar largura.

### `.app-touch-line` — onde NÃO usar

A faixa de 44px se sobrepõe na vertical. Use **só onde o link está sozinho na
linha**; perto de outro controle ela rouba o toque do vizinho. Em cabeçalho de
tabela é seguro: os vizinhos são horizontais.

### `.app-inset-x`

Com `viewportFit: 'cover'` a página ocupa a tela inteira e, em paisagem, o
notch come ~44px de um lado — `px-4` (16px) esconde o conteúdo embaixo dele. O
`.app-container` já faz isso para o conteúdo, mas barra `fixed`/`sticky` vive
fora dele. Folga base configurável: `[--app-inset-x:0.75rem]`.

---

## 2. As regras globais (não reimplemente na mão)

Em `apps/web/src/app/globals.css`, todas sob `pointer: coarse`:

- **Fonte de 16px** em input/select/textarea. Abaixo disso o Safari do iPhone
  amplia a página ao focar e **não desfaz** o zoom. A correção é a fonte, nunca
  `maximum-scale=1` — isso mataria o zoom por gesto (WCAG 1.4.4).
- **`min-height: 2.75rem`** em input e select (textarea fora: a altura dele é o
  número de linhas, não um alvo).
- **`min-height`/`min-width: 1.5rem`** em checkbox/radio — mínimo da WCAG 2.5.8.
  44px deixaria a caixa desproporcional ao texto, e o rótulo associado já
  amplia a área.
- **Piso de altura em todo controle** (`a[href]`, `button`, `[role=button]`,
  `[role=tab]`, `summary`). Uma regra cobriu ~58 assinaturas espalhadas.

### Por que o piso global é seguro

Não é sorte, é semântica: **`min-height` não se aplica a elemento inline não
substituído**. Link no meio de um parágrafo continua intacto sozinho; só
`inline-flex`/`flex`/`block` crescem — exatamente o alvo. E cresce só na
vertical, então não alcança o modo de falha que interessa evitar (estouro
horizontal).

Ficam de fora, de propósito: `.absolute`/`.fixed` (badge sobreposto de 16px —
esticar deformaria sem ganhar área), `.app-touch-line` (cuja razão de existir é
não mexer no layout), `.sr-only`, e o escape explícito **`.app-sem-piso-toque`**
para UI densa que precise.

---

## 3. O que NÃO se corrige

Nem todo alvo abaixo de 44px é defeito. Dois casos ficaram de fora por decisão:

- **Célula de calendário** (~35–37px de largura). Grade de 7 colunas em 320px
  dá ~45px por coluna menos os gaps. Não existe versão de 44px sem rolagem
  horizontal, e o alvo real tem 47–62px de altura.
- **Badge de fechar canal, 16×16**, `absolute` sobre o avatar.

Mudar esses dois pioraria a interface para satisfazer um número.

---

## 4. Ferramentas

```bash
pnpm --filter @torcida/web lint:mobile        # 4 regras, CI, sem app nem banco
pnpm --filter @torcida/web rotas:dinamicas    # resolve ids reais do banco
npx playwright test e2e/responsivo.measure.ts --project=measure
```

O lint é a **única** rede para safe-area (ver armadilha 4), então ele próprio é
testado: `src/lib/__tests__/lint-mobile.test.ts` roda o script contra fixtures e
exige que dispare nas violações e fique quieto nas exceções legítimas. Lint que
nunca dispara é pior que nenhum — dá sensação de cobertura.

A quarta regra é fora do tema mobile e mora ali por conveniência: comentário
`///` do Prisma contendo a sequência que fecha um bloco JSDoc. O Prisma copia
esses comentários para dentro de `/** */` no `index.d.ts`, o comentário termina
no meio, o resto do arquivo vira código e o `tsc` quebra com
"Unterminated regular expression literal" **a 60 mil linhas da causa**.

---

## 5. Armadilhas de método (todas custaram caro)

1. **Medir sem `hasTouch`/`isMobile` mente.** É o que faz o Chrome casar
   `pointer: coarse`. Sem isso mede-se a versão "mouse" do layout mobile:
   `.app-action` reporta 40px em vez de 44 e o piso de 16px nem entra em vigor.
2. **Relatório limpo pode ser dev server morto.** O Turbopack recompilando 28
   rotas sob o Playwright estourou o heap (13,7 GB) e todas as páginas voltaram
   vazias — registrado como "zero defeitos". Por isso a auditoria grava
   `totalElementos` por rota, e a varredura é **rota-major**.
3. **O dev server serve CSS obsoleto sem mudar o nome do chunk.** Uma regra nova
   não entrou no bundle e a URL continuou idêntica; a auditoria mediu 32px em
   elementos que já tinham a classe de 44px e "provou" que a correção falhara.
   `touch` não resolve (o hash é do conteúdo). Baixe o chunk e confira a regra
   antes de acreditar no relatório.
4. **Safe-area não é medível em headless.** Sem notch,
   `env(safe-area-inset-bottom)` resolve para 0 e o padding correto fica
   indistinguível do errado. Por isso virou lint estático.
5. **Skeleton não é defeito.** `.skeleton-sweep::after` vive em
   `translate3d(±105%)`, o que dobra o `scrollWidth`, e o `overflow: hidden` do
   cartão é justamente o que contém a animação. Auditoria que capture uma tela
   em carregamento vai acusar "corta 399px" — é falso positivo, e "corrigir"
   quebraria a animação.
6. **Descobrir rota dinâmica varrendo `<a href>` não funciona neste app.** Canal
   abre com `<button>` + `router.push`, `/portal/sedes` é master-detail e nada
   aponta para `/portal/sedes/[id]`, e `/admin/torcedores/[id]` só é linkado de
   dentro de um modal. Os ids vêm do banco — e **escopados ao tenant do usuário
   de teste**, senão a rota redireciona e mede-se a página errada.

---

## 6. Dois bugs que a auditoria achou e não eram de responsividade

Ficam aqui porque o padrão se repete, não o arquivo.

- **Função pura exportada de módulo `'use client'`.** `/admin/aliancas` respondia
  200 e renderizava só `"Application error"` (19 elementos contra 423): o Server
  Component chamava `parseAliancaTabId` importado de um módulo client, o que
  devolve uma *referência* de client, não a função. Helper puro consumido pelos
  dois lados mora em módulo sem `'use client'` — ver `lib/alianca-tabs.ts`.
  Só apareceu porque o relatório grava `totalElementos`; sem isso a página
  quebrada seria "zero defeitos de responsividade" — verdade literal e
  completamente enganosa.
- **`aspect-[16/7]` + `min-h-[9rem]` inflando a LARGURA.** Em 320px a razão
  daria 124px de altura, o `min-h` força 144px, e a proporção devolve **329px de
  largura** num card de 284 com `overflow-hidden`. Um `w-full` fixa a largura e
  faz a razão calcular a altura, que é a intenção.
