'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { EMOJI_CATEGORIES } from '@/lib/emojis'
import { menuItemStagger, popoverPanel, springSnappy } from '@/lib/motion-presets'
import { AnchoredPopover } from './anchored-popover'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  /** Âncora do botão/trigger. Sem isto, usa sentinel na posição de render. */
  anchorRef?: RefObject<HTMLElement | null>
}

export function EmojiPicker({ onSelect, onClose, anchorRef }: EmojiPickerProps) {
  const [cat, setCat] = useState(EMOJI_CATEGORIES[0].id)
  const panelRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLSpanElement>(null)
  const resolvedAnchor = anchorRef ?? sentinelRef
  const active = EMOJI_CATEGORIES.find((c) => c.id === cat) ?? EMOJI_CATEGORIES[0]

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
          aria-label="Selecionar emoji"
          variants={popoverPanel}
          initial="hidden"
          animate="show"
          exit="exit"
          transition={springSnappy}
          className="card-soft w-72 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 shadow-xl"
        >
          <div className="relative mb-2 flex items-center gap-1 border-b border-[rgb(var(--border))] pb-2">
            {EMOJI_CATEGORIES.map((c) => (
              <m.button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                whileTap={{ scale: 0.9 }}
                transition={springSnappy}
                aria-label={c.label}
                className={[
                  'relative flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors',
                  c.id === cat
                    ? 'text-[rgb(var(--color-primary-fg))]'
                    : 'hover:bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                {c.id === cat && (
                  <m.span
                    layoutId="emoji-cat-indicator"
                    className="absolute inset-0 rounded-lg bg-[rgb(var(--primary)_/_0.12)]"
                    transition={springSnappy}
                  />
                )}
                <span className="relative">{c.icon}</span>
              </m.button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <m.div
              key={cat}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={springSnappy}
              className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto"
            >
              {active.emojis.map((emoji, i) => (
                <m.button
                  key={emoji}
                  type="button"
                  custom={i}
                  variants={menuItemStagger}
                  initial="hidden"
                  animate="show"
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.95 }}
                  transition={springSnappy}
                  onClick={() => onSelect(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xl hover:bg-[rgb(var(--background-subtle))]"
                >
                  {emoji}
                </m.button>
              ))}
            </m.div>
          </AnimatePresence>
        </m.div>
      </AnchoredPopover>
    </>
  )
}
