# Motion — guia de animações (`apps/web`)

Documentação de referência para animações com [Motion](https://motion.dev/) (pacote
`motion` v12). Hoje o **`MotionShell`** está montado em `/portal/comunidade`; este
guia serve de base para estender o mesmo vocabulário a Loja, Onboarding, Salas,
Mensagens e Admin.

## Princípios

1. **Consistência** — usar presets de `@/lib/motion-presets`, não springs ad hoc.
2. **Leveza** — `LazyMotion` + `domAnimation` (só animações DOM necessárias).
3. **Acessibilidade** — `MotionConfig reducedMotion="user"` no shell; não animar
   informação crítica só com movimento.
4. **Performance** — preferir `opacity`/`transform`; evitar animar `width`/`height`
   em listas longas exceto com `collapsePanel` em painéis pequenos.
5. **Escopo** — animações vivem em Client Components; Server Components importam
   wrappers client (`MotionReveal`, `ComunidadePostsAnimated`, etc.).

## Infraestrutura

### Pacote e import

```tsx
import { m, AnimatePresence } from 'motion/react'
```

Dentro de `MotionShell` com `LazyMotion strict`, use sempre **`m`**, nunca `motion`
(import completo quebra o lazy load).

### `MotionShell`

Arquivo: `apps/web/src/components/motion/motion-shell.tsx`

- Envolve rotas que usam `m` / `AnimatePresence`.
- Hoje: `apps/web/src/app/portal/comunidade/layout.tsx`.
- **Para expandir:** montar também em `apps/web/src/app/portal/layout.tsx` (portal
  inteiro) ou por módulo (`loja/layout.tsx`, `onboarding/layout.tsx`).

```tsx
<MotionShell>
  {children}
</MotionShell>
```

### Presets centrais

Arquivo: `apps/web/src/lib/motion-presets.ts` — **fonte única** de timings e variants.

| Export | Tipo | Uso |
|--------|------|-----|
| `springSnappy` | Transition | Botões, dock, menus, taps, indicadores de aba |
| `springGentle` | Transition | Painéis, expansões, transições de rota, listas |
| `reactionPop` | Transition | Bounce de reações (engajamento) |
| `fadeUp` | Variants | Entrada de cards, empty states, itens de lista |
| `fadeScale` | Variants | Troca de estado compacta (ex.: badge “Pendente”) |
| `popoverPanel` | Variants | Dropdowns, pickers, painéis flutuantes (`hidden` / `show` / `exit`) |
| `staggerContainer` | Variants | Pai de listas — `staggerChildren: 0.05` |
| `staggerItem` | Variants | Filho de lista (fade + slide Y) |
| `menuItemStagger` | Variants | Itens de menu com delay por índice (`custom={i}`) |
| `collapsePanel` | Variants | Expand/collapse de formulários e seções |
| `storySlideVariants` | Variants | Slide horizontal com `custom={dir}` (±1) |
| `routePage` | Variants | Transição entre rotas (`initial` / `animate` / `exit`) |
| `lightboxBackdrop` | Variants | Overlay fullscreen (stories, fotos, reels) |
| `lightboxContent` | Variants | Zoom suave do conteúdo do lightbox |
| `cartItemExit` | Variants | Saída de linha ao remover item da sacola |
| `heartBurst` | Variants | Burst de anel atrás do ícone ao curtir (expande e desaparece) |
| `bookmarkDrop` | Transition | "Drop" ao salvar (bookmark) — assinatura própria, distinta do bounce genérico |
| `shareSpin` | Transition | Giro de 360° do ícone ao confirmar compartilhar/repost |

### Componentes reutilizáveis (genéricos)

| Componente | Arquivo | Quando usar |
|------------|---------|-------------|
| `MotionReveal` | `components/motion/motion-reveal.tsx` | Um item em lista SSR; prop `index` limita delay (máx. 0,28s) |
| `MotionRevealOnce` | `components/motion/motion-reveal-once.tsx` | Como `MotionReveal`, mas só anima na 1ª aparição de um `id` na sessão — evita replay quando itens remontam (ex.: virtualização) |
| `OptimisticHighlight` | `components/motion/optimistic-highlight.tsx` | Anel de destaque que se dissipa sozinho (~1,6s) ao redor de um item recém-inserido de forma otimista, sem depender de re-render externo pra sumir |
| `MotionEmptyState` | `components/motion/motion-empty-state.tsx` | Estados vazios com `icon`, `title`, `description` |
| `StickyPersistBar` | `components/sticky-persist-bar.tsx` | Rodapé Salvar/Cancelar fixo no viewport (ver padrão abaixo) |

**Padrão "seenIds" para listas virtualizadas:** quando uma lista usa
`@tanstack/react-virtual` (ou virtualização equivalente), itens fora do overscan
são desmontados e remontados ao rolar — se o wrapper de entrada (`MotionReveal`)
rodar a cada mount, o item já visto "reaparece" com fade/slide, gerando jank.
Solução: manter um `useRef<Set<string>>(new Set())` de ids já vistos no
componente pai da lista e usar `MotionRevealOnce` no lugar de `MotionReveal`,
passando esse ref (`seenIds`) e o `id` estável do item. Ver uso em
`comunidade-feed-infinite.tsx` (`useFeedWindow`). Módulos futuros com
virtualização (Loja, Eventos) devem reaproveitar `MotionRevealOnce` em vez de
reimplementar o controle de "já visto".

### Barra de persistência (`StickyPersistBar`)

**Regra da aplicação** em admin, departamentos (cargos/áreas), loja e onboarding.
**Não usar na Comunidade** (lá o chrome sticky é busca/tabs/dock via
`useScrollChromeVisibility`).

Comportamento (`usePersistBarVisibility`):

- sem alterações: começa **oculta** (sem flash); scroll → aparece; idle (~1,8s) ou
  clique fora do form → some
- `locked` (dirty / pending / foco na barra) → permanece, com borda de destaque
- ao sair de `locked` (salvar / descartar / **reverter campos ao baseline**) →
  **some na hora** — não fica no estado cinza com hint/atalho sumidos e CTAs
  disabled (regressão 2026-07-17; fix em `use-persist-bar-visibility` +
  limpeza de `focusLocked` em `StickyPersistBar`)
- Ctrl/Cmd+S salva quando `saveShortcut` (default) e há `type="submit"`
- spacer de conteúdo é interno (não precisa de `StickyPersistBarSpacer`)

```tsx
<form id={formId} data-persist-bar-root="" …>
  {/* campos */}
  <StickyPersistBar
    locked={isDirty || pending}
    dirtyLabel={isDirty ? `${n} alterações` : undefined}
    hint="…"
  >
    <button type="button">Cancelar</button>
    <button type="submit" form={formId}>Salvar</button>
  </StickyPersistBar>
</form>
```

O submit usa `form={formId}` porque a barra renderiza via portal em `document.body`.
CTAs sem save (ex.: onboarding Continuar) usam `saveShortcut={false}`.

### Componentes da Comunidade (modelo para outros módulos)

| Componente | Arquivo | Padrão a replicar |
|------------|---------|-------------------|
| `ComunidadeRouteTransition` | `comunidade/_components/comunidade-route-transition.tsx` | `AnimatePresence mode="wait"` + `key={pathname}` |
| `ComunidadePostsAnimated` | `comunidade/_components/comunidade-posts-animated.tsx` | Lista + empty state + `MotionReveal` |
| `ComunidadeTabBar` | `comunidade/_components/comunidade-tab-bar.tsx` | Abas com `layoutId` no indicador |
| `ComunidadeMemberList` | `comunidade/_components/comunidade-member-list.tsx` | `staggerContainer` + cards de membro |
| `SeguimentoPendentesList` | `comunidade/_components/seguimento-pendentes-list.tsx` | Lista mutável com `AnimatePresence mode="popLayout"` |

Ao criar Loja/Onboarding, prefira extrair padrões genéricos para `components/motion/`
(ex.: `MotionTabBar`, `MotionList`, `MotionRouteTransition`) em vez de duplicar.

---

## Catálogo de padrões

### 1. Feedback de toque (`whileTap`)

Botões e chips interativos:

```tsx
<m.button whileTap={{ scale: 0.96 }} transition={springSnappy}>
  Entrar
</m.button>
```

**Onde está:** dock, grupos/canais, seguimento, story rings, destaques, reels.

### 2. Listas com stagger

```tsx
<m.div variants={staggerContainer} initial="hidden" animate="show">
  {items.map((item) => (
    <m.div key={item.id} variants={staggerItem} layout>
      {/* card */}
    </m.div>
  ))}
</m.div>
```

**Onde está:** grupos, canais, unidade (comunicados/eventos), seguidores, aside,
`videos-grid`, notificações, busca.

**Listas server-rendered** (sem estado client no pai):

```tsx
{posts.map((post, index) => (
  <MotionReveal key={post.id} index={index}>
    <FeedPostCard post={post} />
  </MotionReveal>
))}
```

Ou wrapper `ComunidadePostsAnimated` / futuro `MotionPostList`.

### 3. Abas com indicador deslizante (`layoutId`)

```tsx
{ativo && (
  <m.span
    layoutId="perfil-tab-indicator"
    className="absolute inset-x-0 -bottom-px h-0.5 bg-[rgb(var(--primary))]"
    transition={springSnappy}
  />
)}
```

**Regra:** um `layoutId` por grupo de abas na mesma tela (feed Descobrir/Seguindo,
perfil, grupo, unidade, vídeos Reels/Grade).

### 4. Popovers e dropdowns

```tsx
<AnimatePresence>
  {open && (
    <m.div
      variants={popoverPanel}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={springSnappy}
    >
      {items.map((item, i) => (
        <m.button key={item.id} custom={i} variants={menuItemStagger} initial="hidden" animate="show" />
      ))}
    </m.div>
  )}
</AnimatePresence>
```

**Onde está:** emoji/sticker/mention pickers, menu do post, busca rápida, seguir.

### 5. Expand / collapse

```tsx
<AnimatePresence>
  {expanded && (
    <m.div variants={collapsePanel} initial="hidden" animate="show" exit="exit" transition={springSnappy}>
      {/* conteúdo */}
    </m.div>
  )}
</AnimatePresence>
```

**Onde está:** composer (enquete/evento), grupos/canais (criar), comunicados,
destaques (criar), comentários/repost no engajamento.

### 6. Transição de rota

```tsx
<AnimatePresence mode="wait">
  <m.div key={pathname} variants={routePage} initial="initial" animate="animate" exit="exit" transition={springGentle}>
    {children}
  </m.div>
</AnimatePresence>
```

**Onde está:** `comunidade/layout.tsx` via `ComunidadeRouteTransition`.

**Para portal global:** mesmo padrão em `portal/layout.tsx` com `key={pathname}`.

### 7. Troca de conteúdo (abas locais)

```tsx
<AnimatePresence mode="wait">
  {aba === 'mural' && (
    <m.div key="mural" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={springSnappy}>
      {/* painel */}
    </m.div>
  )}
</AnimatePresence>
```

**Onde está:** grupo detalhe, unidade perfil, vídeos grid/reels.

### 8. Lightbox / viewer fullscreen

1. Portal em `document.body` para escapar de `transform` de ancestrais.
2. `mounted` via `setTimeout(..., 0)` (evita lint `set-state-in-effect`).
3. Backdrop: `lightboxBackdrop`; conteúdo: `storySlideVariants` ou `lightboxContent`.
4. Swipe: `drag="x"` + `onDragEnd` com threshold ~72px.

**Onde está:** `story-viewer`, `destaque-viewer`, `perfil-fotos-grid`, `videos-reels-feed`.

### 9. Estado otimista com `AnimatePresence mode="wait"`

Troca visual entre estados de UI (ex.: Seguir → Pendente → Seguindo):

```tsx
<AnimatePresence mode="wait">
  {status === 'APROVADO' ? <m.div key="seguindo">...</m.div> : ...}
</AnimatePresence>
```

**Onde está:** `seguimento-buttons`, `SeguimentoReviewButtons`.

### 10. Contadores e layout dinâmico

```tsx
<m.span layout transition={springSnappy}>{count}</m.span>
```

**Onde está:** `post-engagement` (reações e totais).

### 11. Barras de progresso (stories / destaques)

```tsx
<m.div
  initial={false}
  animate={{ width: `${progress}%` }}
  transition={i === ativo ? { type: 'tween', duration: 0.08 } : springSnappy}
/>
```

---

## Mapa de cobertura atual (Comunidade)

| Área | Animações aplicadas |
|------|---------------------|
| Layout | `MotionShell`, `ComunidadeRouteTransition` |
| Feed | `MotionReveal`, `ComunidadeFeedEmpty`, tabs com `layoutId` |
| Composer | expand, pickers, menu `+` mobile, prévia de mídia (entrada/saída + barra de progresso real) |
| Posts | engajamento, enquete, menu, stagger |
| Stories | rings, viewer, slide, progresso |
| Busca / notificações | popover, stagger, filtros com `layoutId` |
| Grupos / canais | listas, detalhe, abas, empty states |
| Unidade | abas mural/comunicados/eventos |
| Perfil | tabs, destaques, fotos, atividade, publicações |
| Rede / salvos / hashtag / post | `ComunidadePostsAnimated`, `MotionReveal` |
| Seguir / solicitações | botões, review, listas de membros |
| Vídeos | reels imersivo (snap, progresso, double-tap, rail), grid→fullscreen, Em alta |
| Aside | `MotionReveal` nos widgets; salas ao vivo stagger |
| Comunicados | collapse + stagger nos itens |
| Painel de conversa (rail) | `collapsePanel` no expand/collapse (shell fica montado), chevron rotativo, badge com pop, skeleton pulsante |

---

## Como estender a outros módulos

### Passo 1 — Montar o shell

```tsx
// apps/web/src/app/portal/layout.tsx (recomendado para cross-módulo)
import { MotionShell } from '@/components/motion/motion-shell'
import { PortalRouteTransition } from '@/components/motion/portal-route-transition' // criar

export default function PortalLayout({ children }) {
  return (
    <MotionShell>
      <PortalNavbar ... />
      <main>
        <PortalRouteTransition>{children}</PortalRouteTransition>
      </main>
    </MotionShell>
  )
}
```

Remover `MotionShell` duplicado de `comunidade/layout.tsx` se o portal já envolver.

### Passo 2 — Escolher o padrão por tipo de UI

| Tipo de UI | Padrão | Preset / componente |
|------------|--------|---------------------|
| Lista de cards/produtos | stagger | `staggerContainer` + `staggerItem` |
| Empty state | fade up | `MotionEmptyState` |
| Formulário em etapas | slide horizontal | `storySlideVariants` ou `routePage` |
| Sacola (add/remove item) | layout | `layout` + `AnimatePresence` no `<li>` |
| Modal / sheet | popover | `popoverPanel` |
| Stepper (onboarding) | `layoutId` no indicador | igual `ComunidadeTabBar` |
| Tabela admin (ação linha) | fadeScale | saída após aprovar/rejeitar |

### Passo 3 — Prioridade sugerida

1. ~~**Portal layout** — transição Comunidade ↔ Loja ↔ Eventos~~
2. ~~**Loja** — sacola, catálogo, checkout, pedidos~~
3. ~~**Onboarding** — wizard~~
4. ~~**Salas / Mensagens** — listagem, thread, modal nova conversa~~
5. ~~**Admin** — moderação com saída animada~~
6. ~~**Eventos / Portal restante** — listas, detalhe, RSVP, sedes, carteirinha~~

### Passo 4 — Checklist por PR

- [ ] Componente está dentro de árvore com `MotionShell`?
- [ ] Usa `m`, não `motion`?
- [ ] Presets importados de `motion-presets.ts`?
- [ ] `AnimatePresence` envolve filhos condicionais com `exit`?
- [ ] Pickers/lightbox com portal no `body` quando `position:fixed`?
- [ ] `setMounted` / sync de props via `setTimeout(0)` se o lint exigir?
- [ ] Testado com `prefers-reduced-motion: reduce` no DevTools?
- [ ] Sem animação como único feedback de sucesso/erro (toast mantido)?

---

## Armadilhas conhecidas (Next.js + React 19)

| Problema | Solução |
|----------|---------|
| Dock/lightbox desalinhado | Portal no `document.body`; não animar `translate(-50%)` no mesmo keyframe do dock |
| `react-hooks/set-state-in-effect` | `setTimeout(() => setState(...), 0)` para mount pós-hidratação |
| `react-hooks/refs` no composer | Evitar `.map()` que fecha sobre refs; botões explícitos |
| Server Component animando direto | Wrapper `'use client'` (`MotionReveal`, etc.) |
| Lista SSR longa | `MotionReveal` com `index` capado; não `staggerContainer` no server |
| Fullscreen reels | `scroll-snap` CSS + `scale`/`opacity` no item ativo (IntersectionObserver) |

---

## Referência rápida de arquivos

```
apps/web/src/
  lib/motion-presets.ts              # presets (editar aqui primeiro)
  components/motion/
    motion-shell.tsx
    motion-reveal.tsx
    motion-empty-state.tsx
  app/portal/comunidade/
    layout.tsx                       # MotionShell + dock
    _components/
      comunidade-route-transition.tsx
      comunidade-posts-animated.tsx
      comunidade-tab-bar.tsx
      comunidade-member-list.tsx
      seguimento-pendentes-list.tsx
      comunidade-feed-empty.tsx
```

Commits de referência na `main`:

- `aa91ce3` — Motion inicial (shell, dock, busca, feed)
- `e68392d` — engajamento, pickers, rotas, lightbox, reels
- `0cfa7b6` — polish Comunidade (listas, abas, empty states, aside)

### Expansão portal (concluída)

| Módulo | Componentes | Status |
|--------|-------------|--------|
| Portal global | `PortalMotionShell`, `PortalRouteTransition`, `MotionRouteTransition` | `portal/layout.tsx` |
| Comunidade | `ComunidadeRouteTransition` (sem `MotionShell` duplicado) | layout filho |
| Loja | `LojaProdutoGridAnimated`, `SacolaItens`, `CheckoutForm`, `AdicionarSacolaForm`, `LojaPedidosList`, `LojaCategoriaChips`, `LojaPaginacao`, `LojaFiltros`, `ProdutoDetailCol`, `ProdutoRelacionadosGrid`, `LojaCarrossel`, `SacolaBadge` | catálogo + detalhe + sacola |
| Onboarding | `MotionShell` em `onboarding/layout`, wizard com `AnimatePresence` | wizard |
| Salas | `SalasListAnimated`, `CriarSalaForm`, `SalaAtivaClient`, `SalaChat`, `SalaEnquete`, `SalaParticipantes`, `MeetRoom` | listagem, sala ao vivo, Meet |
| Mensagens | `MensagensShell` (inbox, modal chips), `MensagemThread` (painéis, anexos, `PainelMembros`) | inbox + thread + grupo |
| Eventos | `EventosListAnimated`, `EventoDetailReveal`, `EventoConfirmadosGrid`, `RsvpButtons` | lista, detalhe, RSVP |
| Sedes | `SedesListAnimated`, `SedeDetailReveal`, `SedeLinksAnimated` | lista + detalhe |
| Carteirinha | `CarteirinhaReveal` | card e detalhes |
| Admin | `AdminMotionShell`, `AdminRouteTransition`, `AdminDashboardKpis`, `AdminEventosList`, `AdminLojaProdutosGrid`, `ModeracaoDenunciasClient`, `AdminPedidosList`, `AdminMembrosTable` | dashboard, eventos, loja, moderação, pedidos, membros, sedes, sócios, comunidade |

Arquivos genéricos novos:

```
components/motion/
  motion-route-transition.tsx
  portal-route-transition.tsx
  portal-motion-shell.tsx
  motion-success-panel.tsx
  admin-motion-shell.tsx
  admin-route-transition.tsx
  admin-dashboard-kpis.tsx
components/portal/
  eventos-list-animated.tsx
  evento-detail-motion.tsx
  sedes-explorer.tsx
  sedes-map.tsx
  sede-explorer-card.tsx
  sede-explorer-detail.tsx
  carteirinha-motion.tsx
  salas-list-animated.tsx
  loja-pedidos-list.tsx
  produto-relacionados-grid.tsx
app/admin/eventos/
  admin-eventos-list.tsx
app/admin/loja/
  admin-loja-produtos-grid.tsx
app/admin/comunidade/moderacao/
  moderacao-denuncias-client.tsx
```

---

## Novos presets

Adicionar em `motion-presets.ts` com comentário de uso, export nomeado, e atualizar
esta tabela. Evitar magic numbers nos componentes.

Preset `cartItemExit` — saída de item da sacola:

```ts
export const cartItemExit: Variants = {
  exit: { opacity: 0, x: -24, height: 0, transition: springSnappy },
}
```

---

## Links

- [Motion docs](https://motion.dev/docs)
- Performance web: `ARCHITECTURE.md` §5.6
- Módulo Comunidade (dados/rotas): `docs/data/modulo-comunidade.md`
