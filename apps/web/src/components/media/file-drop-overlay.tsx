'use client'

import { useRef, useState, type DragEvent } from 'react'
import { AnimatePresence, m } from 'motion/react'

export function dataTransferHasFiles(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes('Files')
}

/**
 * Contador de profundidade evita sumir o overlay ao passar sobre filhos.
 */
export function useFileDragOver(enabled = true) {
  const [active, setActive] = useState(false)
  const depthRef = useRef(0)

  function reset() {
    depthRef.current = 0
    setActive(false)
  }

  function onDragEnter(e: DragEvent) {
    if (!enabled || !dataTransferHasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    depthRef.current += 1
    setActive(true)
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
    if (depthRef.current === 0) setActive(false)
  }

  /** Retorna os arquivos e limpa o estado. Chamar após `preventDefault`. */
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

/** Overlay estilo “Arraste arquivo aqui” (área relativa do pai). */
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
          className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-[rgb(var(--color-primary))] bg-[rgb(var(--background)_/_0.88)]"
          aria-hidden
        >
          <p className="px-4 text-center text-base font-semibold text-[rgb(var(--foreground))] text-balance sm:text-lg">
            {label}
          </p>
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}
