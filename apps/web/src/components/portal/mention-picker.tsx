'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { Avatar } from './avatar'
import { formatarMencao } from '@/lib/comunidade-social'
import { menuItemStagger, popoverPanel, springSnappy } from '@/lib/motion-presets'

interface MembroMencao {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface MentionPickerProps {
  query: string
  onSelect: (mencao: string) => void
  onClose: () => void
}

export function MentionPicker({ query, onSelect, onClose }: MentionPickerProps) {
  const [membros, setMembros] = useState<MembroMencao[]>([])
  const [carregando, setCarregando] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const buscar = useCallback(async (termo: string) => {
    if (termo.length < 1) {
      setMembros([])
      return
    }
    setCarregando(true)
    try {
      const res = await fetch(`/api/comunidade/membros?q=${encodeURIComponent(termo)}`)
      if (!res.ok) return
      const data = (await res.json()) as { membros: MembroMencao[] }
      setMembros(data.membros.slice(0, 6))
    } catch {
      setMembros([])
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void buscar(query), 200)
    return () => clearTimeout(t)
  }, [query, buscar])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  if (query.length < 1) return null

  return (
    <m.div
      ref={ref}
      variants={popoverPanel}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={springSnappy}
      className="card-soft absolute left-0 top-full z-20 mt-1 w-full max-w-xs overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg"
    >
      <AnimatePresence mode="wait">
        {carregando ? (
          <m.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Buscando…
          </m.div>
        ) : membros.length === 0 ? (
          <m.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]"
          >
            Nenhum membro encontrado
          </m.p>
        ) : (
          <m.div
            key="lista"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          >
            {membros.map((membro, i) => (
              <m.button
                key={membro.id}
                type="button"
                custom={i}
                variants={menuItemStagger}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                transition={springSnappy}
                onClick={() => onSelect(formatarMencao(membro.nome ?? 'Membro', membro.id))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <Avatar nome={membro.nome} avatarUrl={membro.avatarUrl} size="xs" />
                <span className="truncate font-medium text-[rgb(var(--foreground))]">
                  {membro.nome ?? 'Membro'}
                </span>
              </m.button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}

/** Detecta se o cursor está após um @ sem menção fechada. */
export function detectarMencaoAtiva(texto: string, cursor: number): string | null {
  const antes = texto.slice(0, cursor)
  const match = antes.match(/@([\p{L}\p{N}_\s]{0,30})$/u)
  if (!match) return null
  if (antes.endsWith(']') || antes.includes('](user:')) return null
  return match[1].trim()
}
