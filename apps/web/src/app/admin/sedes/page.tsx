import { auth } from '@/lib/auth'
import { db, type Sede } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CriarSedeForm, ToggleSedeButton } from '@/components/admin/sede-forms'
import { MotionReveal } from '@/components/motion/motion-reveal'
import {
  MapPin,
  Building2,
  Users,
  Phone,
  Clock,
  ChevronRight,
  Plus,
  AlertCircle,
} from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sedes — Admin' }

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

export default async function AdminSedesPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/portal')

  // Busca todas as sedes do tenant; a árvore é montada em memória (N níveis)
  const todasSedes: Sede[] = await db.sede.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
  })

  type SedeFlat = Sede
  type SedeNode = SedeFlat & { filhos: SedeNode[] }

  const nodes = new Map<string, SedeNode>(
    todasSedes.map((s: SedeFlat) => [s.id, { ...s, filhos: [] }]),
  )
  const raizes: SedeNode[] = []
  for (const node of nodes.values()) {
    const pai = node.sedeId ? nodes.get(node.sedeId) : undefined
    if (pai) pai.filhos.push(node)
    else raizes.push(node)
  }

  // Para o select de sede pai no formulário de criação
  const sedesOption = todasSedes.map((s: SedeFlat) => ({
    id: s.id,
    nome: s.nome,
    tipo: s.tipo,
  }))

  function SedeCard({ sede, nivel = 0 }: { sede: SedeNode; nivel?: number }) {
    return (
      <div className={nivel > 0 ? 'ml-6 border-l-2 border-[rgb(var(--border))] pl-4' : ''}>
        <div
          className={[
            'rounded-xl border p-4 transition-all',
            sede.ativa
              ? 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]'
              : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-60',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Título e badge de tipo */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tipoCor[sede.tipo]}`}>
                  {tipoLabel[sede.tipo]}
                </span>
                <h3 className="font-semibold text-[rgb(var(--foreground))]">{sede.nome}</h3>
                {!sede.ativa && (
                  <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                    Inativa
                  </span>
                )}
              </div>

              {/* Localização */}
              {(sede.cidade || sede.endereco) && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {sede.endereco ? `${sede.endereco}${sede.cidade ? `, ${sede.cidade}` : ''}` : sede.cidade}
                    {sede.estado ? ` — ${sede.estado}` : ''}
                  </span>
                </div>
              )}

              {/* Informações operacionais */}
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-[rgb(var(--foreground-muted))]">
                {sede.responsavel && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {sede.responsavel}
                  </span>
                )}
                {sede.telefone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {sede.telefone}
                  </span>
                )}
                {sede.capacidade && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    Cap. {sede.capacidade}
                  </span>
                )}
                {sede.horarios && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {sede.horarios}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ToggleSedeButton sedeId={sede.id} ativa={sede.ativa} />
              <Link
                href={`/admin/sedes/${sede.id}`}
                className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                Editar
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Filhos */}
        {sede.filhos.length > 0 && (
          <div className="mt-3 space-y-3">
            {sede.filhos.map((filho) => (
              <SedeCard key={filho.id} sede={filho} nivel={nivel + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app-container space-y-8 py-8">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Sedes</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Gerencie sedes, subsedes e pontos de encontro da torcida
        </p>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(tipoLabel).map(([tipo, label]) => (
          <span key={tipo} className={`rounded-full px-2.5 py-1 font-medium ${tipoCor[tipo]}`}>
            {label}
          </span>
        ))}
      </div>

      {/* Formulário de criação */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <h2 className="mb-5 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
          <Plus className="h-4 w-4" />
          Adicionar sede / local
        </h2>
        <CriarSedeForm sedes={sedesOption} />
      </div>

      {/* Hierarquia de sedes */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Estrutura ({todasSedes.length} local{todasSedes.length !== 1 ? 'is' : ''})
        </h2>

        {raizes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center">
            <AlertCircle className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
              Nenhuma sede cadastrada
            </p>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Use o formulário acima para adicionar a primeira sede.
            </p>
          </div>
        ) : (
          <MotionReveal index={0}>
          <div className="space-y-4">
            {raizes.map((sede) => (
              <SedeCard key={sede.id} sede={sede} />
            ))}
          </div>
          </MotionReveal>
        )}
      </div>
    </div>
  )
}
