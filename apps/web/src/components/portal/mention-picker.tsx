'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { Avatar } from './avatar'
import { AnchoredPopover } from './anchored-popover'
import {
  formatarMencaoLegivel,
  type MencaoParsed,
} from '@/lib/comunidade-social'
import { menuItemStagger, popoverPanel, springSnappy } from '@/lib/motion-presets'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

interface MembroMencao {
  id: string
  nome: string | null
  nickname: string | null
  avatarUrl: string | null
}

export interface MencaoSelecionada extends MencaoParsed {
  /** Texto legível a inserir no composer (`@Nome `). */
  texto: string
}

interface MentionPickerProps {
  query: string
  onSelect: (mencao: MencaoSelecionada) => void
  onClose: () => void
  /** Comunidade Nacional — typeahead no tenant sintético do clube. */
  escopo?: EscopoComunidade
  /**
   * Âncora do menu (input/textarea wrapper). Sem isto, usa um sentinel
   * absoluto na posição de render — ainda portaled para escapar overflow.
   */
  anchorRef?: RefObject<HTMLElement | null>
}

export function MentionPicker({
  query,
  onSelect,
  onClose,
  escopo,
  anchorRef,
}: MentionPickerProps) {
  const [membros, setMembros] = useState<MembroMencao[]>([])
  const [carregando, setCarregando] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLSpanElement>(null)
  const resolvedAnchor = anchorRef ?? sentinelRef

  const buscar = useCallback(async (termo: string) => {
    if (termo.length < 1) {
      setMembros([])
      return
    }
    setCarregando(true)
    try {
      const params = new URLSearchParams({ q: termo })
      if (escopo === 'nacional') params.set('escopo', 'nacional')
      const res = await fetch(`/api/comunidade/membros?${params}`)
      if (!res.ok) return
      const data = (await res.json()) as { membros: MembroMencao[] }
      setMembros(data.membros.slice(0, 6))
    } catch {
      setMembros([])
    } finally {
      setCarregando(false)
    }
  }, [escopo])

  useEffect(() => {
    const t = setTimeout(() => void buscar(query), 200)
    return () => clearTimeout(t)
  }, [query, buscar])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (resolvedAnchor.current?.contains(target)) return
      onClose()
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose, resolvedAnchor])

  if (query.length < 1) return null

  return (
    <>
      {!anchorRef && (
        <span
          ref={sentinelRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0"
          aria-hidden
        />
      )}
      <AnchoredPopover
        open
        anchorRef={resolvedAnchor}
        placement="bottom-start"
        offset={4}
        matchAnchorWidth
        minWidth={256}
        zIndex={60}
      >
        <m.div
          ref={panelRef}
          variants={popoverPanel}
          initial="hidden"
          animate="show"
          exit="exit"
          transition={springSnappy}
          className="card-soft max-h-[min(50vh,18rem)] w-full overflow-y-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg"
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
                {membros.map((membro, i) => {
                  const nome = membro.nome?.trim() || 'Membro'
                  const nick = membro.nickname?.trim() || null
                  return (
                    <m.button
                      key={membro.id}
                      type="button"
                      custom={i}
                      variants={menuItemStagger}
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={springSnappy}
                      onClick={() =>
                        onSelect({
                          nome,
                          userId: membro.id,
                          texto: formatarMencaoLegivel(nome),
                        })
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Avatar nome={membro.nome} avatarUrl={membro.avatarUrl} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[rgb(var(--foreground))]">
                          {nome}
                        </span>
                        {nick && (
                          <span className="block truncate text-xs text-[rgb(var(--foreground-muted))]">
                            @{nick}
                          </span>
                        )}
                      </span>
                    </m.button>
                  )
                })}
              </m.div>
            )}
          </AnimatePresence>
        </m.div>
      </AnchoredPopover>
    </>
  )
}

/** Detecta se o cursor está após um @ sem menção fechada. */
export function detectarMencaoAtiva(texto: string, cursor: number): string | null {
  const antes = texto.slice(0, cursor)
  // Espaço/quebra após @… = menção já concluída (ex.: "@Ellen Akemi ").
  if (/\s$/.test(antes)) return null
  const match = antes.match(/@([\p{L}\p{N}_\s]{0,30})$/u)
  if (!match) return null
  if (antes.endsWith(']') || antes.includes('](user:')) return null
  return match[1].trim()
}
