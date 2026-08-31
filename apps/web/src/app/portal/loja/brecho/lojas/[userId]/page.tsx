import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { resolverContextoBrecho } from '@/lib/brecho-escopo'
import {
  getLojaBrechoPorUser,
  getMinhaLojaBrecho,
  anuncioParaGridItem,
  capaExibicaoBrecho,
} from '@/lib/brecho'
import { LojaProdutoGridAnimated, type LojaProdutoGridItem } from '@/components/portal/loja-produto-grid-animated'
import { BrechoChrome } from '../../_components/brecho-chrome'
import { BrechoDenunciaForm } from '../../_components/brecho-denuncia-form'
import { BrechoVitrineHero } from '../../_components/brecho-vitrine-hero'
import { BrechoConfiancaMarca } from '../../_components/brecho-confianca'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Loja no brechó' }

export default async function PortalBrechoLojaSocioPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const ctx = await resolverContextoBrecho(session.user.id, session.user.email)
  if (!ctx) redirect('/portal/loja')

  const { userId } = await params
  const [loja, minha] = await Promise.all([
    getLojaBrechoPorUser(ctx, userId),
    getMinhaLojaBrecho(ctx),
  ])
  if (!loja) notFound()

  const produtos: LojaProdutoGridItem[] = loja.anuncios.map((a) => {
    const item = anuncioParaGridItem(a)
    return {
      ...item,
      vendedorNome: undefined,
      vendedorAvatarUrl: undefined,
      confiancaNivel: undefined,
    }
  })
  const eMinha = ctx.userId === loja.userId
  const capaExibicao = capaExibicaoBrecho(loja.capaUrl, loja.anuncios[0]?.imagensUrl)
  const ranking = (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <BrechoConfiancaMarca estrelas={loja.estrelas} trocas={loja.trocasConcluidas} size="md" />
      <span className="font-mono text-[11px] text-[rgb(var(--foreground-muted))]">
        · {produtos.length} anúncio{produtos.length !== 1 ? 's' : ''}
      </span>
    </span>
  )

  return (
    <div className="space-y-5">
      <BrechoChrome title={loja.nome} minhaLoja={Boolean(minha)} compact />

      <BrechoVitrineHero
        nome={loja.nome}
        capaUrl={loja.capaUrl}
        capaExibicao={capaExibicao}
        fotoUrl={loja.fotoUrl}
        fallbackAvatarUrl={loja.user.avatarUrl}
        ranking={ranking}
        bio={loja.bio}
        podeEditar={eMinha}
        denuncia={
          eMinha ? (
            <Link
              href="/portal/loja/brecho/minha-loja"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[rgb(var(--color-primary)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--color-primary)_/_0.08)]"
            >
              Anunciar
            </Link>
          ) : (
            <BrechoDenunciaForm lojaUserId={loja.userId} />
          )
        }
      />

      <section className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--foreground-muted))]">
          [ Anúncios ]
        </p>
        <LojaProdutoGridAnimated
          produtos={produtos}
          emptyTitle="Nenhum anúncio ativo"
          emptyDescription={
            eMinha ? 'Publique o primeiro item em Anunciar.' : 'Esta loja ainda não publicou itens.'
          }
        />
      </section>
    </div>
  )
}
