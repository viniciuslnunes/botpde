import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import {
  getGrupoPorId,
  getPostsDoGrupo,
  getPostIdsSalvosParaPosts,
  getPedidosPendentesGrupo,
  getMembrosGrupo,
} from '@/lib/feed'
import { GrupoDetalheClient } from './grupo-detalhe-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Grupo — Comunidade' }

type GrupoTab = 'mural' | 'membros' | 'pedidos' | 'sobre' | 'config'

function parseTab(tab: string | undefined): GrupoTab {
  if (tab === 'membros' || tab === 'pedidos' || tab === 'sobre' || tab === 'config') return tab
  return 'mural'
}

export default async function GrupoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const grupo = await getGrupoPorId(id, tenant.id, session.user.id)
  if (!grupo) notFound()

  const tabInicial = parseTab(tab)
  // Não-membro só vê Sobre; força a aba e evita queries de mural/membros.
  const abaEfetiva: GrupoTab = grupo.souMembro ? tabInicial : 'sobre'

  const carregarMural = grupo.souMembro && abaEfetiva === 'mural'
  const carregarMembros =
    grupo.souMembro && (abaEfetiva === 'membros' || abaEfetiva === 'config')
  const carregarPedidos = grupo.souAdmin && abaEfetiva === 'pedidos'

  const [mural, membros, pedidos] = await Promise.all([
    carregarMural
      ? getPostsDoGrupo(id, tenant.id, session.user.id, { take: 20 })
      : Promise.resolve({
          posts: [],
          pageInfo: { hasMore: false, nextCursor: null as string | null },
        }),
    carregarMembros
      ? getMembrosGrupo(id, tenant.id, session.user.id)
      : Promise.resolve(null),
    carregarPedidos
      ? getPedidosPendentesGrupo(id, tenant.id, session.user.id)
      : Promise.resolve(null),
  ])

  const salvoIds = carregarMural
    ? [
        ...(await getPostIdsSalvosParaPosts(
          session.user.id,
          tenant.id,
          mural.posts.map((p) => p.id),
        )),
      ]
    : []

  return (
    <div className="space-y-4">
      <Link
        href="/portal/comunidade/grupos"
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1.5 pl-2 pr-3.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos grupos
      </Link>

      <GrupoDetalheClient
        key={`${id}-${abaEfetiva}`}
        grupo={grupo}
        posts={mural.posts}
        pageInfo={mural.pageInfo}
        salvoIds={salvoIds}
        pedidos={pedidos}
        membros={membros}
        tabInicial={abaEfetiva}
        currentUser={{
          id: session.user.id,
          nome: session.user.name ?? null,
          avatarUrl: session.user.image ?? null,
        }}
      />
    </div>
  )
}
