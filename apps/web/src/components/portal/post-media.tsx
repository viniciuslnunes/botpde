'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useTheme } from 'next-themes'
import { canOptimizeImageUrl, filterDurableImageUrls } from '@/lib/optimizable-image'
import { MediaLightbox } from '@/components/portal/media-lightbox'
import {
  classifyMedia,
  cloudinaryVideoPoster,
  detectEmbedProvider,
  EMBED_HOSTS,
  embedSupportsColorScheme,
  estimateEmbedHeight,
  instagramPermalink,
  resolveEmbedFrameWidth,
  tiktokVideoId,
  youTubeId,
  type EmbedProvider,
  type MediaAttachment,
} from '@/lib/social-embed'

const EMBED_SCRIPTS: Partial<Record<EmbedProvider, string>> = {
  twitter: 'https://platform.twitter.com/widgets.js',
  // Permalink canônico (sem /username/ no path) — evita iframe da home (XFO deny).
  instagram: 'https://www.instagram.com/embed.js',
  tiktok: 'https://www.tiktok.com/embed.js',
}

const loadedScripts = new Set<string>()

function loadEmbedScript(provider: EmbedProvider): Promise<void> {
  const src = EMBED_SCRIPTS[provider]
  if (!src) return Promise.resolve()

  // TikTok só faz scan no load do script — precisa de um script fresco por mount.
  if (provider === 'tiktok') {
    document.querySelectorAll('script[data-torcida-tiktok-embed]').forEach((n) => n.remove())
    return new Promise((resolve) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.dataset.torcidaTiktokEmbed = '1'
      s.onload = () => resolve()
      s.onerror = () => resolve()
      document.body.appendChild(s)
    })
  }

  return new Promise((resolve) => {
    if (loadedScripts.has(src)) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      loadedScripts.add(src)
      return resolve()
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => {
      loadedScripts.add(src)
      resolve()
    }
    s.onerror = () => resolve()
    document.body.appendChild(s)
  })
}

function processOfficialEmbed(provider: EmbedProvider, host: HTMLElement) {
  const w = window as unknown as {
    twttr?: { widgets?: { load: (el?: HTMLElement | null) => void } }
    instgrm?: { Embeds?: { process: () => void } }
  }
  if (provider === 'twitter') w.twttr?.widgets?.load(host)
  if (provider === 'instagram') w.instgrm?.Embeds?.process()
}

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
  return (
    // Fallback de URL que o next/image não otimiza (canOptimizeImageUrl false).
    // eslint-disable-next-line @next/next/no-img-element -- <Image /> aqui quebraria
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
  const scrollRafRef = useRef<number | undefined>(undefined)
  const [index, setIndex] = useState(0)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== undefined) window.cancelAnimationFrame(scrollRafRef.current)
    }
  }, [])

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

  // Throttle via rAF: o evento nativo de scroll do carrossel dispara a
  // 60-120Hz durante o swipe; setState por evento travava o gesto (mesma
  // causa corrigida em use-feed-pull-refresh.ts).
  function onScroll() {
    if (scrollRafRef.current !== undefined) return
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = undefined
      const track = trackRef.current
      if (!track) return
      setIndex(Math.round(track.scrollLeft / track.clientWidth))
    })
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

/** Placeholder enquanto o widget oficial (script + iframe) ainda não montou. */
function EmbedSkeleton({
  provider,
  height,
  fill = false,
}: {
  provider: EmbedProvider
  height?: number
  /** Preenche o container (ex.: aspect-video do YouTube). */
  fill?: boolean
}) {
  const mediaMinH =
    provider === 'youtube'
      ? undefined
      : Math.max((height ?? 220) - (provider === 'tiktok' ? 120 : 140), 140)

  return (
    <div
      role="status"
      aria-label={`Carregando publicação do ${EMBED_HOSTS[provider]}`}
      className={[
        'pointer-events-none animate-pulse overflow-hidden bg-[rgb(var(--background-subtle))]',
        fill ? 'absolute inset-0 z-[1]' : 'absolute inset-x-0 top-0 z-[1]',
      ].join(' ')}
      style={fill ? undefined : { height: height ?? 220 }}
    >
      {provider !== 'youtube' && (
        <div className="flex items-center gap-3 p-4">
          <div className="h-10 w-10 shrink-0 rounded-full bg-[rgb(var(--border)_/_0.65)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-[38%] rounded-md bg-[rgb(var(--border)_/_0.65)]" />
            <div className="h-2.5 w-[24%] rounded-md bg-[rgb(var(--border)_/_0.45)]" />
          </div>
        </div>
      )}
      <div
        className={[
          'rounded-lg bg-[rgb(var(--border)_/_0.45)]',
          provider === 'youtube' ? 'absolute inset-0 rounded-none' : 'mx-4',
        ].join(' ')}
        style={mediaMinH != null ? { minHeight: mediaMinH } : undefined}
      />
      {provider !== 'youtube' && (
        <div className="space-y-2 px-4 py-4">
          <div className="h-2.5 w-full rounded-md bg-[rgb(var(--border)_/_0.45)]" />
          <div className="h-2.5 w-[68%] rounded-md bg-[rgb(var(--border)_/_0.35)]" />
        </div>
      )}
    </div>
  )
}

function YouTubeEmbed({ url, videoId }: { url: string; videoId: string }) {
  const [ready, setReady] = useState(false)

  return (
    <div className="social-embed w-full min-w-0 space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-black">
        {!ready && <EmbedSkeleton provider="youtube" fill />}
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title="YouTube"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure"
          allowFullScreen
          onLoad={() => setReady(true)}
          className={[
            'relative z-[2] h-full w-full border-0 transition-opacity duration-200',
            ready ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
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
        Abrir no {EMBED_HOSTS.youtube}
      </a>
    </div>
  )
}

function SocialEmbed({ url }: { url: string }) {
  const provider = detectEmbedProvider(url)
  const { resolvedTheme } = useTheme()
  /** Preferência do portal; undefined (SSR) → dark, alinhado ao restante da UI. */
  const colorScheme = resolvedTheme === 'light' ? 'light' : 'dark'
  const themeAware = provider != null && embedSupportsColorScheme(provider)
  const shellRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  /**
   * Qual versão do embed já foi montada (`rearmeKey`), não um booleano.
   * Guardando a chave, trocar URL/tema invalida sozinho — não é preciso um
   * effect zerando a flag, que seria escrita em ref durante o render.
   */
  const processedRef = useRef<string | null>(null)
  const [cardWidth, setCardWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const [activated, setActivated] = useState(false)
  const [hasFrame, setHasFrame] = useState(false)

  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setCardWidth(w)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [url])

  // content-visibility no feed: só processa widget quando entra na viewport
  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '240px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [url])

  // Rearma o embed no render quando muda a URL — ou o tema, nos widgets que só
  // leem o esquema na criação (hoje: X). Em effect, o frame anterior continuava
  // montado por um render depois da troca.
  // `visible` só volta a false na troca de URL: o embed já visível não precisa
  // reentrar no viewport só porque o tema mudou.
  const rearmeKey = `${url}|${themeAware ? colorScheme : ''}`
  const [rearmeSincronizado, setRearmeSincronizado] = useState(rearmeKey)
  const [urlSincronizada, setUrlSincronizada] = useState(url)
  if (rearmeKey !== rearmeSincronizado) {
    setRearmeSincronizado(rearmeKey)
    setActivated(false)
    setHasFrame(false)
    if (url !== urlSincronizada) {
      setUrlSincronizada(url)
      setVisible(false)
    }
  }

  useEffect(() => {
    if (!provider || provider === 'youtube') return
    if (!visible || cardWidth <= 0 || processedRef.current === rearmeKey) return
    const host = hostRef.current
    if (!host) return

    processedRef.current = rearmeKey
    void loadEmbedScript(provider).then(() => {
      processOfficialEmbed(provider, host)
      setActivated(true)
    })
  }, [provider, url, visible, cardWidth, colorScheme, rearmeKey])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !activated) return
    const mo = new MutationObserver(() => {
      if (host.querySelector('iframe')) {
        setHasFrame(true)
        mo.disconnect()
      }
    })
    if (host.querySelector('iframe')) {
      setHasFrame(true)
    } else {
      mo.observe(host, { childList: true, subtree: true })
    }
    return () => mo.disconnect()
  }, [activated, url])

  if (!provider) return null

  if (provider === 'youtube') {
    const id = youTubeId(url)
    if (!id) return <EmbedFallback url={url} provider={provider} />
    return <YouTubeEmbed url={url} videoId={id} />
  }

  const frameWidth = resolveEmbedFrameWidth(provider, cardWidth || 360)
  const skeletonHeight = estimateEmbedHeight(provider, url, cardWidth || 360)
  const igPermalink = provider === 'instagram' ? instagramPermalink(url) : null
  if (provider === 'instagram' && !igPermalink) {
    return <EmbedFallback url={url} provider={provider} />
  }
  const videoId = provider === 'tiktok' ? tiktokVideoId(url) : null
  if (provider === 'tiktok' && !videoId) {
    return <EmbedFallback url={url} provider={provider} />
  }

  // Sem bg/borda no host: o widget (X) já pinta o card; chrome nosso vira filete.
  return (
    <div ref={shellRef} className="social-embed w-full min-w-0 space-y-2">
      <div
        ref={hostRef}
        className="social-embed-host relative mx-auto overflow-hidden rounded-xl"
        style={{
          width: frameWidth,
          maxWidth: '100%',
          minHeight: hasFrame ? undefined : skeletonHeight,
        }}
      >
        <div key={themeAware ? `embed-${colorScheme}` : 'embed'}>
          {!hasFrame && <EmbedSkeleton provider={provider} height={skeletonHeight} />}
          {cardWidth > 0 && (
            <>
              {provider === 'twitter' && (
                <blockquote
                  className="twitter-tweet"
                  data-dnt="true"
                  data-theme={colorScheme}
                  data-width={String(frameWidth)}
                >
                  <a href={url}>{url}</a>
                </blockquote>
              )}
              {provider === 'instagram' && igPermalink && (
                <blockquote
                  className="instagram-media"
                  data-instgrm-permalink={igPermalink}
                  data-instgrm-version="14"
                  data-width={String(frameWidth)}
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: '100%',
                    margin: 0,
                    background: '#fff',
                  }}
                >
                  <a href={igPermalink}>{igPermalink}</a>
                </blockquote>
              )}
              {provider === 'tiktok' && videoId && (
                <blockquote
                  className="tiktok-embed"
                  cite={url}
                  data-video-id={videoId}
                  style={{
                    width: '100%',
                    maxWidth: frameWidth,
                    minWidth: 0,
                    margin: 0,
                  }}
                >
                  <a href={url}>{url}</a>
                </blockquote>
              )}
            </>
          )}
        </div>
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
