'use client'

import { useEffect, useRef, useState } from 'react'
import { EMOJI_CATEGORIES } from '@/lib/emojis'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [cat, setCat] = useState(EMOJI_CATEGORIES[0].id)
  const ref = useRef<HTMLDivElement>(null)
  const active = EMOJI_CATEGORIES.find((c) => c.id === cat) ?? EMOJI_CATEGORIES[0]

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
    <div
      ref={ref}
      role="dialog"
      aria-label="Selecionar emoji"
      className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 shadow-xl"
    >
      <div className="mb-2 flex items-center gap-1 border-b border-[rgb(var(--border))] pb-2">
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id)}
            aria-label={c.label}
            className={[
              'flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors',
              c.id === cat
                ? 'bg-[rgb(var(--primary)_/_0.12)]'
                : 'hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
        {active.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xl transition-transform hover:scale-125 hover:bg-[rgb(var(--background-subtle))]"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
