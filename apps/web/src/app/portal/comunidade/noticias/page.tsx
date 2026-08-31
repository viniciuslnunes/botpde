import Link from 'next/link'
import { Newspaper } from 'lucide-react'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { getNoticiasAprovadas } from '@/lib/noticias'
import { listarArtigosPortalDoTenant, podePublicarArtigoNoTenant } from '@/lib/praca'
import { PracaOrigemBadge, PracaOrigemBarra } from '../_components/praca-origem-badge'
import { exigirContextoPraca } from '../_lib/praca-page'
import { formatRelative } from '@/lib/format-datetime'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notícias — Comunidade' }

export default async function NoticiasPracaPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string }>
}) {
  const params = await searchParams
  const { session, escopo, ancora, sufixo } = await exigirContextoPraca(params.escopo)

  const podeArtigo =
    escopo !== 'nacional' && ancora.tenantId
      ? await podePublicarArtigoNoTenant(session.user.id, ancora.tenantId)
      : false

  const noticias =
    escopo === 'nacional' && ancora.afiliacaoId
      ? await getNoticiasAprovadas(ancora.afiliacaoId)
      : []
  const artigos = ancora.tenantId ? await listarArtigosPortalDoTenant(ancora.tenantId) : []
  const vazio = noticias.length === 0 && artigos.length === 0

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Newspaper}
        titulo="Notícias"
        subtitulo={
          escopo === 'nacional'
            ? 'Imprensa do clube — o texto completo está no veículo (link + crédito)'
            : 'Artigos oficiais deste canal'
        }
        voltarHref={`/portal/comunidade${sufixo}`}
        acao={
          podeArtigo ? (
            <Link
              href={`/portal/comunidade/noticias/novo${sufixo}`}
              className="app-action inline-flex items-center rounded-xl bg-[rgb(var(--primary))] px-3 text-sm font-semibold text-white"
            >
              Novo artigo
            </Link>
          ) : undefined
        }
      />

      {vazio ? (
        <MotionEmptyState
          icon={<Newspaper className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
          title="Nada publicado ainda"
          description={
            escopo === 'nacional'
              ? 'Quando a curadoria aprovar uma notícia de imprensa, ela aparece aqui com fonte e link.'
              : 'Comunicação e liderança publicam artigos neste canal.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {noticias.map((n) => (
            <li key={n.id}>
              <Link
                href={`/portal/comunidade/noticias/${n.id}${sufixo}`}
                className="relative block overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 pl-5 hover:border-[rgb(var(--primary)_/_0.4)]"
              >
                <PracaOrigemBarra origem="imprensa" />
                <div className="flex items-center gap-2">
                  <span className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                    {n.fonte}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-[rgb(var(--foreground))]">{n.titulo}</p>
                {n.resumo && (
                  <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                    {n.resumo}
                  </p>
                )}
              </Link>
            </li>
          ))}
          {artigos.map((a) => {
            const origem = a.origem === 'OFICIAL' ? 'oficial' : 'verificada'
            return (
            <li key={a.id}>
              <Link
                href={`/portal/comunidade/noticias/${a.id}${sufixo}`}
                className="relative block overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 pl-5 hover:border-[rgb(var(--primary)_/_0.4)]"
              >
                <PracaOrigemBarra origem={origem} />
                <div className="flex items-center gap-2">
                  <PracaOrigemBadge origem={origem} />
                  {a.publicadoEm && (
                    <span className="text-[11px] text-[rgb(var(--foreground-muted))]">
                      {formatRelative(a.publicadoEm)}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-[rgb(var(--foreground))]">{a.titulo}</p>
                {a.resumo && (
                  <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                    {a.resumo}
                  </p>
                )}
              </Link>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
