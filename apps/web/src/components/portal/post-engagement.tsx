'use client'

import { useTransition } from 'react'
import { Heart, Flag, MessageCircle, Zap } from 'lucide-react'
import { comentarPost, denunciarPost, reagirPost } from '@/app/portal/comunidade/actions'

interface PostEngagementProps {
  postId: string
}

export function PostEngagement({ postId }: PostEngagementProps) {
  const [pending, startTransition] = useTransition()

  function handleReacao(tipo: 'CURTIR' | 'FORCA') {
    startTransition(async () => {
      try {
        await reagirPost(postId, tipo)
      } catch {
        // toast futuro
      }
    })
  }

  function handleComentario() {
    const conteudo = window.prompt('Seu comentário:')
    if (!conteudo?.trim()) return
    startTransition(async () => {
      try {
        await comentarPost(postId, conteudo.trim())
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Erro ao comentar')
      }
    })
  }

  function handleDenuncia() {
    const motivo = window.prompt('Motivo da denúncia:')
    if (!motivo?.trim()) return
    startTransition(async () => {
      try {
        await denunciarPost(postId, motivo.trim())
        window.alert('Denúncia enviada. A moderação irá analisar.')
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Erro ao denunciar')
      }
    })
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--border))] pt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => handleReacao('CURTIR')}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
      >
        <Heart className="h-3.5 w-3.5" /> Curtir
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => handleReacao('FORCA')}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
      >
        <Zap className="h-3.5 w-3.5" /> Força
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={handleComentario}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
      >
        <MessageCircle className="h-3.5 w-3.5" /> Comentar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={handleDenuncia}
        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
      >
        <Flag className="h-3.5 w-3.5" /> Denunciar
      </button>
    </div>
  )
}
