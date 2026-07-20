import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  AfiliacoesConsole,
  type AfiliacaoAdminView,
  type TenantSedePai,
  type UnidadeCandidata,
} from './afiliacoes-console'

export const metadata: Metadata = { title: 'Afiliações — Super Admin' }

interface AfiliacaoRow {
  id: string
  status: 'PENDENTE' | 'ATIVA' | 'RECUSADA' | 'ENCERRADA'
  criadoEm: Date
  motivo: string | null
  unidadeSede: { nome: string; tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO' }
  sedePaiTenant: { nome: string } | null
}

interface SedeCandidataRow {
  id: string
  nome: string
  tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string | null
  estado: string | null
}

interface TenantRow {
  id: string
  nome: string
}

export default async function AfiliacoesSuperAdminPage() {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const [afiliacoesRows, sedesComTenant, tenants]: [AfiliacaoRow[], SedeCandidataRow[], TenantRow[]] =
    await Promise.all([
      db.afiliacaoUnidade.findMany({
        orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
        select: {
          id: true,
          status: true,
          criadoEm: true,
          motivo: true,
          unidadeSede: { select: { nome: true, tipo: true } },
          sedePaiTenant: { select: { nome: true } },
        },
      }),
      // Candidata = a Sede RAIZ (tipo SEDE) do próprio tenant — representa um
      // tenant independente afiliável. Subsedes/PDEs intra-tenant (tenantId de
      // outro tenant) NÃO são unidades independentes e ficariam de fora.
      db.sede.findMany({
        where: { tenantId: { not: null }, ativa: true, tipo: 'SEDE' },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, tipo: true, cidade: true, estado: true },
      }),
      db.tenant.findMany({
        where: { ativo: true, sintetico: false },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true },
      }),
    ])

  // Unidades já com pedido PENDENTE/ATIVA não podem receber novo pedido.
  const sedeIdsOcupados = new Set(
    (
      await db.afiliacaoUnidade.findMany({
        where: { status: { in: ['PENDENTE', 'ATIVA'] } },
        select: { unidadeSedeId: true },
      })
    ).map((r: { unidadeSedeId: string }) => r.unidadeSedeId),
  )

  const afiliacoes: AfiliacaoAdminView[] = afiliacoesRows.map((a) => ({
    id: a.id,
    status: a.status,
    unidadeNome: a.unidadeSede.nome,
    unidadeTipo: a.unidadeSede.tipo,
    sedePaiNome: a.sedePaiTenant?.nome ?? null,
    criadoEm: a.criadoEm.toISOString(),
    motivo: a.motivo,
  }))

  const candidatas: UnidadeCandidata[] = sedesComTenant
    .filter((s) => !sedeIdsOcupados.has(s.id))
    .map((s) => {
      const local = s.cidade && s.estado ? ` (${s.cidade}/${s.estado})` : ''
      return { sedeId: s.id, label: `${s.nome}${local}` }
    })

  const sedesPai: TenantSedePai[] = tenants.map((t) => ({ id: t.id, nome: t.nome }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Afiliações de unidades</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Intake do suporte e adesão do super-admin. Quando há Sede-mãe, o Presidente/Vice também
          decidem no console da torcida; o super-admin adere quando não há Sede administradora.
        </p>
      </div>
      <AfiliacoesConsole afiliacoes={afiliacoes} candidatas={candidatas} sedesPai={sedesPai} />
    </div>
  )
}
