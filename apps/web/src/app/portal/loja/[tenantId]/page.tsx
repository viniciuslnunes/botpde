import { Suspense } from 'react'
import { db } from '@torcida/db'
import { listLojasDoSocio, tenantsPermitidosLoja } from '@/lib/loja-lojas'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { ArrowLeft } from 'lucide-react'
import { formatNomeTorcida, resolveLojaVitrine } from '@torcida/types'
import type { Metadata } from 'next'
import {
  LojaCatalogoFallback,
  LojaCatalogoSection,
} from '../_components/loja-catalogo-section'
import { LojaHero } from '../_components/loja-hero'

export const metadata: Metadata = { title: 'Loja' }

type SearchParams = {
  q?: string
  categoria?: string
  tamanho?: string
  ordenar?: string
  precoMin?: string
  precoMax?: string
  page?: string
}

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

export default async function PortalLojaTenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>
  searchParams: Promise<SearchParams>
}) {
  const [session, { tenantId }, sp] = await Promise.all([auth(), params, searchParams])

  if (!session?.user?.id) redirect('/entrar')

  const permitidos = await tenantsPermitidosLoja(session.user.id)
  if (!permitidos.has(tenantId)) notFound()

  const [lojas, tenantRow, cupomDestaque, produtoDestaque] = await Promise.all([
    listLojasDoSocio(session.user.id),
    db.tenant.findFirst({
      where: { id: tenantId, ativo: true },
      select: { nome: true, corPrimaria: true, design: true },
    }),
    db.saasCupom.findFirst({
      where: {
        tenantId,
        ativo: true,
        primeiraCompra: true,
        OR: [{ validoAte: null }, { validoAte: { gte: new Date() } }],
      },
      orderBy: { criadoEm: 'desc' },
      select: { codigo: true, tipo: true, valor: true },
    }),
    db.saasProduto.findFirst({
      where: { tenantId, ativo: true, destaque: true },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
      select: { id: true, nome: true, preco: true, imagensUrl: true },
    }),
  ])

  if (!tenantRow) notFound()

  const lojaResumo = lojas.find((l) => l.tenantId === tenantId)
  const nome = lojaResumo?.nome ?? formatNomeTorcida(tenantRow.nome)
  const totalProdutos =
    lojaResumo?.totalProdutos ??
    (await db.saasProduto.count({ where: { tenantId, ativo: true } }))

  const textoCupom = cupomDestaque
    ? cupomDestaque.tipo === 'PERCENTUAL'
      ? `${Number(cupomDestaque.valor)}% off`
      : `${formatarPreco(cupomDestaque.valor)} off`
    : null

  const multiLoja = lojas.length > 1
  const vitrine = resolveLojaVitrine(tenantRow.design, tenantRow.corPrimaria)
  const capaUrl =
    vitrine.bannerUrl ??
    (vitrine.usarDestaqueComoCapa ? (produtoDestaque?.imagensUrl[0] ?? null) : null)

  return (
    <>
      {multiLoja ? (
        <Link
          href="/portal/loja"
          className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Todas as lojas
        </Link>
      ) : null}

      <LojaHero
        nome={nome}
        tipo={lojaResumo?.tipo ?? 'SEDE'}
        cidade={lojaResumo?.cidade ?? null}
        principal={lojaResumo?.principal ?? true}
        logoUrl={lojaResumo?.logoUrl ?? null}
        totalProdutos={totalProdutos}
        capaUrl={capaUrl}
        cupom={
          cupomDestaque && textoCupom
            ? { codigo: cupomDestaque.codigo, texto: textoCupom }
            : null
        }
        destaque={
          produtoDestaque
            ? {
                id: produtoDestaque.id,
                nome: produtoDestaque.nome,
                precoLabel: formatarPreco(produtoDestaque.preco),
                imagemUrl: produtoDestaque.imagensUrl[0] ?? null,
                href: `/portal/loja/${tenantId}/${produtoDestaque.id}`,
              }
            : null
        }
      />

      <Suspense fallback={<LojaCatalogoFallback />}>
        <LojaCatalogoSection tenantId={tenantId} searchParams={sp} />
      </Suspense>
    </>
  )
}
