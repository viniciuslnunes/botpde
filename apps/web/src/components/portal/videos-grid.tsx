'use client'

import Image from 'next/image'
import { m } from 'motion/react'
import { Heart, MessageCircle, Play } from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { Avatar } from '@/components/portal/avatar'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { resolveVideoPoster, resolveVideoSrc } from '@/lib/videos'
import type { PostSocialItem } from '@/lib/feed'

interface VideosGridProps {
  posts: PostSocialItem[]
  onSelect: (index: number) => void
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${Math.round(n / 1000)}k`
}

export function VideosGrid({ posts, onSelect }: VideosGridProps) {
  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2"
    >
      {posts.map((post, index) => {
        const src = resolveVideoSrc(post)
        const poster = resolveVideoPoster(post)
        const thumb = poster ?? src
        return (
          <m.div key={post.id} variants={staggerItem} whileTap={{ scale: 0.97 }} transition={springSnappy}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              className="group relative block aspect-[9/16] w-full overflow-hidden rounded-xl bg-[rgb(var(--background-subtle))] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--primary))]"
            >
              {thumb ? (
                canOptimizeImageUrl(thumb) ? (
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : thumb.includes('/video/upload/') && !poster ? (
                  <video
                    src={thumb}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )
              ) : (
                <div className="flex h-full items-center justify-center text-[rgb(var(--foreground-muted))]">
                  <Play className="h-8 w-8" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <div className="absolute left-2 top-2 flex items-center gap-2 text-[10px] font-semibold text-white drop-shadow">
                <span className="inline-flex items-center gap-0.5">
                  <Heart className="h-3 w-3 fill-white" />
                  {formatCount(post.totalReacoes)}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <MessageCircle className="h-3 w-3" />
                  {formatCount(post.totalComentarios)}
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <div className="flex items-center gap-1.5">
                  <Avatar nome={post.autor.nome} avatarUrl={post.autor.avatarUrl} size="xs" />
                  <span className="line-clamp-1 text-[10px] font-medium text-white">
                    {post.autor.nome ?? 'Membro'}
                  </span>
                </div>
              </div>
              <div className="absolute right-2 top-2 rounded-full bg-black/45 p-1.5 backdrop-blur-sm">
                <Play className="h-3.5 w-3.5 fill-white text-white" />
              </div>
            </button>
          </m.div>
        )
      })}
    </m.div>
  )
}
