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

export const reactionPop: Transition = {
  type: 'spring',
  stiffness: 560,
  damping: 18,
  mass: 0.6,
}

/** Transição entre rotas da comunidade. */
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
