import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getActiveTenant } from '@/lib/tenant'
import { SedesExplorer } from '@/components/portal/sedes-explorer'
import type {
  SedeExplorerItem,
  SedeTipo,
} from '@/components/portal/sede-explorer-types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sedes' }

type PageProps = {
  searchParams: Promise<{ sede?: string }>
}

export default async function SedesPage({ searchParams }: PageProps) {
  const { sede: sedeParam } = await searchParams
  const session = await auth()
  const tenant = await getActiveTenant(session?.user?.id, session?.user?.email)
  const agora = new Date()

  type SedeRow = {
    id: string
    nome: string
    tipo: SedeTipo
    endereco: string | null
    cidade: string | null
    estado: string | null
    cep: string | null
    lat: number | null
    lng: number | null
    telefone: string | null
    horarios: string | null
    capacidade: number | null
    responsavel: string | null
    descricao: string | null
    fotoUrl: string | null
    sede: { id: string; nome: string; tipo: SedeTipo } | null
    filhos: Array<{ id: string; nome: string; tipo: SedeTipo; cidade: string | null }>
    eventos: Array<{ id: string; titulo: string; data: Date }>
  }

  const sedesRaw: SedeRow[] = tenant
    ? await db.sede.findMany({
        where: { tenantId: tenant.id, ativa: true },
        orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
        select: {
          id: true,
          nome: true,
          tipo: true,
          endereco: true,
          cidade: true,
          estado: true,
          cep: true,
          lat: true,
          lng: true,
          telefone: true,
          horarios: true,
          capacidade: true,
          responsavel: true,
          descricao: true,
          fotoUrl: true,
          sede: { select: { id: true, nome: true, tipo: true } },
          filhos: {
            where: { ativa: true },
            orderBy: { nome: 'asc' },
            select: { id: true, nome: true, tipo: true, cidade: true },
          },
          eventos: {
            where: { data: { gte: agora } },
            orderBy: { data: 'asc' },
            take: 5,
            select: { id: true, titulo: true, data: true },
          },
        },
      })
    : []

  const sedes: SedeExplorerItem[] = sedesRaw.map((s) => ({
    id: s.id,
    nome: s.nome,
    tipo: s.tipo,
    endereco: s.endereco,
    cidade: s.cidade,
    estado: s.estado,
    cep: s.cep,
    lat: s.lat,
    lng: s.lng,
    telefone: s.telefone,
    horarios: s.horarios,
    capacidade: s.capacidade,
    responsavel: s.responsavel,
    descricao: s.descricao,
    fotoUrl: s.fotoUrl,
    sedePai: s.sede,
    filhos: s.filhos,
    eventos: s.eventos.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      data: e.data.toISOString(),
    })),
  }))

  const initialSelectedId =
    sedeParam && sedes.some((s) => s.id === sedeParam) ? sedeParam : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Sedes</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Locais da torcida — explore no mapa, veja fachada, horários e como chegar
        </p>
      </div>

      <SedesExplorer sedes={sedes} initialSelectedId={initialSelectedId} />
    </div>
  )
}
