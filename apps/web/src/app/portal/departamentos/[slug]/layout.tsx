import { type ReactNode, Suspense } from 'react'
import { Inbox, Layers, MessageSquare, Target, UserPlus, Users } from 'lucide-react'
import { hrefHomeDepartamento, missionDepartamento, rotuloAreaDepartamento, PERMISSIONS, hasPermission } from '@torcida/types'
import { db } from '@torcida/db'
import { getDepartamentoContexto } from './_lib/contexto'
import { carregarContagensCockpit, carregarPedidosArea } from './_lib/carregar-cockpit'
import { rotuloTabPainel } from './_lib/tabs'
import { DepartamentoCockpitHeader } from './_components/departamento-cockpit-header'
import { DepartamentoCockpitTabs } from './_components/departamento-cockpit-tabs'
import { DepartamentoIcone } from '../_components/departamento-icone'
import type { AdminTabItem } from '@/components/admin/ui'

const ICONE_TAB = 'h-4 w-4 shrink-0'

export default async function DepartamentoSlugLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getDepartamentoContexto(slug)
  if (!ctx) return null

  const {
    tenant,
    departamento: depto,
    capability,
    isAtuacao,
    isSuperAdmin,
    permissoesEfetivas,
    podeGerirEquipe,
    podeAprovarArea,
    areas,
  } = ctx

  const isGestor = podeGerirEquipe
  const panel = capability?.portalPanel ?? 'generico'
  const temFila = panel === 'diretoria' && podeAprovarArea
  const temPedidos = isGestor && podeAprovarArea
  const temAtendimentoLoja =
    depto.slug === 'materiais-loja' &&
    (isSuperAdmin || hasPermission(permissoesEfetivas, PERMISSIONS.STORE_VIEW_ORDERS))

  const [contagens, pedidosArea, ticketsAbertos]: [Awaited<ReturnType<typeof carregarContagensCockpit>>, Awaited<ReturnType<typeof carregarPedidosArea>>, number] =
    await Promise.all([
    carregarContagensCockpit({
      tenantId: tenant.id,
      departamentoId: depto.id,
      temFila,
    }),
    temPedidos ? carregarPedidosArea({ tenantId: tenant.id, departamentoId: depto.id }) : [],
    temAtendimentoLoja
      ? db.saasPedidoTicket.count({
          where: { tenantId: tenant.id, status: { in: ['ABERTO', 'ATENDENDO'] } },
        })
      : Promise.resolve(0),
  ])

  const moduloLabel = rotuloAreaDepartamento(depto.slug, depto.moduloPortal)
  const mission = missionDepartamento(depto.slug)

  const tabs: AdminTabItem[] = [
    {
      id: 'painel',
      label: rotuloTabPainel(panel),
      icon: <DepartamentoIcone slug={depto.slug} className={ICONE_TAB} />,
      href: hrefHomeDepartamento(depto.slug),
    },
    {
      id: 'areas',
      label: 'Áreas',
      icon: <Layers className={ICONE_TAB} />,
      count: areas.filter((a) => a.ativa).length,
      href: hrefHomeDepartamento(depto.slug, 'areas'),
    },
    {
      id: 'projetos',
      label: 'Projetos',
      icon: <Target className={ICONE_TAB} />,
      count: contagens.projetos,
      href: hrefHomeDepartamento(depto.slug, 'projetos'),
    },
    {
      id: 'equipe',
      label: 'Equipe',
      icon: <Users className={ICONE_TAB} />,
      count: contagens.equipe,
      href: hrefHomeDepartamento(depto.slug, 'equipe'),
    },
    ...(temFila
      ? [
          {
            id: 'fila' as const,
            label: 'Fila',
            icon: <Inbox className={ICONE_TAB} />,
            count: contagens.pendentes,
            countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
            href: hrefHomeDepartamento(depto.slug, 'fila'),
          },
        ]
      : []),
    ...(temPedidos
      ? [
          {
            id: 'pedidos' as const,
            label: 'Pedidos',
            icon: <UserPlus className={ICONE_TAB} />,
            count: pedidosArea.length,
            countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
            href: hrefHomeDepartamento(depto.slug, 'pedidos'),
          },
        ]
      : []),
    ...(temAtendimentoLoja
      ? [
          {
            id: 'atendimento' as const,
            label: 'Atendimento',
            icon: <MessageSquare className={ICONE_TAB} />,
            count: ticketsAbertos > 0 ? ticketsAbertos : undefined,
            countClass: 'bg-[rgb(var(--color-info)_/_0.16)] text-[rgb(var(--color-info-fg))]',
            href: hrefHomeDepartamento(depto.slug, 'atendimento'),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <DepartamentoCockpitHeader
        nome={depto.nome}
        slug={depto.slug}
        cor={depto.cor}
        moduloLabel={moduloLabel}
        mission={mission}
        isGestor={isGestor}
        isAtuacao={isAtuacao}
        totalPendentes={temFila ? contagens.pendentes : 0}
      />

      <div className="sticky top-0 z-10 -mx-1 bg-[rgb(var(--background)_/_0.92)] px-1 py-2 backdrop-blur-sm">
        <Suspense fallback={null}>
          <DepartamentoCockpitTabs tabs={tabs} slug={depto.slug} />
        </Suspense>
      </div>

      {children}
    </div>
  )
}
