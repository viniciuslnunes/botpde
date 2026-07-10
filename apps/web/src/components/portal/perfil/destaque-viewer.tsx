'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar } from '../avatar'
import { PostConteudoRich } from '../post-conteudo-rich'
import { PostMedia } from '../post-media'
import { PostPoll } from '../post-poll'
import { PostRepostEmbed } from '../post-repost-embed'
import { linkPostComunidade } from '@/lib/comunidade-social'
import type { DestaquePerfilItem } from '@/lib/feed'

interface DestaqueViewerProps {
  destaques: DestaquePerfilItem[]
  userId: string
  autorNome: string | null
  onClose: () => void
  initialDestaqueIndex?: number
}

export function DestaqueViewer({
  destaques,
  userId,
  autorNome,
  onClose,
  initialDestaqueIndex = 0,
}: DestaqueViewerProps) {
  const [destaqueIdx, setDestaqueIdx] = useState(initialDestaqueIndex)
  const [postIdx, setPostIdx] = useState(0)

  const destaque = destaques[destaqueIdx]
  const posts = destaque?.posts ?? []
  const post = posts[postIdx]

  const avancar = useCallback(() => {
    if (!destaque) return
    if (postIdx < posts.length - 1) {
      setPostIdx((i) => i + 1)
    } else if (destaqueIdx < destaques.length - 1) {
      setDestaqueIdx((i) => i + 1)
      setPostIdx(0)
    } else {
      onClose()
    }
  }, [destaque, destaqueIdx, destaques.length, onClose, postIdx, posts.length])

  const voltar = useCallback(() => {
    if (postIdx > 0) {
      setPostIdx((i) => i - 1)
    } else if (destaqueIdx > 0) {
      const prev = destaques[destaqueIdx - 1]
      setDestaqueIdx((i) => i - 1)
      setPostIdx(Math.max(0, (prev?.posts.length ?? 1) - 1))
    }
  }, [destaqueIdx, destaques, postIdx])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') avancar()
      if (e.key === 'ArrowLeft') voltar()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [avancar, voltar, onClose])

  if (!destaque || !post) return null

  const progressPct = posts.length > 0 ? ((postIdx + 1) / posts.length) * 100 : 100

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center gap-1 px-3 pt-3">
        {posts.map((_, i) => (
          <div
            key={i}
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20"
          >
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: i < postIdx ? '100%' : i === postIdx ? `${progressPct}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Avatar nome={autorNome} avatarUrl={post.autor.avatarUrl} size="sm" />
          <div>
            <p className="text-sm font-semibold text-white">{autorNome ?? 'Membro'}</p>
            <p className="text-xs text-white/60">{destaque.titulo}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-full p-2 text-white/80 hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-6">
        <button
          type="button"
          aria-label="Anterior"
          onClick={voltar}
          disabled={destaqueIdx === 0 && postIdx === 0}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>

        <div className="w-full max-w-lg space-y-4">
          <PostConteudoRich
            conteudo={post.conteudo}
            className="text-center text-lg text-white"
          />
          {post.postOrigem && <PostRepostEmbed origem={post.postOrigem} />}
          {post.enquete && <PostPoll enquete={post.enquete} />}
          {post.midiaUrls.length > 0 && (
            <div className="overflow-hidden rounded-2xl">
              <PostMedia urls={post.midiaUrls} />
            </div>
          )}
          <Link
            href={linkPostComunidade(post.id)}
            className="block text-center text-xs text-white/50 hover:text-white/80"
          >
            Ver publicação completa →
          </Link>
        </div>

        <button
          type="button"
          aria-label="Próximo"
          onClick={avancar}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>
    </div>
  )
}
