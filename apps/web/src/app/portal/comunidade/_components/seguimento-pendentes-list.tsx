'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoReviewButtons } from '@/components/portal/seguimento-buttons'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface SeguimentoPendenteItem {
  id: string
  criadoEm: string
  seguidor: {
    id: string
    nome: string | null
    avatarUrl: string | null
  }
}

interface SeguimentoPendentesListProps {
  itensIniciais: SeguimentoPendenteItem[]
  onAprovar: (id: string) => Promise<void>
  onRejeitar: (id: string) => Promise<void>
}

function formatarData(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export function SeguimentoPendentesList({
  itensIniciais,
  onAprovar,
  onRejeitar,
}: SeguimentoPendentesListProps) {
  const [itens, setItens] = useState(itensIniciais)
  const [, startTransition] = useTransition()

  function remover(id: string) {
    setItens((prev) => prev.filter((item) => item.id !== id))
  }

  function aprovar(id: string): Promise<void> {
    return new Promise((resolve) => {
      startTransition(async () => {
        await onAprovar(id)
        remover(id)
        resolve()
      })
    })
  }

  function rejeitar(id: string): Promise<void> {
    return new Promise((resolve) => {
      startTransition(async () => {
        await onRejeitar(id)
        remover(id)
        resolve()
      })
    })
  }

  if (itens.length === 0) {
    return (
      <MotionEmptyState
        className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]"
        title="Sem solicitações pendentes."
      />
    )
  }

  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-3"
    >
      <AnimatePresence mode="popLayout">
        {itens.map((item) => (
          <m.div
            key={item.id}
            layout
            variants={staggerItem}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
            className="card-soft flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Link href={`/portal/comunidade/perfil/${item.seguidor.id}`}>
                <Avatar nome={item.seguidor.nome} avatarUrl={item.seguidor.avatarUrl} size="md" />
              </Link>
              <div className="min-w-0">
                <Link
                  href={`/portal/comunidade/perfil/${item.seguidor.id}`}
                  className="truncate text-sm font-semibold text-[rgb(var(--foreground))] hover:underline"
                >
                  {item.seguidor.nome ?? 'Membro'}
                </Link>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  solicitou em {formatarData(item.criadoEm)}
                </p>
              </div>
            </div>
            <SeguimentoReviewButtons
              seguimentoId={item.id}
              onAprovar={aprovar}
              onRejeitar={rejeitar}
            />
          </m.div>
        ))}
      </AnimatePresence>
    </m.div>
  )
}
