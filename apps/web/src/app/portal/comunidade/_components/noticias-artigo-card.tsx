'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { NoticiasArtigoGerir } from './noticias-artigo-gerir'
import { NoticiasCapaThumb } from './noticias-capa-thumb'
import { FixadoBadge, PracaOrigemBadge } from './praca-origem-badge'
import {
  capaNoticia,
  formatMetaNoticia,
  resumoNoticia,
  rotuloCategoriaNoticia,
} from '@/lib/noticias-feed-layout'
import { NoticiasRelacionadosLinks } from './noticias-relacionados-links'
import { NoticiasPracaFeedEngagement } from '@/components/portal/noticias-praca-feed-engagement'
import { formatFeedPublicadoEm } from '@/lib/format-datetime'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { NoticiaPracaItem } from '@/lib/praca'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

export function NoticiasArtigoCard({
  item,
  href,
  escopo,
  podeGerir,
  userId,
  posicao,
  variant = 'lista',
  sufixo,
  currentUser,
}: {
  item: NoticiaPracaItem
  href: string
  escopo: EscopoComunidade
  podeGerir: boolean
  userId: string
  posicao?: number
  /** `lista` = linha horizontal estilo portal esportivo; `card` = legado empilhado. */
  variant?: 'lista' | 'card'
  sufixo?: string
  currentUser?: CurrentUser
}) {
  if (variant === 'card') {
    return (
      <NoticiasArtigoCardEmpilhado
        item={item}
        href={href}
        escopo={escopo}
        podeGerir={podeGerir}
        userId={userId}
        posicao={posicao}
        currentUser={currentUser}
      />
    )
  }

  const capa = capaNoticia(item)
  const resumo = resumoNoticia(item)
  const categoria = rotuloCategoriaNoticia(item)
  const alvoTipo = item.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO'
  const publicadoEmLabel = formatFeedPublicadoEm(item.publicadoEm ?? item.criadoEm)

  return (
    <article className="group relative py-4">
      <div className="flex gap-4 sm:gap-5">
        <Link
          href={href}
          className="relative h-[5.5rem] w-[8.25rem] shrink-0 overflow-hidden rounded-xl sm:h-[6.5rem] sm:w-[9.75rem]"
        >
          <NoticiasCapaThumb
            url={capa}
            alt=""
            fill
            sizes="(max-width: 640px) 132px, 156px"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={href} className="block min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {posicao != null ? (
                <span className="text-xs font-semibold tabular-nums text-[rgb(var(--foreground-muted))]">
                  {posicao}
                </span>
              ) : null}
              {item.fixado ? <FixadoBadge /> : null}
              <span className="text-xs lowercase text-[rgb(var(--foreground-muted))]">{categoria}</span>
            </div>

            <h3 className="mt-1 text-base font-bold leading-snug text-[rgb(var(--color-primary-fg))] transition-colors group-hover:underline sm:text-lg">
              {item.titulo}
            </h3>
          </Link>

          {sufixo ? (
            <NoticiasRelacionadosLinks itens={item.relacionados} sufixo={sufixo} />
          ) : null}

          <Link href={href} className="block min-w-0">
            {resumo ? (
              <p className="mt-1.5 hidden text-sm leading-relaxed text-[rgb(var(--color-primary-fg)_/_0.82)] sm:line-clamp-2">
                <span className="mr-1.5 text-[rgb(var(--color-primary-fg))]" aria-hidden>
                  •
                </span>
                {resumo}
              </p>
            ) : null}

            <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-[rgb(var(--foreground-muted))]">
              <span>{formatMetaNoticia(item)}</span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" aria-hidden />
                {item.visitas}
              </span>
            </p>
          </Link>
        </div>
      </div>

      {currentUser ? (
        <NoticiasPracaFeedEngagement
          alvoTipo={alvoTipo}
          alvoId={item.id}
          escopo={escopo}
          href={href}
          gostei={item.gostei}
          naoGostei={item.naoGostei}
          meuVoto={item.meuVoto}
          totalComentarios={item.totalComentarios}
          currentUser={currentUser}
          publicadoEm={publicadoEmLabel}
        />
      ) : null}

      <NoticiasArtigoGerir
        item={item}
        escopo={escopo}
        podeGerir={podeGerir}
        userId={userId}
        className="absolute right-0 top-4"
      />
    </article>
  )
}

/** Layout empilhado anterior — mantido para telas que ainda importam o card isolado. */
function NoticiasArtigoCardEmpilhado({
  item,
  href,
  escopo,
  podeGerir,
  userId,
  posicao,
  currentUser,
}: {
  item: NoticiaPracaItem
  href: string
  escopo: EscopoComunidade
  podeGerir: boolean
  userId: string
  posicao?: number
  currentUser?: CurrentUser
}) {
  const capa = capaNoticia(item)
  const resumo = resumoNoticia(item)
  const alvoTipo = item.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO'
  const publicadoEmLabel = formatFeedPublicadoEm(item.publicadoEm ?? item.criadoEm)

  return (
    <article
      className={[
        'relative overflow-hidden rounded-xl border p-4',
        item.fixado
          ? 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.04)]'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {posicao != null ? (
            <span className="text-xs font-semibold tabular-nums text-[rgb(var(--foreground-muted))]">
              {posicao}
            </span>
          ) : null}
          {item.fixado ? <FixadoBadge /> : null}
          <PracaOrigemBadge origem={item.origem} />
          {item.fonte ? (
            <span className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">{item.fonte}</span>
          ) : item.autorNome ? (
            <span className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">{item.autorNome}</span>
          ) : null}
        </div>
        <NoticiasArtigoGerir item={item} escopo={escopo} podeGerir={podeGerir} userId={userId} />
      </div>

      {capa ? (
        <div className="relative mt-3 aspect-[16/9] overflow-hidden rounded-xl">
          <NoticiasCapaThumb url={capa} alt="" fill sizes="(max-width: 768px) 100vw, 640px" />
        </div>
      ) : null}

      <Link href={href} className="mt-3 block min-w-0">
        <h3 className="font-semibold text-[rgb(var(--foreground))]">{item.titulo}</h3>
        {resumo ? (
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-[rgb(var(--foreground-muted))]">
            {resumo}
          </p>
        ) : null}
      </Link>

      <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">{formatMetaNoticia(item)}</p>

      {currentUser ? (
        <NoticiasPracaFeedEngagement
          alvoTipo={alvoTipo}
          alvoId={item.id}
          escopo={escopo}
          href={href}
          gostei={item.gostei}
          naoGostei={item.naoGostei}
          meuVoto={item.meuVoto}
          totalComentarios={item.totalComentarios}
          currentUser={currentUser}
          publicadoEm={publicadoEmLabel}
        />
      ) : null}
    </article>
  )
}
