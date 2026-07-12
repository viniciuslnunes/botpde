'use client'

import { useState } from 'react'
import { LayoutGrid, Smartphone } from 'lucide-react'
import { VideosGrid } from '@/components/portal/videos-grid'
import { VideosReelsFeed } from '@/components/portal/videos-reels-feed'
import type { PostSocialItem } from '@/lib/feed'

interface VideosPageClientProps {
  posts: PostSocialItem[]
}

export function VideosPageClient({ posts }: VideosPageClientProps) {
  const [modo, setModo] = useState<'grid' | 'reels'>('reels')
  const [reelsFullscreen, setReelsFullscreen] = useState(false)

  if (posts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-14 text-center text-sm text-[rgb(var(--foreground-muted))]">
        Nenhum vídeo publicado ainda.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1">
          <button
            type="button"
            onClick={() => setModo('reels')}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              modo === 'reels'
                ? 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            <Smartphone className="h-4 w-4" />
            Reels
          </button>
          <button
            type="button"
            onClick={() => setModo('grid')}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              modo === 'grid'
                ? 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            <LayoutGrid className="h-4 w-4" />
            Grade
          </button>
        </div>
        {modo === 'reels' && (
          <button
            type="button"
            onClick={() => setReelsFullscreen(true)}
            className="text-sm font-medium text-[rgb(var(--primary))] hover:underline"
          >
            Tela cheia
          </button>
        )}
      </div>

      {modo === 'grid' ? (
        <VideosGrid posts={posts} />
      ) : (
        <VideosReelsFeed posts={posts} />
      )}

      {reelsFullscreen && (
        <VideosReelsFeed posts={posts} onClose={() => setReelsFullscreen(false)} />
      )}
    </div>
  )
}
