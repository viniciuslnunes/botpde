'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { X, Volume2, VolumeX } from 'lucide-react'
import { Avatar } from './avatar'
import { PostConteudoRich } from './post-conteudo-rich'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { linkPostComunidade, isVideoUrl } from '@/lib/comunidade-social'
import { lightboxBackdrop, springGentle, springSnappy } from '@/lib/motion-presets'
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
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())

  const reels = posts.filter((p) => videoUrl(p) != null)

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

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
      <MotionEmptyState
        className="py-10 text-center text-sm text-[rgb(var(--foreground-muted))]"
        title="Nenhum vídeo para exibir."
      />
    )
  }

  const feed = (
    <div
      ref={containerRef}
      className={[
        'snap-y snap-mandatory overflow-y-auto scroll-smooth',
        onClose ? 'fixed inset-0 z-50 bg-black' : 'h-[calc(100vh-8rem)] rounded-2xl',
      ].join(' ')}
    >
      {onClose && (
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-white">Reels</span>
          <div className="flex items-center gap-2">
            <m.button
              type="button"
              onClick={() => setMuted((m) => !m)}
              whileTap={{ scale: 0.9 }}
              transition={springSnappy}
              className="rounded-full p-2 text-white/80 hover:bg-white/10"
              aria-label={muted ? 'Ativar som' : 'Silenciar'}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </m.button>
            <m.button
              type="button"
              onClick={onClose}
              whileTap={{ scale: 0.9 }}
              transition={springSnappy}
              className="rounded-full p-2 text-white/80 hover:bg-white/10"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </m.button>
          </div>
        </div>
      )}

      {reels.map((post, idx) => {
        const src = videoUrl(post)
        if (!src) return null
        const isActive = idx === activeIdx
        return (
          <m.section
            key={post.id}
            data-idx={idx}
            layout
            animate={{
              scale: isActive ? 1 : 0.96,
              opacity: isActive ? 1 : 0.55,
            }}
            transition={springGentle}
            className="relative flex h-full min-h-[calc(100vh-4rem)] snap-start snap-always flex-col items-center justify-center px-4 py-6"
          >
            <m.video
              ref={(el) => {
                if (el) videoRefs.current.set(idx, el)
                else videoRefs.current.delete(idx)
              }}
              src={src}
              playsInline
              loop
              muted={muted}
              animate={{ scale: isActive ? 1 : 0.98 }}
              transition={springGentle}
              className="max-h-[80vh] w-full max-w-md rounded-2xl object-contain"
            />
            <m.div
              animate={{ opacity: isActive ? 1 : 0.4, y: isActive ? 0 : 8 }}
              transition={springGentle}
              className="mt-4 w-full max-w-md space-y-2"
            >
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
            </m.div>
          </m.section>
        )
      })}
    </div>
  )

  if (onClose && mounted) {
    return (
      <AnimatePresence>
        <m.div
          key="reels-fullscreen"
          variants={lightboxBackdrop}
          initial="hidden"
          animate="show"
          exit="exit"
          transition={{ duration: 0.2 }}
        >
          {feed}
        </m.div>
      </AnimatePresence>
    )
  }

  return feed
}
