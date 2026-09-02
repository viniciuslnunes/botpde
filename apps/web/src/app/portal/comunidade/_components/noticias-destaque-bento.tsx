'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { NoticiasArtigoGerir } from './noticias-artigo-gerir'
import { NoticiasCapaThumb } from './noticias-capa-thumb'
import { FixadoBadge, PracaOrigemBadge } from './praca-origem-badge'
import {
  capaNoticia,
  formatMetaNoticia,
  hrefNoticiaPraca,
  resumoNoticia,
  rotuloCategoriaNoticia,
} from '@/lib/noticias-feed-layout'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { NoticiaPracaItem } from '@/lib/praca'

type Props = {
  destaques: NoticiaPracaItem[]
  sufixo: string
  escopo: EscopoComunidade
  podeGerir: boolean
  userId: string
}

function DestaquePrincipal({
  item,
  href,
  escopo,
  podeGerir,
  userId,
}: {
  item: NoticiaPracaItem
  href: string
  escopo: EscopoComunidade
  podeGerir: boolean
  userId: string
}) {
  const capa = capaNoticia(item)
  const resumo = resumoNoticia(item)

  return (
    <article className="group relative min-h-[280px] overflow-hidden rounded-2xl sm:min-h-[360px]">
      <Link href={href} className="absolute inset-0 block">
        <div className="absolute inset-0">
          <NoticiasCapaThumb
            url={capa}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {item.fixado ? <FixadoBadge /> : null}
            <PracaOrigemBadge origem={item.origem} />
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm">
              {rotuloCategoriaNoticia(item)}
            </span>
          </div>
          <h2 className="text-xl font-bold leading-snug text-white sm:text-2xl">{item.titulo}</h2>
          {resumo ? (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/85">{resumo}</p>
          ) : null}
          <p className="mt-3 flex flex-wrap items-center gap-x-3 text-xs text-white/70">
            <span>{formatMetaNoticia(item)}</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" aria-hidden />
              {item.visitas}
            </span>
          </p>
        </div>
      </Link>
      <NoticiasArtigoGerir
        item={item}
        escopo={escopo}
        podeGerir={podeGerir}
        userId={userId}
        className="absolute right-2 top-2 z-10"
        sobreEscuro
      />
    </article>
  )
}

function DestaqueSecundario({
  item,
  href,
  escopo,
  podeGerir,
  userId,
}: {
  item: NoticiaPracaItem
  href: string
  escopo: EscopoComunidade
  podeGerir: boolean
  userId: string
}) {
  const capa = capaNoticia(item)
  const resumo = resumoNoticia(item)

  return (
    <article className="group relative min-h-[168px] overflow-hidden rounded-2xl sm:min-h-[176px]">
      <Link href={href} className="absolute inset-0 block">
        <div className="absolute inset-0">
          <NoticiasCapaThumb
            url={capa}
            alt=""
            fill
            sizes="(max-width: 1024px) 50vw, 30vw"
            className="transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/75">
            {rotuloCategoriaNoticia(item)}
          </span>
          <h3 className="mt-1 line-clamp-3 text-sm font-bold leading-snug text-white sm:text-base">
            {item.titulo}
          </h3>
          {resumo ? (
            <p className="mt-1 line-clamp-1 text-xs text-white/75">{resumo}</p>
          ) : null}
        </div>
      </Link>
      <NoticiasArtigoGerir
        item={item}
        escopo={escopo}
        podeGerir={podeGerir}
        userId={userId}
        className="absolute right-2 top-2 z-10"
        sobreEscuro
      />
    </article>
  )
}

export function NoticiasDestaqueBento({
  destaques,
  sufixo,
  escopo,
  podeGerir,
  userId,
}: Props) {
  const [principal, ...secundarios] = destaques
  if (!principal) return null

  return (
    <section aria-label="Destaques" className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Em destaque
      </h2>
      <div className="grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:grid-rows-2">
        <div className="lg:row-span-2">
          <DestaquePrincipal
            item={principal}
            href={hrefNoticiaPraca(principal.id, sufixo)}
            escopo={escopo}
            podeGerir={podeGerir}
            userId={userId}
          />
        </div>
        {secundarios.map((item) => (
          <DestaqueSecundario
            key={`${item.kind}-${item.id}`}
            item={item}
            href={hrefNoticiaPraca(item.id, sufixo)}
            escopo={escopo}
            podeGerir={podeGerir}
            userId={userId}
          />
        ))}
      </div>
    </section>
  )
}
