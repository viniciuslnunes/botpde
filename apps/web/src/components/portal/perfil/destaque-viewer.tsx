'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AnimatePresence, m, type PanInfo } from 'motion/react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar } from '../avatar'
import { PostConteudoRich } from '../post-conteudo-rich'
import { PostMedia } from '../post-media'
import { PostPoll } from '../post-poll'
import { PostRepostEmbed } from '../post-repost-embed'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { ensureSocialEmbedInMidias, stripEmbeddedSocialUrls } from '@/lib/social-embed'
import { lightboxBackdrop, springGentle, springSnappy, storySlideVariants } from '@/lib/motion-presets'
import type { DestaquePerfilItem } from '@/lib/feed'

interface DestaqueViewerProps {
  destaques: DestaquePerfilItem[]
  userId: string
  autorNome: string | null
  onClose: () => void
  initialDestaqueIndex?: number
}

const SWIPE_THRESHOLD = 72

export function DestaqueViewer({
  destaques,
  autorNome,
  onClose,
  initialDestaqueIndex = 0,
}: DestaqueViewerProps) {
  const [mounted, setMounted] = useState(false)
  const [destaqueIdx, setDestaqueIdx] = useState(initialDestaqueIndex)
  const [postIdx, setPostIdx] = useState(0)
  const [slideDir, setSlideDir] = useState(1)

  const destaque = destaques[destaqueIdx]
  const posts = destaque?.posts ?? []
  const post = posts[postIdx]
  const contentKey = `${destaqueIdx}-${postIdx}`

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const avancar = useCallback(() => {
    if (!destaque) return
    setSlideDir(1)
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
    setSlideDir(-1)
    if (postIdx > 0) {
      setPostIdx((i) => i - 1)
    } else if (destaqueIdx > 0) {
      const prev = destaques[destaqueIdx - 1]
      setDestaqueIdx((i) => i - 1)
      setPostIdx(Math.max(0, (prev?.posts.length ?? 1) - 1))
    }
  }, [destaqueIdx, destaques, postIdx])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -SWIPE_THRESHOLD) avancar()
    else if (info.offset.x > SWIPE_THRESHOLD) voltar()
  }

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

  if (!destaque || !post || !mounted) return null

  const progressPct = posts.length > 0 ? ((postIdx + 1) / posts.length) * 100 : 100

  const viewer = (
    <AnimatePresence>
      <m.div
        key="destaque-viewer"
        variants={lightboxBackdrop}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex flex-col bg-black/95"
      >
        <div className="flex items-center gap-1 px-3 pt-3">
          {posts.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <m.div
                className="h-full bg-white"
                initial={false}
                animate={{
                  width: i < postIdx ? '100%' : i === postIdx ? `${progressPct}%` : '0%',
                }}
                transition={i === postIdx ? springSnappy : springGentle}
              />
            </div>
          ))}
        </div>

        <header className="flex items-center justify-between px-4 py-3">
          <m.div layout className="flex items-center gap-2" transition={springGentle}>
            <Avatar nome={autorNome} avatarUrl={post.autor.avatarUrl} size="sm" />
            <div>
              <p className="text-sm font-semibold text-white">{autorNome ?? 'Membro'}</p>
              <p className="text-xs text-white/60">{destaque.titulo}</p>
            </div>
          </m.div>
          <m.button
            type="button"
            onClick={onClose}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            aria-label="Fechar"
            className="rounded-full p-2 text-white/80 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </m.button>
        </header>

        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 pb-6">
          <m.button
            type="button"
            aria-label="Anterior"
            onClick={voltar}
            disabled={destaqueIdx === 0 && postIdx === 0}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="h-8 w-8" />
          </m.button>

          <AnimatePresence mode="wait" custom={slideDir}>
            <m.div
              key={contentKey}
              custom={slideDir}
              variants={storySlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={onDragEnd}
              className="w-full max-w-lg cursor-grab space-y-4 active:cursor-grabbing"
            >
              {(() => {
                const midias = ensureSocialEmbedInMidias(post.conteudo, post.midiaUrls)
                const texto = stripEmbeddedSocialUrls(post.conteudo, midias)
                return (
                  <>
                    {texto ? (
                      <PostConteudoRich conteudo={texto} className="text-center text-lg text-white" />
                    ) : null}
                    {midias.length > 0 && (
                      <div className="overflow-hidden rounded-2xl">
                        <PostMedia urls={midias} />
                      </div>
                    )}
                  </>
                )
              })()}
              {post.postOrigem && <PostRepostEmbed origem={post.postOrigem} />}
              {post.enquete && <PostPoll enquete={post.enquete} />}
              <Link
                href={linkPostComunidade(post.id)}
                className="block text-center text-xs text-white/50 hover:text-white/80"
              >
                Ver publicação completa →
              </Link>
            </m.div>
          </AnimatePresence>

          <m.button
            type="button"
            aria-label="Próximo"
            onClick={avancar}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10"
          >
            <ChevronRight className="h-8 w-8" />
          </m.button>
        </div>
      </m.div>
    </AnimatePresence>
  )

  return createPortal(viewer, document.body)
}
