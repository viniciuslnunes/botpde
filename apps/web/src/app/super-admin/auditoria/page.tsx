import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ScrollText } from 'lucide-react'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail, listarTorcidasParaSelecao } from '@/lib/tenant-context'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import { TableShell } from '@/components/admin/ui/table-shell'
import { TablePagination } from '@/components/admin/ui/table-pagination'
import { buildAdminHref } from '@/lib/admin-href'
import { labelAcaoAuditoria, labelEntidadeAuditoria } from '@/lib/audit-labels'

export const metadata: Metadata = { title: 'Auditoria — Super Admin' }

const PAGE_SIZE = 30

type AuditLogRow = {
  id: string
  acao: string
  entidade: string | null
  entidadeId: string | null
  detalhes: unknown
  criadoEm: Date
  ator: { id: string; nome: string | null; email: string | null } | null
  tenant: { id: string; nome: string; slug: string }
}

function formatarDataHora(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(data),
  )
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

export default async function AuditoriaPlataformaPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; q?: string; tenant?: string; acao?: string }>
}) {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const params = await searchParams
  const busca = (params.q ?? '').trim()
  const tenantId = params.tenant ?? ''
  const acaoFiltro = params.acao ?? ''
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)
  const skip = (pagina - 1) * PAGE_SIZE

  const where = {
    ...(tenantId ? { tenantId } : {}),
    ...(acaoFiltro ? { acao: acaoFiltro } : {}),
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

  const [total, logs, torcidas, acoesDisponiveis] = await Promise.all([
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
        tenant: { select: { id: true, nome: true, slug: true } },
      },
    }) as Promise<AuditLogRow[]>,
    listarTorcidasParaSelecao(),
    db.auditLog.findMany({
      distinct: ['acao'],
      select: { acao: true },
      orderBy: { acao: 'asc' },
      take: 200,
    }) as Promise<{ acao: string }[]>,
  ])

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const buildHref = (p: number) =>
    buildAdminHref('/super-admin/auditoria', {
      q: busca || undefined,
      tenant: tenantId || undefined,
      acao: acaoFiltro || undefined,
      pagina: p > 1 ? p : undefined,
    })

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Auditoria — plataforma"
        description="Registro imutável das ações administrativas em todas as torcidas — quem fez, o que aconteceu e sobre qual recurso."
        icon={<ScrollText className="h-5 w-5" />}
      />

      <div className="app-container min-w-0 flex-1 space-y-6 py-5 sm:py-8">
        <form method="get" className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <label htmlFor="q" className="block text-sm font-medium text-[rgb(var(--foreground))]">
                Buscar
              </label>
              <input
                id="q"
                name="q"
                defaultValue={busca}
                placeholder="Ação, entidade, id ou responsável…"
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
              />
            </div>

            <div>
              <label htmlFor="tenant" className="block text-sm font-medium text-[rgb(var(--foreground))]">
                Torcida
              </label>
              <select
                id="tenant"
                name="tenant"
                defaultValue={tenantId}
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
              >
                <option value="">Todas</option>
                {torcidas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="acao" className="block text-sm font-medium text-[rgb(var(--foreground))]">
                Ação
              </label>
              <select
                id="acao"
                name="acao"
                defaultValue={acaoFiltro}
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
              >
                <option value="">Todas</option>
                {acoesDisponiveis.map((a) => (
                  <option key={a.acao} value={a.acao}>
                    {labelAcaoAuditoria(a.acao)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button type="submit" className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90">
              Filtrar
            </button>
            <a
              href="/super-admin/auditoria"
              className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-2 text-sm font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-raised))]"
            >
              Resetar
            </a>
            <span className="text-xs text-[rgb(var(--foreground-muted))]">
              {total} evento{total !== 1 ? 's' : ''}
            </span>
          </div>
        </form>

        <TableShell
          isEmpty={logs.length === 0}
          empty={{
            icon: <ScrollText className="h-6 w-6" />,
            title: busca || tenantId || acaoFiltro ? 'Nenhum evento encontrado' : 'Nenhuma atividade registrada',
            description: 'Ajuste os filtros ou tente outro termo de busca.',
          }}
          footer={<TablePagination page={pagina} totalPages={totalPaginas} buildHref={buildHref} />}
        >
          <thead className="bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Quando</th>
              <th className="px-3 py-2 text-left font-semibold">Torcida</th>
              <th className="px-3 py-2 text-left font-semibold">Responsável</th>
              <th className="px-3 py-2 text-left font-semibold">Evento</th>
              <th className="px-3 py-2 text-left font-semibold">Recurso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {logs.map((log) => {
              const detalhes = resumoDetalhes(log.detalhes)
              return (
                <tr key={log.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-[rgb(var(--foreground-muted))]">
                    {formatarDataHora(log.criadoEm)}
                  </td>
                  <td className="px-3 py-2 text-[rgb(var(--foreground))]">
                    <span className="font-medium">{log.tenant.nome}</span>
                    <span className="ml-1 font-mono text-xs text-[rgb(var(--foreground-muted))]">
                      {log.tenant.slug}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-[rgb(var(--foreground))]">{nomeAtor(log.ator)}</p>
                    {log.ator?.email && log.ator.nome ? (
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">{log.ator.email}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-[rgb(var(--foreground))]">{labelAcaoAuditoria(log.acao)}</p>
                    <p className="font-mono text-[10px] text-[rgb(var(--foreground-muted))]">{log.acao}</p>
                    {detalhes ? (
                      <p className="mt-1 max-w-sm text-xs text-[rgb(var(--foreground-muted))]">{detalhes}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-[rgb(var(--foreground))]">{labelEntidadeAuditoria(log.entidade)}</p>
                    {log.entidadeId ? (
                      <p
                        className="mt-0.5 max-w-[12rem] truncate font-mono text-[10px] text-[rgb(var(--foreground-muted))]"
                        title={log.entidadeId}
                      >
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
        </TableShell>
      </div>
    </div>
  )
}
