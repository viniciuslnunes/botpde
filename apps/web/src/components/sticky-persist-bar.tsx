'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { usePersistBarVisibility } from '@/lib/use-persist-bar-visibility'
import { springSnappy } from '@/lib/motion-presets'

type Props = {
  children: ReactNode
  /** Texto auxiliar à esquerda (desktop). */
  hint?: ReactNode
  /**
   * Mantém a barra visível: alterações não salvas, pending, etc.
   * Clique/idle não escondem enquanto locked.
   */
  locked?: boolean
  /** Rótulo curto do estado dirty (ex.: "3 alterações"). Sobrescreve hint quando locked. */
  dirtyLabel?: string
  /** Mostra dica Ctrl/Cmd+S e registra o atalho (default: true). */
  saveShortcut?: boolean
  className?: string
}

/**
 * Barra fixa de persistência (Salvar / Cancelar) no viewport.
 *
 * Regra da aplicação em admin, departamentos, loja e onboarding.
 * Comunidade não usa este padrão.
 *
 * Marque o formulário/painel com `data-persist-bar-root` para que cliques
 * internos não dismissem a barra. Botões `type="submit"` fora do form precisam
 * de `form={formId}`.
 *
 * Inclui spacer no fluxo automaticamente (não precisa de `StickyPersistBarSpacer`).
 */
export function StickyPersistBar({
  children,
  hint,
  locked = false,
  dirtyLabel,
  saveShortcut = true,
  className,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [focusLocked, setFocusLocked] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const liveId = useId()
  const effectivelyLocked = locked || focusLocked
  const visible = usePersistBarVisibility({ locked: effectivelyLocked })
  const reduceMotion = useReducedMotion()
  const prevLocked = useRef(locked)

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  // Sem alterações pendentes: solta o foco-lock para a barra poder sumir
  // (ex.: Descartar / reverter campos com o botão ainda focado). Só na
  // TRANSIÇÃO para não-locked — focar a barra sem nada a salvar continua
  // segurando ela aberta. No render, senão fica um frame cinza com os botões
  // desabilitados, que é justamente o que a barra não pode fazer.
  const [lockedAnterior, setLockedAnterior] = useState(locked)
  if (locked !== lockedAnterior) {
    setLockedAnterior(locked)
    if (!locked) setFocusLocked(false)
  }

  // Ctrl/Cmd+S → dispara o submit da barra quando há algo a salvar.
  useEffect(() => {
    if (!effectivelyLocked || !saveShortcut) return

    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey
      if (!mod || (event.key !== 's' && event.key !== 'S')) return
      if (event.defaultPrevented) return
      event.preventDefault()
      const submit = barRef.current?.querySelector<HTMLButtonElement>(
        'button[type="submit"]:not(:disabled)',
      )
      submit?.click()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [effectivelyLocked, saveShortcut])

  // Anuncia quando passa a haver alterações pendentes.
  useEffect(() => {
    if (locked && !prevLocked.current) {
      const live = document.getElementById(liveId)
      if (live) {
        live.textContent = dirtyLabel
          ? `Alterações pendentes: ${dirtyLabel}`
          : 'Há alterações não salvas. Use a barra inferior ou Ctrl+S para salvar.'
      }
    }
    prevLocked.current = locked
  }, [locked, dirtyLabel, liveId])

  const showHint = locked && dirtyLabel ? dirtyLabel : hint

  return (
    <>
      <m.div
        aria-hidden
        className="shrink-0"
        initial={false}
        animate={{ height: visible ? 88 : 0 }}
        transition={reduceMotion ? { duration: 0 } : springSnappy}
      />

      <div id={liveId} className="sr-only" aria-live="polite" aria-atomic="true" />

      {mounted
        ? createPortal(
            // z-20 < sidebar admin (z-60): barra nunca cobre o menu.
            // pointer-events no enter/exit evita ghost em opacity:0.
            <div className="app-inset-x pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 [--app-inset-x:0.75rem] sm:[--app-inset-x:1rem]">
              <AnimatePresence>
                {visible ? (
                  <m.div
                    key="persist-bar"
                    ref={barRef}
                    data-persist-bar=""
                    role="region"
                    aria-label={
                      locked
                        ? 'Ações de persistência — alterações pendentes'
                        : 'Ações de persistência'
                    }
                    // Só desliga hits no *exit* (opacity→0). NÃO animar
                    // pointerEvents no enter — spring + valor discreto pode
                    // deixar a barra em pointer-events:none (regressão bccc34a).
                    initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      reduceMotion
                        ? undefined
                        : { opacity: 0, y: 16, pointerEvents: 'none' }
                    }
                    transition={reduceMotion ? { duration: 0 } : springSnappy}
                    className={[
                      'dock-shadow pointer-events-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-3',
                      locked
                        ? 'border-[rgb(var(--primary)_/_0.45)] bg-[rgb(var(--surface))]/98'
                        : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95',
                      className ?? '',
                    ].join(' ')}
                    onFocusCapture={() => setFocusLocked(true)}
                    onBlurCapture={(event) => {
                      const next = event.relatedTarget as Node | null
                      if (!event.currentTarget.contains(next)) setFocusLocked(false)
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      {showHint ? (
                        <p
                          className={[
                            'text-[11px] sm:text-xs',
                            locked
                              ? 'font-medium text-[rgb(var(--foreground))]'
                              : 'text-[rgb(var(--foreground-muted))]',
                          ].join(' ')}
                        >
                          {showHint}
                        </p>
                      ) : null}
                      {locked && saveShortcut ? (
                        <p className="mt-0.5 hidden text-[10px] text-[rgb(var(--foreground-muted))] sm:block">
                          Ctrl+S ou ⌘S para salvar
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {children}
                    </div>
                  </m.div>
                ) : null}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/**
 * @deprecated O spacer já é renderizado por `StickyPersistBar`. Mantido para
 * call sites antigos — pode ser removido.
 */
export function StickyPersistBarSpacer() {
  return null
}
