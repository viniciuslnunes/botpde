import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { listLojasDoSocio, podeVerLojaTenant, tenantsVisiveisLoja } from '@/lib/loja-lojas'
import { resolveTenantLogoUrl } from '@/lib/tenant'
import { notFound, redirect } from 'next/navigation'
import { LojaTenantThemeScope } from '../_components/loja-tenant-theme-scope'
import { LojaChrome } from '../_components/loja-chrome'
import type { ReactNode } from 'react'

export default async function LojaTenantLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ tenantId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const { tenantId } = await params
  const userId = session.user.id

  if (!(await podeVerLojaTenant(userId, tenantId, session.user.email))) notFound()

  const visiveisIds = [...(await tenantsVisiveisLoja(userId, session.user.email))]

  const [tenant, lojas, sacolaAgg, sacolaPorTenant, pedidosCount, categorias] = await Promise.all([
    db.tenant.findFirst({
      where: { id: tenantId, ativo: true },
      select: { id: true, nome: true, corPrimaria: true, design: true, logoUrl: true },
    }),
    listLojasDoSocio(userId, session.user.email),
    db.saasCarrinhoItem.aggregate({
      where: { userId, tenantId: { in: visiveisIds } },
      _sum: { quantidade: true },
    }),
    db.saasCarrinhoItem.groupBy({
      by: ['tenantId'],
      where: { userId, tenantId: { in: visiveisIds } },
      _count: { _all: true },
    }),
    db.saasPedido.count({
      where: { userId, status: { in: ['PENDENTE', 'CONFIRMADO'] } },
    }),
    db.saasCategoria.findMany({
      where: { tenantId },
      orderBy: { ordem: 'asc' },
      select: { slug: true, nome: true },
      take: 16,
    }),
  ])

  if (!tenant) notFound()

  const logoUrl = await resolveTenantLogoUrl(tenant.id, tenant.logoUrl)
  const atualFromList = lojas.find((l) => l.tenantId === tenantId)
  const atual = atualFromList ?? {
    tenantId: tenant.id,
    nome: tenant.nome,
    tipo: 'SEDE',
    cidade: null,
    logoUrl,
    principal: true,
    totalProdutos: 0,
    corPrimaria: tenant.corPrimaria,
  }

  const switcherLojas =
    lojas.length > 0
      ? lojas
      : [
          {
            ...atual,
            logoUrl,
          },
        ]

  const sacolaLojasCount = sacolaPorTenant.length

  return (
    <LojaTenantThemeScope
      tenantId={tenant.id}
      corPrimaria={tenant.corPrimaria}
      design={tenant.design}
    >
      <LojaChrome
        atual={{
          tenantId: atual.tenantId,
          nome: atual.nome,
          tipo: atual.tipo,
          cidade: atual.cidade,
          logoUrl: atual.logoUrl ?? logoUrl,
          principal: atual.principal,
          totalProdutos: atual.totalProdutos,
        }}
        lojas={switcherLojas.map((l) => ({
          tenantId: l.tenantId,
          nome: l.nome,
          tipo: l.tipo,
          cidade: l.cidade,
          logoUrl: l.logoUrl,
          principal: l.principal,
          totalProdutos: l.totalProdutos,
        }))}
        categorias={categorias}
        sacolaCount={sacolaAgg._sum.quantidade ?? 0}
        sacolaLojasCount={sacolaLojasCount > 1 ? sacolaLojasCount : undefined}
        pedidosCount={pedidosCount}
      />
      {children}
    </LojaTenantThemeScope>
  )
}
