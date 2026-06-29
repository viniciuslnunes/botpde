import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, UserCheck, UserX, Clock } from 'lucide-react'
import { MemberActions } from '@/components/admin/member-actions'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Membros — Admin' }

type StatusFilter = 'PENDENTE' | 'APROVADO' | 'REPROVADO' | 'TODOS'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDENTE: {
    label: 'Pendente',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  APROVADO: {
    label: 'Aprovado',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  REPROVADO: {
    label: 'Reprovado',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
}

const TIPO_BADGE: Record<string, string> = {
  SOCIO: 'Sócio',
  TORCEDOR: 'Torcedor',
}

export default async function MembrosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; pagina?: string }>
}) {
  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const params = await searchParams
  const statusFiltro = (params.status as StatusFilter) ?? 'TODOS'
  const busca = params.q ?? ''
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10))
  const porPagina = 20

  const where = {
    tenantId: tenant.id,
    ...(statusFiltro !== 'TODOS' ? { status: statusFiltro } : {}),
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' as const } },
            { cidade: { contains: busca, mode: 'insensitive' as const } },
            { telefone: { contains: busca } },
            { discordTag: { contains: busca, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [membros, total, contagens] = await Promise.all([
    db.saasMembro.findMany({
      where,
      include: { user: { select: { nome: true, email: true, avatarUrl: true } } },
      orderBy: { criadoEm: 'desc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    db.saasMembro.count({ where }),
    db.saasMembro.groupBy({
      by: ['status'],
      where: { tenantId: tenant.id },
      _count: true,
    }),
  ])

  const totalPaginas = Math.ceil(total / porPagina)

  const count: Record<string, number> = { PENDENTE: 0, APROVADO: 0, REPROVADO: 0 }
  for (const c of contagens) count[c.status] = c._count

  const tabs: { status: StatusFilter; label: string; icon: React.ElementType; count?: number }[] = [
    { status: 'TODOS', label: 'Todos', icon: Users, count: Object.values(count).reduce((a, b) => a + b, 0) },
    { status: 'PENDENTE', label: 'Pendentes', icon: Clock, count: count.PENDENTE },
    { status: 'APROVADO', label: 'Aprovados', icon: UserCheck, count: count.APROVADO },
    { status: 'REPROVADO', label: 'Reprovados', icon: UserX, count: count.REPROVADO },
  ]

  function buildHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { status: statusFiltro, q: busca, pagina: String(pagina), ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'TODOS' && v !== '' && v !== '1') p.set(k, v)
    }
    return `/admin/membros${p.toString() ? '?' + p.toString() : ''}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Membros</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {total} {total === 1 ? 'resultado' : 'resultados'}
            </p>
          </div>
        </div>

        {/* Abas de status */}
        <div className="mt-4 flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = statusFiltro === tab.status
            return (
              <Link
                key={tab.status}
                href={buildHref({ status: tab.status, pagina: '1' })}
                className={[
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                    : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                      active
                        ? 'bg-[rgb(var(--primary))] text-white'
                        : tab.status === 'PENDENTE'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                  >
                    {tab.count}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Busca */}
        <form method="GET" action="/admin/membros" className="mt-3">
          {statusFiltro !== 'TODOS' && (
            <input type="hidden" name="status" value={statusFiltro} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome, cidade, telefone ou Discord..."
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-2 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
          />
        </form>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto px-8 py-4">
        {membros.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />
            <p className="text-lg font-medium text-[rgb(var(--foreground))]">Nenhum membro encontrado</p>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              {busca ? 'Tente ajustar os filtros de busca' : 'Aguardando candidatos nesta categoria'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    Membro
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden sm:table-cell">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden md:table-cell">
                    Cidade
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden lg:table-cell">
                    Cadastro
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
                {membros.map((membro) => {
                  const badge = STATUS_BADGE[membro.status]
                  return (
                    <tr
                      key={membro.id}
                      className="transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {membro.user.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={membro.user.avatarUrl}
                              alt={membro.nome}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.1)] text-xs font-bold text-[rgb(var(--primary))]">
                              {membro.nome.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-[rgb(var(--foreground))]">{membro.nome}</p>
                            {membro.discordTag && (
                              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                                {membro.discordTag}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-[rgb(var(--foreground-muted))]">
                          {TIPO_BADGE[membro.tipo] ?? membro.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-[rgb(var(--foreground-muted))]">
                          {membro.cidade ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-[rgb(var(--foreground-muted))]">
                          {new Date(membro.criadoEm).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <MemberActions
                          membroId={membro.id}
                          status={membro.status as 'PENDENTE' | 'APROVADO' | 'REPROVADO'}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-[rgb(var(--foreground-muted))]">
              Página {pagina} de {totalPaginas}
            </p>
            <div className="flex gap-2">
              {pagina > 1 && (
                <Link
                  href={buildHref({ pagina: String(pagina - 1) })}
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  ← Anterior
                </Link>
              )}
              {pagina < totalPaginas && (
                <Link
                  href={buildHref({ pagina: String(pagina + 1) })}
                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
