import type { CSSProperties } from 'react'
import { LoaderCircle } from 'lucide-react'

/**
 * Placeholders de carregamento da Comunidade.
 *
 * Contraste vem dos tokens `--skeleton-*` (globals.css), que o tema troca:
 * trilha é tinta do texto sobre a superfície e o brilho que varre é branco
 * — opaco no claro, discreto no escuro. A varredura fica no cartão, não em
 * cada barra, então tudo acende em sincronia com um composite por cartão.
 */

/** Larguras fixas (nunca aleatórias — SSR e cliente têm que casar). */
const LARGURAS_LINHA = ['96%', '78%', '88%', '64%'] as const

function estiloIndice(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}

/** Bloco simples: trilha + varredura. Use para barras e placeholders soltos. */
export function Skeleton({
  className,
  index = 0,
  soft = false,
}: {
  className?: string
  index?: number
  soft?: boolean
}) {
  return (
    <div
      aria-hidden="true"
      style={estiloIndice(index)}
      className={[
        'skeleton-sweep',
        soft ? 'skeleton-track-soft' : 'skeleton-track',
        className ?? '',
      ].join(' ')}
    />
  )
}

interface FeedPostSkeletonProps {
  /** Posição na lista — escalona a varredura do brilho entre cartões. */
  index?: number
  /** Reserva a área de mídia (post com imagem). */
  midia?: boolean
  linhas?: number
  className?: string
}

/**
 * Placeholder de um post. Espelha a geometria do `FeedPostCard` (avatar 40px,
 * nome + @, corpo, barra de engajamento) para a troca pelo conteúdo real não
 * empurrar a lista.
 */
export function FeedPostSkeleton({
  index = 0,
  midia = false,
  linhas = 2,
  className,
}: FeedPostSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={estiloIndice(index)}
      className={[
        'skeleton-sweep card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4',
        className ?? '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div className="skeleton-track h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton-track h-3.5 w-[42%] rounded-full" />
          <div className="skeleton-track-soft h-3 w-[26%] rounded-full" />
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {Array.from({ length: Math.max(1, linhas) }).map((_, i) => (
          <div
            key={i}
            className="skeleton-track-soft h-3.5 rounded-full"
            style={{ width: LARGURAS_LINHA[(index + i) % LARGURAS_LINHA.length] }}
          />
        ))}
      </div>

      {midia && <div className="skeleton-track mt-3 h-44 rounded-xl sm:h-56" />}

      <div className="mt-4 flex items-center gap-2 border-t border-[rgb(var(--border))] pt-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton-track-soft h-8 flex-1 rounded-full" />
        ))}
      </div>
    </div>
  )
}

/** Lista de placeholders — a mídia entra em um cartão a cada três. */
export function FeedPostSkeletonList({
  count = 2,
  startIndex = 0,
  mostrarIndicador = true,
  label = 'Carregando publicações…',
}: {
  count?: number
  startIndex?: number
  mostrarIndicador?: boolean
  label?: string
}) {
  return (
    <div className="relative">
      <div className="space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <FeedPostSkeleton
            key={i}
            index={startIndex + i}
            midia={(startIndex + i) % 3 === 1}
            linhas={2 + ((startIndex + i) % 2)}
          />
        ))}
      </div>

      {mostrarIndicador && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div
            aria-hidden="true"
            className="card-soft inline-flex items-center gap-2.5 rounded-full border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-raised))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground))]"
          >
            <LoaderCircle
              aria-hidden="true"
              className="h-4.5 w-4.5 shrink-0 animate-spin text-[rgb(var(--color-primary-fg))]"
            />
            <span>{label}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Placeholder do composer: avatar, campo e ações. */
export function FeedComposerSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      style={estiloIndice(0)}
      className={[
        'skeleton-sweep rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4',
        className ?? '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div className="skeleton-track h-10 w-10 shrink-0 rounded-full" />
        <div className="skeleton-track-soft h-10 flex-1 rounded-full" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton-track-soft h-7 w-20 rounded-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * Placeholder do rail direito do chrome (salas / canais sugeridos / chat).
 * Usado no Suspense do layout — a largura fica no `ComunidadeLayoutChrome`.
 */
export function ComunidadeRailSkeleton() {
  return (
    <>
      <Skeleton className="h-40 rounded-2xl" soft />
      <Skeleton className="h-48 rounded-2xl" soft />
      <Skeleton className="h-56 rounded-2xl" soft />
    </>
  )
}

/** Placeholder da régua de stories: círculos + legendas. */
export function FeedStoriesSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      style={estiloIndice(0)}
      className={[
        'skeleton-sweep flex gap-4 overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3',
        className ?? '',
      ].join(' ')}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="skeleton-track h-11 w-11 rounded-full" />
          <div className="skeleton-track-soft h-2.5 w-10 rounded-full" />
        </div>
      ))}
    </div>
  )
}
