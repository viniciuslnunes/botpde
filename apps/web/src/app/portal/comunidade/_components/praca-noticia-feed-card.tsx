import { rotuloOrigemPraca } from '@torcida/types'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { Avatar } from '@/components/portal/avatar'
import { ExpandableText } from '@/components/portal/expandable-text'
import { PostMedia } from '@/components/portal/post-media'
import { NoticiasPracaFeedEngagement } from '@/components/portal/noticias-praca-feed-engagement'
import { formatFeedPublicadoEm } from '@/lib/format-datetime'
import { durableImageUrl, filterDurableImageUrls } from '@/lib/optimizable-image'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { PracaNoticiaFeedItem } from '@/lib/praca'
import { FixadoBadge, PracaModuloBadge, PracaOrigemBadge } from './praca-origem-badge'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

export function PracaNoticiaFeedCard({
  item,
  escopo,
  currentUser,
}: {
  item: PracaNoticiaFeedItem
  escopo: EscopoComunidade
  currentUser: CurrentUser
}) {
  const alvoTipo = item.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO'
  const headerNome = item.autor.nome ?? item.fonte ?? rotuloOrigemPraca(item.origem)
  const headerAvatar = durableImageUrl(item.autor.avatarUrl)
  const headerHref = item.autor.id ? `/portal/comunidade/perfil/${item.autor.id}` : item.href
  const midias = filterDurableImageUrls(item.midiaUrls)
  const resumo = item.resumo?.trim() || null
  const publicadoEmLabel = formatFeedPublicadoEm(item.criadoEm)

  return (
    <article className="@container card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-4">
      <header className="flex items-start gap-2.5">
        <ComunidadePrefetchLink href={headerHref} className="shrink-0">
          <Avatar nome={headerNome} avatarUrl={headerAvatar} size="md" />
        </ComunidadePrefetchLink>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 w-full flex-col leading-tight">
            <ComunidadePrefetchLink
              href={headerHref}
              className="app-sem-piso-toque block truncate text-sm font-semibold text-[rgb(var(--foreground))] transition-colors hover:text-[rgb(var(--color-primary-fg))]"
            >
              {headerNome}
            </ComunidadePrefetchLink>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <PracaOrigemBadge origem={item.origem} />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-start">
          {item.fixado ? <FixadoBadge /> : null}
          <PracaModuloBadge modulo="noticias" />
        </div>
      </header>

      <div className="mt-5 space-y-2.5">
        <ComunidadePrefetchLink href={item.href}>
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">{item.titulo}</h3>
        </ComunidadePrefetchLink>

        {resumo ? (
          <ComunidadePrefetchLink href={item.href} className="block min-w-0">
            <ExpandableText
              text={resumo}
              lines={4}
              className="whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
            />
          </ComunidadePrefetchLink>
        ) : null}

        {midias.length > 0 ? (
          <ComunidadePrefetchLink href={item.href} className="block min-w-0">
            <PostMedia urls={midias} caption={resumo ?? item.titulo} />
          </ComunidadePrefetchLink>
        ) : null}
      </div>

      <NoticiasPracaFeedEngagement
        alvoTipo={alvoTipo}
        alvoId={item.id}
        escopo={escopo}
        href={item.href}
        gostei={item.gostei}
        naoGostei={item.naoGostei}
        meuVoto={item.meuVoto}
        totalComentarios={item.totalComentarios}
        currentUser={currentUser}
        publicadoEm={publicadoEmLabel}
      />
    </article>
  )
}
