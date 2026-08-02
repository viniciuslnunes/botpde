'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { m } from 'motion/react'
import { STICKERS } from '@/lib/stickers'
import { menuItemStagger, popoverPanel, springSnappy } from '@/lib/motion-presets'
import { AnchoredPopover } from './anchored-popover'

interface StickerPickerProps {
  onSelect: (url: string) => void
  onClose: () => void
  /** Âncora do botão/trigger. Sem isto, usa sentinel na posição de render. */
  anchorRef?: RefObject<HTMLElement | null>
}

export function StickerPicker({ onSelect, onClose, anchorRef }: StickerPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLSpanElement>(null)
  const resolvedAnchor = anchorRef ?? sentinelRef

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (resolvedAnchor.current?.contains(target)) return
      onClose()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [onClose, resolvedAnchor])

  return (
    <>
      {!anchorRef && (
        <span
          ref={sentinelRef}
          className="pointer-events-none absolute left-0 top-0 h-0 w-0"
          aria-hidden
        />
      )}
      <AnchoredPopover
        open
        anchorRef={resolvedAnchor}
        placement="top-start"
        offset={8}
        zIndex={60}
      >
        <m.div
          ref={panelRef}
          role="dialog"
          aria-label="Selecionar sticker"
          variants={popoverPanel}
          initial="hidden"
          animate="show"
          exit="exit"
          transition={springSnappy}
          className="card-soft w-64 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 shadow-xl"
        >
          <m.div
            className="grid max-h-[min(50vh,16rem)] grid-cols-3 gap-1 overflow-y-auto"
            variants={{ show: { transition: { staggerChildren: 0.03 } } }}
            initial="hidden"
            animate="show"
          >
            {STICKERS.map((url, i) => (
              <m.button
                key={url}
                type="button"
                custom={i}
                variants={menuItemStagger}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={springSnappy}
                onClick={() => onSelect(url)}
                className="flex items-center justify-center rounded-xl p-2 hover:bg-[rgb(var(--background-subtle))]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Sticker" className="h-14 w-14 object-contain" />
              </m.button>
            ))}
          </m.div>
        </m.div>
      </AnchoredPopover>
    </>
  )
}
