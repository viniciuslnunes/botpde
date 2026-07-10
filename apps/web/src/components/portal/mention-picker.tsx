'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Avatar } from './avatar'
import { formatarMencao } from '@/lib/comunidade-social'

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
    <div
      ref={ref}
      className="absolute left-0 top-full z-20 mt-1 w-full max-w-xs overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg"
    >
      {carregando && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Buscando…
        </div>
      )}
      {!carregando && membros.length === 0 && (
        <p className="px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]">Nenhum membro encontrado</p>
      )}
      {membros.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(formatarMencao(m.nome ?? 'Membro', m.id))}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <Avatar nome={m.nome} avatarUrl={m.avatarUrl} size="xs" />
          <span className="truncate font-medium text-[rgb(var(--foreground))]">{m.nome ?? 'Membro'}</span>
        </button>
      ))}
    </div>
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
