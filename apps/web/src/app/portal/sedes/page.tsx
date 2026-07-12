import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { SedesListAnimated, type SedesGrupo } from '@/components/portal/sedes-list-animated'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sedes' }

const tipoLabel: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'Ponto de Encontro',
}

const tipoCor: Record<string, string> = {
  SEDE: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  SUBSEDE: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  PONTO_ENCONTRO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
}

function formatarEndereco(sede: {
  endereco: string | null
  cidade: string | null
  estado: string | null
}) {
  if (!sede.endereco && !sede.cidade) return null
  const linha = sede.endereco
    ? `${sede.endereco}${sede.cidade ? `, ${sede.cidade}` : ''}`
    : sede.cidade
  return sede.estado ? `${linha} — ${sede.estado}` : linha
}

export default async function SedesPage() {
  const tenant = await getTenantFromHost()

  const sedes = tenant
    ? await db.sede.findMany({
        where: { tenantId: tenant.id, ativa: true },
        orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      })
    : []

  type Sede = (typeof sedes)[number]

  const grupos: SedesGrupo[] = []
  for (const tipo of ['SEDE', 'SUBSEDE', 'PONTO_ENCONTRO'] as const) {
    const list = sedes.filter((s: Sede) => s.tipo === tipo)
    if (list.length === 0) continue
    grupos.push({
      tipo,
      tipoLabel: tipoLabel[tipo],
      sedes: list.map((s: Sede) => ({
        id: s.id,
        nome: s.nome,
        tipoLabel: tipoLabel[s.tipo],
        tipoClass: tipoCor[s.tipo],
        enderecoLinha: formatarEndereco(s),
        responsavel: s.responsavel,
        telefone: s.telefone,
        capacidade: s.capacidade,
        horarios: s.horarios,
      })),
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Sedes</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Locais da torcida — sedes, subsedes e pontos de encontro
        </p>
      </div>

      <SedesListAnimated grupos={grupos} />
    </div>
  )
}
