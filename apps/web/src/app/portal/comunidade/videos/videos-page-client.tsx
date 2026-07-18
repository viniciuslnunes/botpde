'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { LayoutGrid, Plus, Smartphone, Video } from 'lucide-react'
import { VideosGrid } from '@/components/portal/videos-grid'
import { VideosReelsFeed } from '@/components/portal/videos-reels-feed'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { fadeUp, springSnappy } from '@/lib/motion-presets'
import { rankVideosEmAlta } from '@/lib/videos'
import type { PostSocialItem } from '@/lib/feed'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface VideosPageClientProps {
  posts: PostSocialItem[]
  tenantId: string
  currentUser: CurrentUser
}

type SortMode = 'recentes' | 'alta'
type ViewMode = 'reels' | 'grid'

export function VideosPageClient({ posts, tenantId, currentUser }: VideosPageClientProps) {
  const [view, setView] = useState<ViewMode>('reels')
  const [sort, setSort] = useState<SortMode>('recentes')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const ordered = useMemo(() => {
    if (sort === 'alta') return rankVideosEmAlta(posts, tenantId)
    return posts
  }, [posts, sort, tenantId])

  if (posts.length === 0) {
    return (
      <MotionEmptyState
        className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-14 text-center"
        icon={<Video className="mx-auto mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum vídeo publicado ainda"
        description={
          <>
            Envie um vídeo no feed (até 100 MB) com alcance Público para aparecer aqui.
            Links do YouTube ou TikTok continuam só no feed.
            <span className="mt-3 block">
              <Link
                href="/portal/comunidade?compose=1&media=video"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-[rgb(var(--color-primary-on))] hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Publicar vídeo
              </Link>
            </span>
          </>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1">
          {(
            [
              { id: 'reels' as const, label: 'Reels', icon: Smartphone },
              { id: 'grid' as const, label: 'Grade', icon: LayoutGrid },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <m.button
              key={id}
              type="button"
              onClick={() => setView(id)}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              className={[
                'relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                view === id
                  ? 'text-[rgb(var(--color-primary-fg))]'
                  : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {view === id && (
                <m.span
                  layoutId="videos-view-indicator"
                  className="absolute inset-0 rounded-full bg-[rgb(var(--primary)_/_0.12)]"
                  transition={springSnappy}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <Icon className="h-4 w-4" />
                {label}
              </span>
            </m.button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5 text-xs">
            {(
              [
                { id: 'recentes' as const, label: 'Recentes' },
                { id: 'alta' as const, label: 'Em alta' },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={[
                  'rounded-full px-2.5 py-1 font-medium transition-colors',
                  sort === id
                    ? 'bg-[rgb(var(--primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                    : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          <Link
            href="/portal/comunidade?compose=1&media=video"
            className="hidden items-center gap-1 rounded-full bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-on))] sm:inline-flex"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo
          </Link>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'grid' ? (
          <m.div
            key={`grid-${sort}`}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
          >
            <VideosGrid
              posts={ordered}
              onSelect={(index) => setViewerIndex(index)}
            />
          </m.div>
        ) : (
          <m.div
            key={`reels-${sort}`}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
          >
            <VideosReelsFeed posts={ordered} currentUser={currentUser} />
          </m.div>
        )}
      </AnimatePresence>

      {viewerIndex != null && (
        <VideosReelsFeed
          posts={ordered}
          currentUser={currentUser}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}
