import Link from 'next/link'
import { Heart, MessageCircle, Zap } from 'lucide-react'
import type { AtividadePerfilItem } from '@/lib/perfil-social'
import { formatRelative } from '@/lib/format-datetime'

interface PerfilAtividadeListProps {
  itens: AtividadePerfilItem[]
}

function IconeAtividade({ tipo }: { tipo: AtividadePerfilItem['tipo'] }) {
  if (tipo === 'COMENTARIO') return <MessageCircle className="h-4 w-4 text-[rgb(var(--primary))]" />
  if (tipo === 'FORCA') return <Zap className="h-4 w-4 text-amber-500" />
  return <Heart className="h-4 w-4 text-[rgb(var(--primary))]" />
}

export function PerfilAtividadeList({ itens }: PerfilAtividadeListProps) {
  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
        Nenhuma interação registrada ainda.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {itens.map((item) => (
        <div
          key={`${item.tipo}-${item.id}`}
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
              <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
                {formatRelative(item.criadoEm)}
              </p>
            </div>
          </div>
        </div>
      ))}
      <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
        Interações recentes no feed da comunidade
      </p>
    </div>
  )
}
