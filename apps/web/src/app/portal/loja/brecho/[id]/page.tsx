import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import {
  BRECHO_CATEGORIA,
  BRECHO_MODALIDADE,
  nomeExibicaoVendedorBrecho,
  rotuloPrecoBrecho,
} from '@torcida/types'
import { resolverContextoBrecho } from '@/lib/brecho-escopo'
import { getAnuncioBrecho, getMinhaLojaBrecho } from '@/lib/brecho'
import { ProdutoGaleria } from '@/components/portal/produto-galeria'
import { ProdutoDetailCol } from '@/components/portal/produto-detail-col'
import { Avatar } from '@/components/portal/avatar'
import { BrechoChrome, BrechoAviso } from '../_components/brecho-chrome'
import { BrechoConfiancaMarca } from '../_components/brecho-confianca'
import { BrechoInteresseButton } from '../_components/brecho-interesse-button'
import { BrechoDenunciaForm } from '../_components/brecho-denuncia-form'
import { BrechoConfirmarButton } from '../_components/brecho-confirmar-button'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Anúncio no brechó' }

export default async function PortalBrechoAnuncioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const ctx = await resolverContextoBrecho(session.user.id, session.user.email)
  if (!ctx) redirect('/portal/loja')

  const { id } = await params
  const [anuncio, minha] = await Promise.all([
    getAnuncioBrecho(ctx, id),
    getMinhaLojaBrecho(ctx),
  ])
  if (!anuncio) notFound()

  const ehDono = anuncio.vendedor.id === ctx.userId
  type InteresseLite = {
    id: string
    conversaId: string
    vendedorConfirmouEm: Date | null
    interessadoConfirmouEm: Date | null
    interessado: { nome: string | null; nickname: string | null }
  }
  const interesses: InteresseLite[] = ehDono
    ? await db.brechoInteresse.findMany({
        where: { anuncioId: anuncio.id, tenantId: { in: ctx.raizesFeed } },
        orderBy: { criadoEm: 'desc' },
        take: 20,
        select: {
          id: true,
          conversaId: true,
          vendedorConfirmouEm: true,
          interessadoConfirmouEm: true,
          interessado: { select: { nome: true, nickname: true } },
        },
      })
    : []

  const cat = BRECHO_CATEGORIA[anuncio.categoria]
  const preco = rotuloPrecoBrecho({ modalidade: anuncio.modalidade, preco: anuncio.preco })
  const vendedorNome = nomeExibicaoVendedorBrecho({
    nome: anuncio.vendedor.nome,
    nickname: anuncio.vendedor.nickname,
    lojaNome: anuncio.loja.nome,
  })

  return (
    <div className="space-y-8">
      <BrechoChrome title="Anúncio" minhaLoja={Boolean(minha)} compact />
      <Link
        href={`/portal/loja/brecho/lojas/${anuncio.vendedor.id}`}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar à loja
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)] lg:items-start lg:gap-14">
        <div className="lg:sticky lg:top-24">
          <div className="overflow-hidden bg-[rgb(var(--color-primary)_/_0.05)] [clip-path:polygon(0_0,calc(100%-18px)_0,100%_18px,100%_100%,18px_100%,0_calc(100%-18px))]">
            <ProdutoGaleria imagensUrl={anuncio.imagensUrl} nome={anuncio.titulo} />
          </div>
        </div>

        <ProdutoDetailCol>
          <div className="space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
              [ {BRECHO_MODALIDADE[anuncio.modalidade].label} · {cat.label}
              {anuncio.tamanho ? ` · ${anuncio.tamanho}` : ''} ]
            </p>
            <h1 className="text-balance text-3xl font-black uppercase leading-[0.95] tracking-tight sm:text-4xl">
              {anuncio.titulo}
            </h1>
            <p className="font-mono text-2xl font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
              {preco}
            </p>
            {anuncio.aceitoTroca ? (
              <p className="text-sm">
                <span className="font-medium">Aceita em troca:</span> {anuncio.aceitoTroca}
              </p>
            ) : null}
            {anuncio.descricao ? (
              <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-[rgb(var(--foreground-muted))] sm:text-[15px]">
                {anuncio.descricao}
              </p>
            ) : null}
            {cat.aviso ? <p className="text-xs text-[rgb(var(--color-warning-fg))]">{cat.aviso}</p> : null}
          </div>

          <Link
            href={`/portal/loja/brecho/lojas/${anuncio.vendedor.id}`}
            className="flex items-center gap-3 text-sm"
          >
            <Avatar
              nome={vendedorNome}
              avatarUrl={anuncio.vendedor.avatarUrl ?? anuncio.loja.fotoUrl}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate font-medium text-[rgb(var(--foreground))]">
                {vendedorNome}
              </span>
              <BrechoConfiancaMarca
                estrelas={anuncio.estrelas}
                trocas={anuncio.loja.trocasConcluidas}
              />
            </span>
          </Link>
          <BrechoAviso />
          {ehDono ? (
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Este anúncio é seu.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <BrechoInteresseButton
                anuncioId={anuncio.id}
                conversaId={anuncio.meuInteresse?.conversaId ?? null}
              />
              {anuncio.meuInteresse ? (
                <BrechoConfirmarButton
                  interesseId={anuncio.meuInteresse.id}
                  jaConfirmou={Boolean(anuncio.meuInteresse.interessadoConfirmouEm)}
                />
              ) : null}
              <BrechoDenunciaForm anuncioId={anuncio.id} />
            </div>
          )}
          {ehDono && interesses.length > 0 ? (
            <div className="space-y-3 border-t border-[rgb(var(--border))] pt-4">
              <h2 className="text-xl font-black uppercase tracking-tight">Interesses</h2>
              {interesses.map((i) => (
                <div key={i.id} className="flex flex-col gap-2 rounded-xl border border-[rgb(var(--border))] p-3">
                  <p className="text-sm">
                    {i.interessado.nome ?? i.interessado.nickname ?? 'Sócio'}
                  </p>
                  <a href={`/portal/mensagens?c=${i.conversaId}`} className="text-sm text-[rgb(var(--color-primary-fg))]">
                    Abrir conversa
                  </a>
                  <BrechoConfirmarButton
                    interesseId={i.id}
                    jaConfirmou={Boolean(i.vendedorConfirmouEm)}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </ProdutoDetailCol>
      </div>
    </div>
  )
}
