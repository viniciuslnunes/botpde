'use client'

import { useEffect, useRef } from 'react'
import { m } from 'motion/react'
import { STICKERS } from '@/lib/stickers'
import { menuItemStagger, popoverPanel, springSnappy } from '@/lib/motion-presets'

interface StickerPickerProps {
  onSelect: (url: string) => void
  onClose: () => void
}

export function StickerPicker({ onSelect, onClose }: StickerPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
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
  }, [onClose])

  return (
    <m.div
      ref={ref}
      role="dialog"
      aria-label="Selecionar sticker"
      variants={popoverPanel}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={springSnappy}
      className="card-soft absolute bottom-full left-0 z-30 mb-2 w-64 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 shadow-xl"
    >
      <m.div
        className="grid grid-cols-3 gap-1"
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
  )
}
