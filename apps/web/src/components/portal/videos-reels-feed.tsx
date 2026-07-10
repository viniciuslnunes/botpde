'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X, Volume2, VolumeX } from 'lucide-react'
import { Avatar } from './avatar'
import { PostConteudoRich } from './post-conteudo-rich'
import { linkPostComunidade, isVideoUrl } from '@/lib/comunidade-social'
import type { PostSocialItem } from '@/lib/feed'

interface VideosReelsFeedProps {
  posts: PostSocialItem[]
  initialIndex?: number
  onClose?: () => void
}

function videoUrl(post: PostSocialItem): string | null {
  const video = post.midiaUrls.find(isVideoUrl)
  if (video) return video
  if (post.imagemUrl && isVideoUrl(post.imagemUrl)) return post.imagemUrl
  return null
}

export function VideosReelsFeed({ posts, initialIndex = 0, onClose }: VideosReelsFeedProps) {
  const [activeIdx, setActiveIdx] = useState(initialIndex)
  const [muted, setMuted] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())

  const reels = posts.filter((p) => videoUrl(p) != null)

  const playActive = useCallback(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === activeIdx) {
        video.muted = muted
        void video.play().catch(() => {})
      } else {
        video.pause()
        video.currentTime = 0
      }
    })
  }, [activeIdx, muted])

  useEffect(() => {
    playActive()
  }, [playActive])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.idx)
            if (!Number.isNaN(idx)) setActiveIdx(idx)
          }
        }
      },
      { root: container, threshold: [0.6] },
    )

    container.querySelectorAll('[data-idx]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [reels.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    if (onClose) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      if (onClose) document.body.style.overflow = ''
    }
  }, [onClose])

  if (reels.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
        Nenhum vídeo para exibir.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={[
        'snap-y snap-mandatory overflow-y-auto',
        onClose ? 'fixed inset-0 z-50 bg-black' : 'h-[calc(100vh-8rem)] rounded-2xl',
      ].join(' ')}
    >
      {onClose && (
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-white">Reels</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="rounded-full p-2 text-white/80 hover:bg-white/10"
              aria-label={muted ? 'Ativar som' : 'Silenciar'}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white/80 hover:bg-white/10"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {reels.map((post, idx) => {
        const src = videoUrl(post)
        if (!src) return null
        return (
          <section
            key={post.id}
            data-idx={idx}
            className="relative flex h-full min-h-[calc(100vh-4rem)] snap-start snap-always flex-col items-center justify-center px-4 py-6"
          >
            <video
              ref={(el) => {
                if (el) videoRefs.current.set(idx, el)
                else videoRefs.current.delete(idx)
              }}
              src={src}
              playsInline
              loop
              muted={muted}
              className="max-h-[80vh] w-full max-w-md rounded-2xl object-contain"
            />
            <div className="mt-4 w-full max-w-md space-y-2">
              <div className="flex items-center gap-2">
                <Avatar nome={post.autor.nome} avatarUrl={post.autor.avatarUrl} size="sm" />
                <span className="text-sm font-semibold text-white">{post.autor.nome ?? 'Membro'}</span>
              </div>
              <PostConteudoRich conteudo={post.conteudo} className="line-clamp-3 text-sm text-white/90" />
              <Link
                href={linkPostComunidade(post.id)}
                className="text-xs text-white/50 hover:text-white/80"
              >
                Ver publicação completa →
              </Link>
            </div>
          </section>
        )
      })}
    </div>
  )
}
