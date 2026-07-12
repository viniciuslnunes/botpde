import { redirect } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { db } from '@torcida/db'
import { SeguimentoPendentesList } from '../_components/seguimento-pendentes-list'
import { aprovarSeguimento, rejeitarSeguimento } from '@/app/portal/comunidade/actions'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Solicitações de Seguimento' }

interface SeguimentoPendenteRow {
  id: string
  criadoEm: Date
  seguidor: {
    id: string
    nome: string | null
    avatarUrl: string | null
  }
}

export default async function SeguindoPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const pendentes: SeguimentoPendenteRow[] = await db.seguimento.findMany({
    where: {
      seguidoId: session.user.id,
      tenantContextoId: tenant.id,
      status: 'PENDENTE',
    },
    orderBy: { criadoEm: 'desc' },
    include: {
      seguidor: {
        select: {
          id: true,
          nome: true,
          avatarUrl: true,
        },
      },
    },
  })

  const itens = pendentes.map((item) => ({
    id: item.id,
    criadoEm: item.criadoEm.toISOString(),
    seguidor: item.seguidor,
  }))

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={UserPlus}
        titulo="Solicitações para seguir"
        subtitulo="Aprove ou rejeite pedidos pendentes do seu perfil."
      />

      <SeguimentoPendentesList
        itensIniciais={itens}
        onAprovar={aprovarSeguimento}
        onRejeitar={rejeitarSeguimento}
      />
    </div>
  )
}
