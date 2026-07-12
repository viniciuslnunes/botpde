'use client'

import Link from 'next/link'
import Image from 'next/image'
import { m } from 'motion/react'
import { Play } from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { Avatar } from '@/components/portal/avatar'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { isVideoUrl } from '@/lib/comunidade-social'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import type { PostSocialItem } from '@/lib/feed'

interface VideosGridProps {
  posts: PostSocialItem[]
}

function videoThumb(post: PostSocialItem): string | null {
  const video = post.midiaUrls.find(isVideoUrl)
  if (video) return video
  if (post.imagemUrl && isVideoUrl(post.imagemUrl)) return post.imagemUrl
  return post.midiaUrls[0] ?? post.imagemUrl
}

export function VideosGrid({ posts }: VideosGridProps) {
  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {posts.map((post) => {
        const thumb = videoThumb(post)
        return (
          <m.div key={post.id} variants={staggerItem} whileTap={{ scale: 0.97 }} transition={springSnappy}>
            <Link
              href={linkPostComunidade(post.id)}
              className="group relative block aspect-[9/16] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
            >
              {thumb ? (
                thumb.includes('/video/upload/') ? (
                  <video
                    src={thumb}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : canOptimizeImageUrl(thumb) ? (
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                )
              ) : (
                <div className="flex h-full items-center justify-center text-[rgb(var(--foreground-muted))]">
                  <Play className="h-8 w-8" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <div className="flex items-center gap-1.5">
                  <Avatar nome={post.autor.nome} avatarUrl={post.autor.avatarUrl} size="xs" />
                  <span className="line-clamp-1 text-[10px] font-medium text-white">
                    {post.autor.nome ?? 'Membro'}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] text-white/80">{post.conteudo}</p>
              </div>
              <div className="absolute right-2 top-2 rounded-full bg-black/50 p-1">
                <Play className="h-3.5 w-3.5 fill-white text-white" />
              </div>
            </Link>
          </m.div>
        )
      })}
    </m.div>
  )
}
