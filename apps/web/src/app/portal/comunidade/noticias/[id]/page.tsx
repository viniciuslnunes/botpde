import { notFound } from 'next/navigation'
import { Newspaper } from 'lucide-react'
import { ComunidadePageHeader } from '../../_components/comunidade-page-header'
import { PracaOrigemBadge } from '../../_components/praca-origem-badge'
import {
  ComentarPracaForm,
  VotarPracaBotoes,
} from '../../_components/praca-forms'
import { exigirContextoPraca } from '../../_lib/praca-page'
import {
  listarComentariosPraca,
  resolverNoticiaOuArtigo,
} from '@/lib/praca'
import { formatRelative } from '@/lib/format-datetime'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notícia — Comunidade' }

export default async function NoticiaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ escopo?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const { escopo, ancora, sufixo } = await exigirContextoPraca(sp.escopo)
  const item = await resolverNoticiaOuArtigo(id, escopo, ancora)
  if (!item) notFound()

  const comentarios = await listarComentariosPraca(
    item.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO',
    item.id,
  )

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Newspaper}
        titulo={item.titulo}
        subtitulo={
          item.kind === 'noticia'
            ? item.fonte
            : item.autorNome ?? (item.origem === 'OFICIAL' ? 'Artigo oficial' : 'Fonte verificada')
        }
        voltarHref={`/portal/comunidade/noticias${sufixo}`}
      />

      <article className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PracaOrigemBadge
            origem={
              item.kind === 'noticia'
                ? 'imprensa'
                : item.origem === 'OFICIAL'
                  ? 'oficial'
                  : 'verificada'
            }
          />
          {item.publicadoEm && (
            <span className="text-[11px] text-[rgb(var(--foreground-muted))]">
              {formatRelative(item.publicadoEm)}
            </span>
          )}
        </div>

        {item.resumo && (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">{item.resumo}</p>
        )}

        {item.kind === 'noticia' ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="app-action inline-flex items-center rounded-xl bg-[rgb(var(--primary))] px-4 text-sm font-semibold text-white"
          >
            Ler na fonte
          </a>
        ) : (
          <div className="max-w-[70ch] whitespace-pre-wrap text-sm leading-relaxed text-[rgb(var(--foreground))] [text-wrap:pretty]">
            {item.corpo}
          </div>
        )}

        <VotarPracaBotoes
          escopo={escopo}
          alvoTipo={item.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO'}
          alvoId={item.id}
        />
      </article>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Comentários</h2>
        {comentarios.length === 0 ? (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">Nenhum comentário ainda.</p>
        ) : (
          <ul className="space-y-2">
            {comentarios.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3"
              >
                <p className="text-xs font-medium text-[rgb(var(--foreground))]">
                  {c.autorNome ?? 'Alguém'}{' '}
                  <span className="font-normal text-[rgb(var(--foreground-muted))]">
                    · {formatRelative(c.criadoEm)}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                  {c.conteudo}
                </p>
              </li>
            ))}
          </ul>
        )}
        <ComentarPracaForm
          escopo={escopo}
          alvoTipo={item.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO'}
          alvoId={item.id}
        />
      </section>
    </div>
  )
}
