/** Tamanhos de modal — a largura cresce com o conteúdo para encurtar o scroll. */
export const APP_MODAL_SIZES = ['sm', 'md', 'lg', 'xl'] as const
export type AppModalSize = (typeof APP_MODAL_SIZES)[number]

/** `nested` sobe o overlay (crop, reprovar/bloquear sobre o card do membro). */
export type AppModalLayer = 'base' | 'nested'

/**
 * `auto` encolhe no conteúdo (confirmação). `frame` trava a altura da viewport
 * para fichas com abas — trocar de tab não pula o painel.
 */
export const APP_MODAL_HEIGHTS = ['auto', 'frame'] as const
export type AppModalHeight = (typeof APP_MODAL_HEIGHTS)[number]

/**
 * Largura fluida: no mobile o painel é `w-full` (sheet); no desktop o teto
 * usa `min(rem, 100vw − padding)` para ocupar a tela sem encostar nas bordas.
 */
export const APP_MODAL_SIZE_CLASS: Record<AppModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-[min(42rem,calc(100vw-1.5rem))]',
  lg: 'max-w-[min(56rem,calc(100vw-1.5rem))]',
  xl: 'max-w-[min(80rem,calc(100vw-1.5rem))]',
}

export const APP_MODAL_HEIGHT_CLASS: Record<AppModalHeight, string> = {
  auto: 'max-h-[min(92dvh,100%)]',
  /** Mobile: sheet 92dvh. Desktop: preenche o padding do overlay, sem pular. */
  frame: 'h-[min(92dvh,100%)] sm:h-[calc(100dvh-2rem)]',
}

export const APP_MODAL_BACKDROP_CLASS =
  'app-modal-backdrop fixed inset-0 flex items-end justify-center bg-black/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4'

/**
 * No mobile o backdrop é `items-end` + `p-0`: o painel encosta na borda de
 * baixo da tela. Sem reservar o inset, o rodapé de ações (Salvar/Cancelar)
 * fica embaixo do home indicator do iPhone. O padding vai no PAINEL, não em
 * cada rodapé: o rodapé é `sticky bottom-0` do container de rolagem, então
 * quem sabe a distância até a borda da TELA é o painel. Em `sm+` o overlay já
 * dá `p-4` e o painel flutua — zera.
 */
export const APP_MODAL_PANEL_CLASS =
  'torcida-dialog-panel @container/modal flex w-full min-h-0 flex-col overflow-hidden rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pb-[env(safe-area-inset-bottom)] shadow-[0_1px_2px_rgb(0_0_0_/_0.04),0_24px_48px_-20px_rgb(0_0_0_/_0.35)] sm:rounded-2xl sm:pb-0'

let bodyLockCount = 0
let previousOverflow = ''
let previousPaddingRight = ''

/**
 * Trava o scroll do `body` com contador — modal aninhado não restaura cedo.
 * Compensa a largura da barra clássica com `padding-right` (sem calha no
 * `<html>`, que furava 12px pretos nos shells com scroll interno).
 */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (bodyLockCount === 0) {
    const gutter = window.innerWidth - document.documentElement.clientWidth
    previousOverflow = document.body.style.overflow
    previousPaddingRight = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (gutter > 0) {
      document.body.style.paddingRight = `${gutter}px`
    }
  }
  bodyLockCount += 1
  return () => {
    bodyLockCount = Math.max(0, bodyLockCount - 1)
    if (bodyLockCount === 0) {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
    }
  }
}

/**
 * Só o overlay no topo da pilha (e nunca por baixo de um confirm do
 * `DialogProvider`) deve tratar Escape.
 */
export function isTopmostAppModal(overlay: Element): boolean {
  if (typeof document === 'undefined') return false
  if (document.querySelector('.torcida-dialog-backdrop')) return false
  const layers = document.querySelectorAll('.app-modal-backdrop')
  return layers[layers.length - 1] === overlay
}
