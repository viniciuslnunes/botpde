'use client'

import { m } from 'motion/react'
import { Heart, MessageCircle } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { staggerContainer, staggerItem } from '@/lib/motion-presets'
import type { AtividadePerfilItem } from '@/lib/perfil-social'
import { formatRelative } from '@/lib/format-datetime'

interface PerfilAtividadeListProps {
  itens: AtividadePerfilItem[]
}

function IconeAtividade({ tipo }: { tipo: AtividadePerfilItem['tipo'] }) {
  if (tipo === 'COMENTARIO') return <MessageCircle className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
  return <Heart className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
}

export function PerfilAtividadeList({ itens }: PerfilAtividadeListProps) {
  if (itens.length === 0) {
    return (
      <MotionEmptyState
        className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]"
        title="Nenhuma interação registrada ainda."
      />
    )
  }

  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
      {itens.map((item) => (
        <m.div
          key={`${item.tipo}-${item.id}`}
          variants={staggerItem}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <div className="flex items-start gap-3">
            <IconeAtividade tipo={item.tipo} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                {item.tipo === 'COMENTARIO' ? 'Comentou' : item.conteudo}
              </p>
              {item.tipo === 'COMENTARIO' && (
                <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{item.conteudo}</p>
              )}
              <p className="mt-2 truncate text-xs text-[rgb(var(--foreground-muted))]">
                em: {item.postSnippet}
                {item.postSnippet.length >= 120 ? '…' : ''}
              </p>
              <time
                dateTime={new Date(item.criadoEm).toISOString()}
                className="mt-1 block text-[11px] text-[rgb(var(--foreground-muted))]"
                suppressHydrationWarning
              >
                {formatRelative(item.criadoEm)}
              </time>
            </div>
          </div>
        </m.div>
      ))}
      <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
        Interações recentes no feed da comunidade
      </p>
    </m.div>
  )
}
