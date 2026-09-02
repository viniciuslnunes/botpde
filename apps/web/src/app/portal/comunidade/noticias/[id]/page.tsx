import { notFound } from 'next/navigation'
import { ArrowLeft, Newspaper } from 'lucide-react'
import Link from 'next/link'
import { ComunidadePageHeader } from '../../_components/comunidade-page-header'
import { VotarPracaBotoes } from '../../_components/praca-forms'
import { PracaComentariosSection } from '../../_components/praca-comentarios-section'
import { RegistrarVisitaNoticia } from '../../_components/registrar-visita-noticia'
import { exigirContextoPraca } from '../../_lib/praca-page'
import { listarComentariosPraca, resolverNoticiaOuArtigo } from '@/lib/praca'
import { PostMedia } from '@/components/portal/post-media'
import { NoticiaArtigoLeitura } from '@/components/portal/noticia-artigo-corpo'
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
  const { session, escopo, ancora, sufixo } = await exigirContextoPraca(sp.escopo)
  const item = await resolverNoticiaOuArtigo(id, escopo, ancora)
  if (!item) notFound()

  const alvoTipo = item.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO'
  const comentarios = await listarComentariosPraca(alvoTipo, item.id, session.user.id)

  if (item.kind === 'noticia') {
    return (
      <div className="space-y-5">
        <RegistrarVisitaNoticia alvoTipo="NOTICIA" alvoId={item.id} escopo={escopo} />
        <ComunidadePageHeader
          icon={Newspaper}
          titulo={item.titulo}
          subtitulo={item.fonte}
          voltarHref={`/portal/comunidade/noticias${sufixo}`}
        />
        <article className="mx-auto w-full max-w-[40rem] space-y-4">
          {item.embedThumbnail ? (
            <PostMedia urls={[item.embedThumbnail]} caption={item.resumo ?? item.titulo} />
          ) : null}
          {item.resumo && (
            <p className="text-[1.05rem] leading-relaxed text-[rgb(var(--foreground-muted))]">
              {item.resumo}
            </p>
          )}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="app-action inline-flex items-center rounded-xl bg-[rgb(var(--primary))] px-4 text-sm font-semibold text-primary-on"
          >
            Ler na fonte
          </a>
        </article>
        <PracaComentariosSection
          escopo={escopo}
          alvoTipo="NOTICIA"
          alvoId={item.id}
          comentarios={comentarios}
          viewerId={session.user.id}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <RegistrarVisitaNoticia alvoTipo="ARTIGO" alvoId={item.id} escopo={escopo} />
      <div className="mx-auto w-full max-w-[40rem]">
        <Link
          href={`/portal/comunidade/noticias${sufixo}`}
          className="app-touch-line inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Notícias
        </Link>
      </div>

      <NoticiaArtigoLeitura
        titulo={item.titulo}
        resumo={item.resumo}
        autorNome={item.autorNome}
        autorAvatarUrl={item.autorAvatarUrl}
        publicadoEm={item.publicadoEm}
        origem={item.origem}
        visitas={item.visitas}
        blocos={item.blocos}
        corpo={item.corpo}
        midiaUrls={item.midiaUrls}
      />

      <div className="mx-auto w-full max-w-[40rem]">
        <VotarPracaBotoes
          escopo={escopo}
          alvoTipo="ARTIGO"
          alvoId={item.id}
          gostei={item.gostei}
          naoGostei={item.naoGostei}
        />
      </div>

      <PracaComentariosSection
        escopo={escopo}
        alvoTipo="ARTIGO"
        alvoId={item.id}
        comentarios={comentarios}
        viewerId={session.user.id}
      />
    </div>
  )
}
