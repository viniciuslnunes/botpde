import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ScrollText, Shield } from 'lucide-react'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { labelAcaoAuditoria, labelEntidadeAuditoria } from '@/lib/audit-labels'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Auditoria — Admin' }

const PAGE_SIZE = 30

type AuditLogRow = {
  id: string
  acao: string
  entidade: string | null
  entidadeId: string | null
  detalhes: unknown
  criadoEm: Date
  ator: { id: string; nome: string | null; email: string | null } | null
}

function formatarDataHora(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

function nomeAtor(ator: AuditLogRow['ator']) {
  if (!ator) return 'Sistema / desconhecido'
  return ator.nome?.trim() || ator.email || 'Usuário sem nome'
}

function resumoDetalhes(detalhes: unknown): string | null {
  if (detalhes == null || typeof detalhes !== 'object') return null
  const entries = Object.entries(detalhes as Record<string, unknown>).slice(0, 4)
  if (entries.length === 0) return null
  return entries
    .map(([k, v]) => {
      if (v == null) return `${k}: —`
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        return `${k}: ${String(v)}`
      }
      return `${k}: …`
    })
    .join(' · ')
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; q?: string }>
}) {
  // O tenant vem do próprio gate (tenant ativo) — reabrir por host traria o
  // `TENANT_SLUG` do deploy e a trilha de outra torcida.
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.AUDIT_VIEW))
  } catch {
    redirect('/admin')
  }

  const params = await searchParams
  const busca = (params.q ?? '').trim()
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)
  const skip = (pagina - 1) * PAGE_SIZE

  const where = {
    tenantId: tenant.id,
    ...(busca
      ? {
          OR: [
            { acao: { contains: busca, mode: 'insensitive' as const } },
            { entidade: { contains: busca, mode: 'insensitive' as const } },
            { entidadeId: { contains: busca, mode: 'insensitive' as const } },
            { ator: { nome: { contains: busca, mode: 'insensitive' as const } } },
            { ator: { email: { contains: busca, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [total, logs]: [number, AuditLogRow[]] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        acao: true,
        entidade: true,
        entidadeId: true,
        detalhes: true,
        criadoEm: true,
        ator: { select: { id: true, nome: true, email: true } },
      },
    }),
  ])

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const qs = (p: number) => {
    const sp = new URLSearchParams()
    if (busca) sp.set('q', busca)
    if (p > 1) sp.set('pagina', String(p))
    const s = sp.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-xl text-sm text-[rgb(var(--foreground-muted))]">
            Registro imutável das ações administrativas neste tenant — quem fez, o que aconteceu e
            sobre qual recurso. Ninguém pode editar ou apagar estes eventos.
          </p>
          <div className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            Somente leitura · Diretoria
          </div>
        </div>

        <form method="get" className="mt-4">
          <label htmlFor="q" className="sr-only">
            Buscar no registro
          </label>
          <input
            id="q"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por ação, entidade, id ou responsável…"
            className="w-full max-w-md rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none ring-[rgb(var(--primary))] placeholder:text-[rgb(var(--foreground-muted))] focus:ring-2"
          />
        </form>

        <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
          {total} evento{total !== 1 ? 's' : ''}
          {busca ? ` para “${busca}”` : ''}
        </p>
      </div>

      <div>
        {logs.length === 0 ? (
          <MotionEmptyState
            icon={<ScrollText className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
            title={busca ? 'Nenhum evento encontrado' : 'Nenhuma atividade registrada'}
            description={
              busca
                ? 'Tente outro termo de busca.'
                : 'As ações administrativas deste tenant aparecerão aqui automaticamente.'
            }
          />
        ) : (
          <MotionReveal>
            <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(var(--border))] text-xs uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    <th className="px-4 py-3 font-medium">Quando</th>
                    <th className="px-4 py-3 font-medium">Responsável</th>
                    <th className="px-4 py-3 font-medium">Evento</th>
                    <th className="px-4 py-3 font-medium">Recurso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border))]">
                  {logs.map((log) => {
                    const detalhes = resumoDetalhes(log.detalhes)
                    return (
                      <tr key={log.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-[rgb(var(--foreground-muted))]">
                          {formatarDataHora(log.criadoEm)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[rgb(var(--foreground))]">
                            {nomeAtor(log.ator)}
                          </p>
                          {log.ator?.email && log.ator.nome ? (
                            <p className="text-xs text-[rgb(var(--foreground-muted))]">
                              {log.ator.email}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[rgb(var(--foreground))]">
                            {labelAcaoAuditoria(log.acao)}
                          </p>
                          <p className="font-mono text-[10px] text-[rgb(var(--foreground-muted))]">
                            {log.acao}
                          </p>
                          {detalhes ? (
                            <p className="mt-1 max-w-sm text-xs text-[rgb(var(--foreground-muted))]">
                              {detalhes}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[rgb(var(--foreground))]">
                            {labelEntidadeAuditoria(log.entidade)}
                          </p>
                          {log.entidadeId ? (
                            <p className="mt-0.5 max-w-[12rem] truncate font-mono text-[10px] text-[rgb(var(--foreground-muted))]" title={log.entidadeId}>
                              {log.entidadeId}
                            </p>
                          ) : (
                            <p className="text-xs text-[rgb(var(--foreground-muted))]">—</p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <p className="text-[rgb(var(--foreground-muted))]">
                  Página {pagina} de {totalPaginas}
                </p>
                <div className="flex gap-2">
                  {pagina > 1 ? (
                    <Link
                      href={`/admin/auditoria${qs(pagina - 1)}`}
                      className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
                    >
                      Anterior
                    </Link>
                  ) : null}
                  {pagina < totalPaginas ? (
                    <Link
                      href={`/admin/auditoria${qs(pagina + 1)}`}
                      className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
                    >
                      Próxima
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </MotionReveal>
        )}
      </div>
    </div>
  )
}
