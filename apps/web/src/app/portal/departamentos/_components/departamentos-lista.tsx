import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { DEPARTAMENTO_MODULOS, DEPARTAMENTO_MODULO_ROTA } from '@torcida/types'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { ArrowRight, Briefcase, Clock, Shield } from 'lucide-react'

/** Tipos explícitos — a inferência do Prisma quebra neste schema (ARCHITECTURE.md §5.2). */
interface DepartamentoHubLite {
  departamento: {
    id: string
    nome: string
    slug: string
    cor: string
    permissions: string[]
    moduloPortal: string | null
    ordem: number
  }
}
interface GestorLite {
  departamentoId: string
}

const MODULO_LABEL = new Map<string, string>(
  DEPARTAMENTO_MODULOS.map((m) => [m.key, m.label]),
)

function rotaDoModulo(moduloPortal: string | null) {
  if (!moduloPortal || !(moduloPortal in DEPARTAMENTO_MODULO_ROTA)) return null
  return DEPARTAMENTO_MODULO_ROTA[moduloPortal as keyof typeof DEPARTAMENTO_MODULO_ROTA]
}

export function DepartamentosFallback() {
  return (
    <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 rounded-2xl bg-[rgb(var(--border))]" />
      ))}
    </div>
  )
}

export async function DepartamentosSection() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const [meusDepartamentos, gestorDe]: [DepartamentoHubLite[], GestorLite[]] =
    await Promise.all([
      db.userDepartamento.findMany({
        where: { userId: session.user.id, tenantId: tenant.id },
        select: {
          departamento: {
            select: {
              id: true,
              nome: true,
              slug: true,
              cor: true,
              permissions: true,
              moduloPortal: true,
              ordem: true,
            },
          },
        },
      }),
      db.departamentoGestor.findMany({
        where: { userId: session.user.id, departamento: { tenantId: tenant.id } },
        select: { departamentoId: true },
      }),
    ])

  if (meusDepartamentos.length === 0) {
    return (
      <MotionEmptyState
        icon={<Briefcase className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title="Você ainda não faz parte de nenhum departamento."
        description="Quando a diretoria te incluir em um departamento, os módulos que ele abre aparecem aqui."
      />
    )
  }

  const gestorIds = new Set(gestorDe.map((g) => g.departamentoId))
  const departamentos = meusDepartamentos
    .map((d) => d.departamento)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {departamentos.map((depto, index) => {
        const rota = rotaDoModulo(depto.moduloPortal)
        const moduloLabel = depto.moduloPortal ? MODULO_LABEL.get(depto.moduloPortal) : null
        const isGestor = gestorIds.has(depto.id)

        return (
          <MotionReveal key={depto.id} index={index}>
            <div className="flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: depto.cor }}
                >
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                    {depto.nome}
                  </h2>
                  <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                    {moduloLabel ? `Acesso a ${moduloLabel}` : 'Sem módulo vinculado'}
                    {depto.permissions.length > 0 &&
                      ` · ${depto.permissions.length} ${depto.permissions.length === 1 ? 'permissão' : 'permissões'}`}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex items-center gap-2 pt-4">
                {rota?.disponivel && rota.href ? (
                  <Link
                    href={rota.href}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Abrir módulo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))]">
                    <Clock className="h-4 w-4" />
                    Em breve
                  </span>
                )}
                {isGestor && (
                  <Link
                    href="/admin"
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <Shield className="h-4 w-4 text-[rgb(var(--primary))]" />
                    Administrar
                  </Link>
                )}
              </div>
            </div>
          </MotionReveal>
        )
      })}
    </div>
  )
}
