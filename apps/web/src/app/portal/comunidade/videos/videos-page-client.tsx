'use client'

import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { LayoutGrid, Smartphone } from 'lucide-react'
import { VideosGrid } from '@/components/portal/videos-grid'
import { VideosReelsFeed } from '@/components/portal/videos-reels-feed'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { fadeUp, springSnappy } from '@/lib/motion-presets'
import type { PostSocialItem } from '@/lib/feed'

interface VideosPageClientProps {
  posts: PostSocialItem[]
}

export function VideosPageClient({ posts }: VideosPageClientProps) {
  const [modo, setModo] = useState<'grid' | 'reels'>('reels')
  const [reelsFullscreen, setReelsFullscreen] = useState(false)

  if (posts.length === 0) {
    return (
      <MotionEmptyState
        className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-14 text-center text-sm text-[rgb(var(--foreground-muted))]"
        title="Nenhum vídeo publicado ainda."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1">
          <m.button
            type="button"
            onClick={() => setModo('reels')}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className={[
              'relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              modo === 'reels'
                ? 'text-[rgb(var(--primary))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {modo === 'reels' && (
              <m.span
                layoutId="videos-modo-indicator"
                className="absolute inset-0 rounded-full bg-[rgb(var(--primary)_/_0.12)]"
                transition={springSnappy}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Smartphone className="h-4 w-4" />
              Reels
            </span>
          </m.button>
          <m.button
            type="button"
            onClick={() => setModo('grid')}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className={[
              'relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              modo === 'grid'
                ? 'text-[rgb(var(--primary))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {modo === 'grid' && (
              <m.span
                layoutId="videos-modo-indicator"
                className="absolute inset-0 rounded-full bg-[rgb(var(--primary)_/_0.12)]"
                transition={springSnappy}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <LayoutGrid className="h-4 w-4" />
              Grade
            </span>
          </m.button>
        </div>
        {modo === 'reels' && (
          <m.button
            type="button"
            onClick={() => setReelsFullscreen(true)}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="text-sm font-medium text-[rgb(var(--primary))] hover:underline"
          >
            Tela cheia
          </m.button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {modo === 'grid' ? (
          <m.div
            key="grid"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
          >
            <VideosGrid posts={posts} />
          </m.div>
        ) : (
          <m.div
            key="reels"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
          >
            <VideosReelsFeed posts={posts} />
          </m.div>
        )}
      </AnimatePresence>

      {reelsFullscreen && (
        <VideosReelsFeed posts={posts} onClose={() => setReelsFullscreen(false)} />
      )}
    </div>
  )
}
