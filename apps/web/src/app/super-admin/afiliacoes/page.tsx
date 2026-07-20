import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  AfiliacoesConsole,
  type AfiliacaoAdminView,
  type UnidadeOption,
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

interface SedeRaizRow {
  id: string
  cidade: string | null
  estado: string | null
  tenant: {
    id: string
    nome: string
    afiliacaoId: string | null
    afiliacao: { nome: string } | null
  } | null
}

function formatLocal(cidade: string | null, estado: string | null): string | null {
  if (cidade && estado) return `${cidade}/${estado}`
  return cidade ?? estado ?? null
}

export default async function AfiliacoesSuperAdminPage() {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const [afiliacoesRows, sedesRaiz, sedeIdsOcupadosRows]: [
    AfiliacaoRow[],
    SedeRaizRow[],
    { unidadeSedeId: string }[],
  ] = await Promise.all([
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
    // Sede RAIZ (tipo SEDE) de cada tenant independente, com clube (afiliação).
    db.sede.findMany({
      where: { tipo: 'SEDE', ativa: true, tenant: { ativo: true, sintetico: false } },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        cidade: true,
        estado: true,
        tenant: {
          select: {
            id: true,
            nome: true,
            afiliacaoId: true,
            afiliacao: { select: { nome: true } },
          },
        },
      },
    }),
    db.afiliacaoUnidade.findMany({
      where: { status: { in: ['PENDENTE', 'ATIVA'] } },
      select: { unidadeSedeId: true },
    }),
  ])

  const sedeIdsOcupados = new Set(sedeIdsOcupadosRows.map((r) => r.unidadeSedeId))

  const afiliacoes: AfiliacaoAdminView[] = afiliacoesRows.map((a) => ({
    id: a.id,
    status: a.status,
    unidadeNome: a.unidadeSede.nome,
    unidadeTipo: a.unidadeSede.tipo,
    sedePaiNome: a.sedePaiTenant?.nome ?? null,
    criadoEm: a.criadoEm.toISOString(),
    motivo: a.motivo,
  }))

  const unidades: UnidadeOption[] = sedesRaiz
    .filter((s): s is SedeRaizRow & { tenant: NonNullable<SedeRaizRow['tenant']> } =>
      Boolean(s.tenant),
    )
    .map((s) => ({
      sedeId: s.id,
      tenantId: s.tenant.id,
      nome: s.tenant.nome,
      local: formatLocal(s.cidade, s.estado),
      afiliacaoId: s.tenant.afiliacaoId,
      clubeNome: s.tenant.afiliacao?.nome ?? null,
      ocupada: sedeIdsOcupados.has(s.id),
    }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Afiliações de unidades</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Intake do suporte e adesão do super-admin. Quando há Sede-mãe, o Presidente/Vice também
          decidem no console da torcida; o super-admin adere quando não há Sede administradora.
        </p>
      </div>
      <AfiliacoesConsole afiliacoes={afiliacoes} unidades={unidades} />
    </div>
  )
}
