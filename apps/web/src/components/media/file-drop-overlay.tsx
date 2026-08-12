'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { AnimatePresence, m } from 'motion/react'

export function dataTransferHasFiles(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes('Files')
}

/**
 * Contador de profundidade evita sumir o overlay ao passar sobre filhos.
 * Listeners em `window` (`dragend`/`drop`) zeraram o estado se o arraste
 * for cancelado (Esc, soltar fora) — sem isso o overlay trava.
 */
export function useFileDragOver(enabled = true) {
  const [arrastando, setArrastando] = useState(false)
  const depthRef = useRef(0)
  // Desligar o hook esconde o overlay por derivação — não precisa de effect
  // zerando o estado, que ainda deixava o overlay visível por um frame.
  const active = enabled && arrastando

  function reset() {
    depthRef.current = 0
    setArrastando(false)
  }

  useEffect(() => {
    if (!active) return
    function endDrag() {
      reset()
    }
    window.addEventListener('dragend', endDrag)
    window.addEventListener('drop', endDrag)
    return () => {
      window.removeEventListener('dragend', endDrag)
      window.removeEventListener('drop', endDrag)
    }
  }, [active])


  function onDragEnter(e: DragEvent) {
    if (!enabled || !dataTransferHasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    depthRef.current += 1
    setArrastando(true)
  }

  function onDragOver(e: DragEvent) {
    if (!enabled || !dataTransferHasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(e: DragEvent) {
    if (!enabled) return
    e.preventDefault()
    e.stopPropagation()
    depthRef.current = Math.max(0, depthRef.current - 1)
    if (depthRef.current === 0) setArrastando(false)
  }

  /** Retorna os arquivos e limpa o estado. Chamar no `onDrop` do alvo. */
  function finishDrop(e: DragEvent): FileList {
    e.preventDefault()
    e.stopPropagation()
    reset()
    return e.dataTransfer.files
  }

  return { active, onDragEnter, onDragOver, onDragLeave, finishDrop, reset }
}

type OverlayProps = {
  active: boolean
  label?: string
}

/**
 * Overlay estilo “Arraste arquivo aqui”.
 * Cobre 100% do pai `relative` (`inset-0` + `rounded-[inherit]`).
 */
export function FileDropOverlay({ active, label = 'Arraste arquivo aqui' }: OverlayProps) {
  return (
    <AnimatePresence>
      {active ? (
        <m.div
          key="file-drop-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          layout={false}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] bg-[rgb(var(--background)_/_0.88)] p-2"
          aria-hidden
        >
          <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-[rgb(var(--color-primary))]">
            <p className="px-4 text-center text-base font-semibold text-[rgb(var(--foreground))] text-balance sm:text-lg">
              {label}
            </p>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}
