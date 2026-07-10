'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import {
  classifyMedia,
  cloudinaryVideoPoster,
  detectEmbedProvider,
  EMBED_HOSTS,
  youTubeId,
  type EmbedProvider,
  type MediaAttachment,
} from '@/lib/social-embed'

const SCRIPTS: Partial<Record<EmbedProvider, string>> = {
  twitter: 'https://platform.twitter.com/widgets.js',
  instagram: 'https://www.instagram.com/embed.js',
  tiktok: 'https://www.tiktok.com/embed.js',
}

const loaded = new Set<string>()

function loadScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (loaded.has(src)) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      loaded.add(src)
      return resolve()
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => {
      loaded.add(src)
      resolve()
    }
    s.onerror = () => resolve()
    document.body.appendChild(s)
  })
}

interface PostMediaProps {
  urls: string[]
}

export function PostMedia({ urls }: PostMediaProps) {
  const { media, embeds } = classifyMedia(urls)
  const slides = media.filter((m) => m.type !== 'sticker')
  const stickers = media.filter((m) => m.type === 'sticker')
  if (media.length === 0 && embeds.length === 0) return null

  return (
    <div className="mt-3 space-y-3">
      {slides.length > 0 && <MediaCarousel slides={slides} />}
      {stickers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stickers.map((s) =>
            canOptimizeImageUrl(s.url) ? (
              <Image
                key={s.url}
                src={s.url}
                alt="Sticker"
                width={112}
                height={112}
                className="h-28 w-28 object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s.url} src={s.url} alt="Sticker" className="h-28 w-28 object-contain" />
            ),
          )}
        </div>
      )}
      {embeds.map((url) => (
        <SocialEmbed key={url} url={url} />
      ))}
    </div>
  )
}

function Slide({ item, className }: { item: MediaAttachment; className: string }) {
  const [broken, setBroken] = useState(false)

  if (broken) {
    return (
      <div
        className={[
          'flex items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-xs text-[rgb(var(--foreground-muted))]',
          className,
        ].join(' ')}
      >
        Imagem indisponível
      </div>
    )
  }

  if (item.type === 'video') {
    return (
      <video
        src={item.url}
        poster={cloudinaryVideoPoster(item.url)}
        controls
        playsInline
        preload="metadata"
        className={className}
      />
    )
  }
  if (canOptimizeImageUrl(item.url)) {
    return (
      <Image
        src={item.url}
        alt=""
        width={1200}
        height={800}
        sizes="(max-width: 768px) 100vw, 640px"
        className={className}
        onError={() => setBroken(true)}
      />
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={item.url}
      alt=""
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  )
}

function MediaCarousel({ slides }: { slides: MediaAttachment[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  if (slides.length === 1) {
    return (
      <Slide
        item={slides[0]}
        className="max-h-[32rem] w-full rounded-xl border border-[rgb(var(--border))] object-contain"
      />
    )
  }

  function scrollTo(i: number) {
    const track = trackRef.current
    if (!track) return
    const clamped = Math.max(0, Math.min(slides.length - 1, i))
    track.scrollTo({ left: clamped * track.clientWidth, behavior: 'smooth' })
    setIndex(clamped)
  }

  function onScroll() {
    const track = trackRef.current
    if (!track) return
    setIndex(Math.round(track.scrollLeft / track.clientWidth))
  }

  return (
    <div className="group relative">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl border border-[rgb(var(--border))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((item, i) => (
          <Slide
            key={i}
            item={item}
            className="h-[22rem] w-full shrink-0 snap-center bg-black object-contain sm:h-[28rem]"
          />
        ))}
      </div>

      {index > 0 && (
        <button
          type="button"
          onClick={() => scrollTo(index - 1)}
          aria-label="Imagem anterior"
          className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {index < slides.length - 1 && (
        <button
          type="button"
          onClick={() => scrollTo(index + 1)}
          aria-label="Próxima imagem"
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {index + 1}/{slides.length}
      </div>

      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={`Ir para imagem ${i + 1}`}
            className={[
              'h-1.5 rounded-full transition-all',
              i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50',
            ].join(' ')}
          />
        ))}
      </div>
    </div>
  )
}

function EmbedFallback({ url, provider }: { url: string; provider: EmbedProvider }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3 transition-colors hover:border-[rgb(var(--border-strong))]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]">
        <ExternalLink className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[rgb(var(--foreground))]">
          Publicação no {EMBED_HOSTS[provider]}
        </p>
        <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{url}</p>
      </div>
    </a>
  )
}

function SocialEmbed({ url }: { url: string }) {
  const provider = detectEmbedProvider(url)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!provider || provider === 'youtube') return
    const src = SCRIPTS[provider]
    if (!src) return
    let cancelled = false
    void loadScript(src).then(() => {
      if (cancelled) return
      const w = window as unknown as {
        twttr?: { widgets?: { load: (el?: HTMLElement | null) => void } }
        instgrm?: { Embeds?: { process: () => void } }
      }
      if (provider === 'twitter') w.twttr?.widgets?.load(containerRef.current)
      if (provider === 'instagram') w.instgrm?.Embeds?.process()
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [provider, url])

  if (!provider) return null

  if (provider === 'youtube') {
    const id = youTubeId(url)
    if (!id) return <EmbedFallback url={url} provider={provider} />
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-[rgb(var(--border))]">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="overflow-hidden">
      {provider === 'twitter' && (
        <blockquote className="twitter-tweet" data-dnt="true">
          <a href={url}>{url}</a>
        </blockquote>
      )}
      {provider === 'instagram' && (
        <blockquote
          className="instagram-media"
          data-instgrm-permalink={url}
          data-instgrm-version="14"
        >
          <a href={url}>{url}</a>
        </blockquote>
      )}
      {provider === 'tiktok' && (
        <blockquote className="tiktok-embed" cite={url}>
          <a href={url}>{url}</a>
        </blockquote>
      )}
      {!ready && <EmbedFallback url={url} provider={provider} />}
    </div>
  )
}
