'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { canOptimizeImageUrl, filterDurableImageUrls } from '@/lib/optimizable-image'
import { MediaLightbox } from '@/components/portal/media-lightbox'
import {
  classifyMedia,
  cloudinaryVideoPoster,
  detectEmbedProvider,
  EMBED_HOSTS,
  instagramEmbedSrc,
  tiktokEmbedSrc,
  twitterEmbedSrc,
  youTubeId,
  type EmbedProvider,
  type MediaAttachment,
} from '@/lib/social-embed'

interface PostMediaProps {
  urls: string[]
  caption?: string | null
}

export function PostMedia({ urls, caption }: PostMediaProps) {
  const { media, embeds } = classifyMedia(filterDurableImageUrls(urls))
  const slides = media.filter((m) => m.type !== 'sticker')
  const stickers = media.filter((m) => m.type === 'sticker')
  if (media.length === 0 && embeds.length === 0) return null

  return (
    <div className="mt-3 space-y-3">
      {slides.length > 0 && <MediaCarousel slides={slides} caption={caption} />}
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

function Slide({
  item,
  className,
  onOpen,
}: {
  item: MediaAttachment
  className: string
  onOpen?: () => void
}) {
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

  const imageClassName = onOpen ? `${className} cursor-zoom-in` : className

  if (canOptimizeImageUrl(item.url)) {
    return (
      <Image
        src={item.url}
        alt=""
        width={1200}
        height={800}
        sizes="(max-width: 768px) 100vw, 640px"
        className={imageClassName}
        onClick={onOpen}
        onError={() => setBroken(true)}
      />
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={item.url}
      alt=""
      className={imageClassName}
      loading="lazy"
      decoding="async"
      onClick={onOpen}
      onError={() => setBroken(true)}
    />
  )
}

function MediaCarousel({ slides, caption }: { slides: MediaAttachment[]; caption?: string | null }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const imageUrls = slides.filter((s) => s.type === 'image').map((s) => s.url)

  function openLightbox(url: string) {
    const i = imageUrls.indexOf(url)
    if (i >= 0) setLightboxIdx(i)
  }

  if (slides.length === 1) {
    const only = slides[0]
    return (
      <>
        <Slide
          item={only}
          className="max-h-[32rem] w-full rounded-xl border border-[rgb(var(--border))] object-contain"
          onOpen={only.type === 'image' ? () => openLightbox(only.url) : undefined}
        />
        {lightboxIdx != null && (
          <MediaLightbox
            urls={imageUrls}
            index={lightboxIdx}
            caption={caption}
            onClose={() => setLightboxIdx(null)}
            onIndexChange={setLightboxIdx}
          />
        )}
      </>
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
            className="h-[22rem] w-full min-w-full shrink-0 basis-full snap-center bg-black object-contain sm:h-[28rem]"
            onOpen={item.type === 'image' ? () => openLightbox(item.url) : undefined}
          />
        ))}
      </div>

      {lightboxIdx != null && (
        <MediaLightbox
          urls={imageUrls}
          index={lightboxIdx}
          caption={caption}
          onClose={() => setLightboxIdx(null)}
          onIndexChange={setLightboxIdx}
        />
      )}

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
      className="flex w-full items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3 transition-colors hover:border-[rgb(var(--border-strong))]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgb(var(--color-primary)_/_0.1)] text-[rgb(var(--color-primary-fg))]">
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

function embedIframeSrc(provider: EmbedProvider, url: string): string | null {
  if (provider === 'youtube') {
    const id = youTubeId(url)
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (provider === 'instagram') return instagramEmbedSrc(url)
  if (provider === 'twitter') return twitterEmbedSrc(url)
  if (provider === 'tiktok') return tiktokEmbedSrc(url)
  return null
}

function embedFrameHeight(provider: EmbedProvider, url: string): number {
  if (provider === 'youtube') return 0 // aspect-video
  if (provider === 'instagram') return /\/(reel|reels)\//i.test(url) ? 760 : 640
  if (provider === 'tiktok') return 740
  if (provider === 'twitter') return 520
  return 560
}

function SocialEmbed({ url }: { url: string }) {
  const provider = detectEmbedProvider(url)
  if (!provider) return null

  const src = embedIframeSrc(provider, url)
  if (!src) return <EmbedFallback url={url} provider={provider} />

  const height = embedFrameHeight(provider, url)
  const isVideoAspect = provider === 'youtube'

  return (
    <div className="social-embed w-full min-w-0 space-y-2">
      <div
        className={[
          'w-full overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-white',
          isVideoAspect ? 'aspect-video' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={isVideoAspect ? undefined : { height }}
      >
        <iframe
          src={src}
          title={EMBED_HOSTS[provider]}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-primary-fg))] underline decoration-[rgb(var(--color-primary-fg)_/_0.4)] underline-offset-2 hover:decoration-[rgb(var(--color-primary-fg))]"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Abrir no {EMBED_HOSTS[provider]}
      </a>
    </div>
  )
}
