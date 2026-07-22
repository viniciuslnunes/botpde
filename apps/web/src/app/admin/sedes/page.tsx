import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import {
  AdminSedesManager,
  type AdminSedeListItem,
} from '@/components/admin/admin-sedes-manager'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sedes — Admin' }

export default async function AdminSedesPage() {
  try {
    await assertPermission(PERMISSIONS.SEDES_MANAGE)
  } catch {
    redirect('/admin')
  }

  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/portal')

  type SedeRow = {
    id: string
    nome: string
    tipo: AdminSedeListItem['tipo']
    sedeId: string | null
    endereco: string | null
    cidade: string | null
    estado: string | null
    telefone: string | null
    horarios: string | null
    capacidade: number | null
    responsavel: string | null
    ativa: boolean
    lat: number | null
    lng: number | null
  }

  type MembroCountRow = { sedeId: string | null; _count: { _all: number } }

  const [rows, membroCounts, candidatosRaw]: [
    SedeRow[],
    MembroCountRow[],
    Array<{ userId: string; nome: string; user: { nome: string | null; email: string | null } }>,
  ] = await Promise.all([
    db.sede.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        tipo: true,
        sedeId: true,
        endereco: true,
        cidade: true,
        estado: true,
        telefone: true,
        horarios: true,
        capacidade: true,
        responsavel: true,
        ativa: true,
        lat: true,
        lng: true,
      },
    }),
    db.saasMembro.groupBy({
      by: ['sedeId'],
      where: { tenantId: tenant.id, status: 'APROVADO' },
      _count: { _all: true },
    }),
    db.saasMembro.findMany({
      where: { tenantId: tenant.id, status: 'APROVADO' },
      orderBy: { nome: 'asc' },
      take: 200,
      select: {
        userId: true,
        nome: true,
        user: { select: { nome: true, email: true } },
      },
    }),
  ])

  const countBySede = new Map<string, number>()
  let membrosSemUnidade = 0
  for (const row of membroCounts) {
    if (row.sedeId == null) membrosSemUnidade = row._count._all
    else countBySede.set(row.sedeId, row._count._all)
  }

  const sedes: AdminSedeListItem[] = rows.map((s) => ({
    ...s,
    membrosCount: countBySede.get(s.id) ?? 0,
  }))
  const sedesOption = rows.map((s) => ({ id: s.id, nome: s.nome, tipo: s.tipo }))
  const candidatos = candidatosRaw.map((m) => ({
    id: m.userId,
    nome: m.user.nome ?? m.nome,
    email: m.user.email,
  }))

  return (
    <div className="app-container py-8">
      <MotionReveal>
        <AdminSedesManager
          sedes={sedes}
          sedesOption={sedesOption}
          candidatos={candidatos}
          membrosSemUnidade={membrosSemUnidade}
        />
      </MotionReveal>
    </div>
  )
}
