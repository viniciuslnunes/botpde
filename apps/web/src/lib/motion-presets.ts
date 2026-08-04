import type { Transition, Variants } from 'motion/react'

/** Spring suave — padrão da comunidade (dock, menus, cards). */
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.8,
}

/** Spring mais lento — expansões e painéis. */
export const springGentle: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 28,
  mass: 1,
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
}

export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1 },
}

export const popoverPanel: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  show: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 4 },
}

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: springGentle,
  },
}

export const menuItemStagger: Variants = {
  hidden: { opacity: 0, x: -6 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { ...springSnappy, delay: i * 0.04 },
  }),
}

/** Painéis que expandem/colapsam (comentários, forms inline). */
export const collapsePanel: Variants = {
  hidden: { opacity: 0, height: 0 },
  show: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
}

/** Slide horizontal entre stories (dir: 1 = avançar, -1 = voltar). */
export const storySlideVariants: Variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 48 : -48,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: springGentle,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -48 : 48,
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.18 },
  }),
}

/** Pop de reação (curtir/salvar). Tween — usado com keyframes `scale: [1, x, 1]`,
 * que spring não suporta (só 2 keyframes). Overshoot fica no próprio keyframe. */
export const reactionPop: Transition = {
  type: 'tween',
  duration: 0.34,
  ease: 'easeOut',
}

/** Transição entre rotas (admin/portal) — DESLIGADA em `MotionRouteTransition`
 * (ghost layer bloqueava digitação). Preset mantido para reativação futura com
 * teste E2E de input; não animar `pointerEvents`.
 */
export const routePage: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

/** Backdrop de lightbox / viewer fullscreen. */
export const lightboxBackdrop: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
  exit: { opacity: 0 },
}

/** Conteúdo do lightbox (zoom suave). */
export const lightboxContent: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
}

/** Saída de item da sacola (remover linha). */
export const cartItemExit: Variants = {
  exit: { opacity: 0, x: -24, height: 0, transition: springSnappy },
}

/** Burst de anel atrás do ícone ao curtir (ping que expande e desaparece). */
export const heartBurst: Variants = {
  hidden: { opacity: 0, scale: 0.4 },
  show: { opacity: [0.55, 0], scale: [0.4, 1.8], transition: { duration: 0.5, ease: 'easeOut' } },
}

/** Bookmark "cai" e assenta ao salvar — distinto do bounce genérico de reação. */
export const bookmarkDrop: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 15,
  mass: 0.7,
}

/** Giro rápido do ícone de compartilhar ao confirmar o repost. */
export const shareSpin: Transition = {
  type: 'tween',
  duration: 0.4,
  ease: 'easeOut',
}

/**
 * Barra de escudos da Comunidade (operador / sócio): entrada, saída, lift ao
 * arrastar e dim sutil nos vizinhos. Só `opacity` / `transform` / `boxShadow`
 * — o FLIP da reordenação fica no `layout` do item.
 */
export const canalTabBarItem: Variants = {
  hidden: { opacity: 0, scale: 0.84, y: 8 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    zIndex: 1,
    boxShadow: '0 0 0 0 rgba(0,0,0,0)',
    transition: springSnappy,
  },
  dimmed: {
    opacity: 0.55,
    scale: 0.96,
    y: 0,
    zIndex: 1,
    boxShadow: '0 0 0 0 rgba(0,0,0,0)',
    transition: springSnappy,
  },
  dragging: {
    opacity: 1,
    scale: 1.14,
    y: -6,
    zIndex: 40,
    boxShadow: '0 14px 28px -10px rgba(0,0,0,0.32)',
    transition: springSnappy,
  },
  exit: {
    opacity: 0,
    scale: 0.78,
    y: 6,
    transition: { duration: 0.16, ease: 'easeOut' },
  },
}

/** Micro-interação do escudo (hover/tap) — não misturar com o lift do drag. */
export const canalTabIconTap: Transition = springSnappy
