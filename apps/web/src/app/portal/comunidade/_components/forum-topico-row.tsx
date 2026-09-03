'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { MessagesSquare, Play } from 'lucide-react'
import { faixaEngajamentoTopico, pctAprovacaoPraca, resumoDeCorpoForum } from '@torcida/types'
import { formatFeedPublicadoEm, formatRelative } from '@/lib/format-datetime'
import { isVideoUrl } from '@/lib/comunidade-social'
import { canOptimizeImageUrl, isDurableRemoteImageUrl } from '@/lib/optimizable-image'
import { ForumFeedEngagement } from '@/components/portal/forum-feed-engagement'
import { PracaOrigemBadge, FixadoBadge } from './praca-origem-badge'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { ForumTopicoItem } from '@/lib/praca'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

function StatusChip({ status }: { status: ForumTopicoItem['status'] }) {
  if (status === 'PENDENTE') {
    return (
      <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-semibold text-[rgb(var(--foreground-muted))]">
        Na fila
      </span>
    )
  }
  if (status === 'REJEITADO') {
    return (
      <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
        Recusado
      </span>
    )
  }
  return null
}

function CapaImagem({ src, alt }: { src: string; alt: string }) {
  const [quebrada, setQuebrada] = useState(false)
  if (quebrada || !isDurableRemoteImageUrl(src)) {
    return (
      <span className="flex h-full w-full items-center justify-center">
        <MessagesSquare className="h-7 w-7 text-[rgb(var(--foreground-muted))]" aria-hidden />
      </span>
    )
  }
  if (canOptimizeImageUrl(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 640px) 96px, 80px"
        quality={90}
        className="object-cover"
        onError={() => setQuebrada(true)}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      decoding="async"
      className="h-full w-full object-cover"
      onError={() => setQuebrada(true)}
    />
  )
}

function Thumb({
  urls,
  titulo,
  posicao,
}: {
  urls: string[]
  titulo: string
  posicao?: number
}) {
  const capa = urls.find((u) => isDurableRemoteImageUrl(u)) ?? urls[0]
  const extras = urls.length > 1 ? urls.length - 1 : 0
  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[rgb(var(--background-subtle))] sm:h-24 sm:w-24">
      {capa ? (
        isVideoUrl(capa) ? (
          <>
            <video src={capa} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
              <Play className="h-5 w-5 fill-white text-white" aria-hidden />
            </div>
          </>
        ) : (
          <CapaImagem src={capa} alt="" />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <MessagesSquare className="h-7 w-7 text-[rgb(var(--foreground-muted))]" aria-hidden />
          <span className="sr-only">{titulo}</span>
        </div>
      )}
      {posicao != null ? (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/65 px-1.5 text-[11px] font-semibold tabular-nums text-white">
          {posicao}
        </span>
      ) : null}
      {extras > 0 ? (
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/65 px-1.5 text-[11px] font-semibold text-white">
          +{extras}
        </span>
      ) : null}
    </div>
  )
}

export function ForumTopicoRow({
  topico,
  href,
  posicao,
  escopo,
  currentUser,
}: {
  topico: ForumTopicoItem
  href: string
  posicao?: number
  escopo: EscopoComunidade
  currentUser: CurrentUser
}) {
  const faixa = faixaEngajamentoTopico(topico)
  const pct = pctAprovacaoPraca(topico.gostei, topico.naoGostei)
  const resumo = resumoDeCorpoForum(topico.titulo, topico.corpo, 240)
  const publico = topico.status === 'VISIVEL'
  const publicadoEmLabel = formatFeedPublicadoEm(topico.atualizadoEm)

  return (
    <article className="card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-3.5">
      <Link
        href={href}
        className="flex min-w-0 items-start gap-3 transition-opacity hover:opacity-95 sm:gap-3.5"
      >
        <Thumb urls={topico.midiaUrls} titulo={topico.titulo} posicao={posicao} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PracaOrigemBadge origem="forum" />
            <StatusChip status={topico.status} />
            {topico.fixado ? <FixadoBadge /> : null}
            {faixa === 'epico' ? (
              <span className="text-[10px] font-semibold uppercase text-[rgb(var(--foreground-muted))]">
                Épico
              </span>
            ) : null}
            {faixa === 'lendario' ? (
              <span className="text-[10px] font-semibold uppercase text-[rgb(var(--color-primary-fg))]">
                Lendário
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--foreground))] text-balance">
            {topico.titulo}
          </p>
          {resumo ? (
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[rgb(var(--foreground-muted))] text-pretty">
              {resumo}
            </p>
          ) : null}
          <p className="mt-2 text-[11px] leading-snug text-[rgb(var(--foreground-muted))]">
            {topico.respostasCount} {topico.respostasCount === 1 ? 'resposta' : 'respostas'}
            {pct !== null ? ` · ${pct}% positivo` : topico.gostei > 0 ? ` · ${topico.gostei} apoios` : ''}
            {topico.autorNome ? ` · ${topico.autorNome}` : ''}
            {' · '}
            {formatRelative(topico.atualizadoEm)}
          </p>
        </div>
      </Link>

      {publico ? (
        <ForumFeedEngagement
          topicoId={topico.id}
          escopo={escopo}
          gostei={topico.gostei}
          naoGostei={topico.naoGostei}
          meuVoto={topico.meuVoto}
          totalRespostas={topico.respostasCount}
          currentUser={currentUser}
          publicadoEm={publicadoEmLabel}
        />
      ) : null}
    </article>
  )
}
