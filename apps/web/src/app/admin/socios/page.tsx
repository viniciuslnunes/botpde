import Image from 'next/image'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import { CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { EmitirCarteirinhaForm, SocioActions } from '@/components/admin/socio-forms'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sócios — Admin' }

function isVencida(validade: Date) {
  return validade < new Date()
}

function isProximaVencer(validade: Date) {
  const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  return validade > new Date() && validade < em30dias
}

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  try {
    await assertPermission(PERMISSIONS.MEMBERS_VIEW)
  } catch {
    redirect('/admin')
  }

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const params = await searchParams
  const busca = params.q ?? ''
  const statusFiltro = params.status ?? 'todos'

  // Sócios com carteirinha
  const socios = await db.saasSocio.findMany({
    where: {
      tenantId: tenant.id,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' } },
              { numeroSocio: isNaN(parseInt(busca)) ? undefined : parseInt(busca) },
            ],
          }
        : {}),
    },
    include: {
      user: { select: { email: true, avatarUrl: true, discordId: true } },
    },
    orderBy: { numeroSocio: 'asc' },
  })

  type Socio = (typeof socios)[number]

  const sociosFiltrados = socios.filter((s: Socio) => {
    if (statusFiltro === 'ativos') return !isVencida(s.validade)
    if (statusFiltro === 'vencidos') return isVencida(s.validade)
    if (statusFiltro === 'vencendo') return isProximaVencer(s.validade)
    return true
  })

  // Membros SOCIO aprovados que ainda não têm carteirinha
  const socioIds = socios.map((s: Socio) => s.userId)
  const membrosElegiveis = await db.saasMembro.findMany({
    where: {
      tenantId: tenant.id,
      status: 'APROVADO',
      tipo: 'SOCIO',
      userId: { notIn: socioIds },
    },
    select: {
      userId: true,
      nome: true,
      discordTag: true,
    },
  })

  const contagens = {
    total: socios.length,
    ativos: socios.filter((s: Socio) => !isVencida(s.validade)).length,
    vencidos: socios.filter((s: Socio) => isVencida(s.validade)).length,
    vencendo: socios.filter((s: Socio) => isProximaVencer(s.validade)).length,
  }

  const tabs = [
    { key: 'todos', label: 'Todos', count: contagens.total },
    { key: 'ativos', label: 'Ativos', count: contagens.ativos },
    { key: 'vencendo', label: 'Vencendo', count: contagens.vencendo },
    { key: 'vencidos', label: 'Vencidos', count: contagens.vencidos },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Sócios</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {contagens.total} carteirinha{contagens.total !== 1 ? 's' : ''} emitida{contagens.total !== 1 ? 's' : ''}
            </p>
          </div>
          <EmitirCarteirinhaForm membrosElegiveis={membrosElegiveis} />
        </div>

        {/* Abas */}
        <div className="app-scrollbar-none -mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1">
          {tabs.map((tab) => {
            const active = statusFiltro === tab.key
            return (
              <a
                key={tab.key}
                href={`/admin/socios?status=${tab.key}${busca ? `&q=${busca}` : ''}`}
                className={[
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                    : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                      active
                        ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                        : tab.key === 'vencendo'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                        : tab.key === 'vencidos'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                  >
                    {tab.count}
                  </span>
                )}
              </a>
            )
          })}
        </div>

        {/* Busca */}
        <form method="GET" action="/admin/socios" className="mt-3">
          {statusFiltro !== 'todos' && <input type="hidden" name="status" value={statusFiltro} />}
          <input
            type="search"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome ou número..."
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-2 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
          />
        </form>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-auto py-4">
        <div className="app-container">
        {sociosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CreditCard className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />
            <p className="text-lg font-medium text-[rgb(var(--foreground))]">
              {busca ? 'Nenhum resultado encontrado' : 'Nenhuma carteirinha nesta categoria'}
            </p>
            {membrosElegiveis.length > 0 && !busca && statusFiltro === 'todos' && (
              <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
                {membrosElegiveis.length} membro{membrosElegiveis.length > 1 ? 's' : ''} elegível{membrosElegiveis.length > 1 ? 'is' : ''} aguardando emissão
              </p>
            )}
          </div>
        ) : (
          <MotionReveal index={0}>
          <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Nº</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] hidden md:table-cell">Contato</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Validade</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
                {sociosFiltrados.map((socio: Socio) => {
                  const vencida = isVencida(socio.validade)
                  const vencendo = isProximaVencer(socio.validade)
                  return (
                    <tr key={socio.id} className="transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.5)]">
                      {/* Número */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-bold text-[rgb(var(--foreground))]">
                          {String(socio.numeroSocio).padStart(5, '0')}
                        </span>
                      </td>

                      {/* Nome + avatar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {socio.user.avatarUrl ? (
                            canOptimizeImageUrl(socio.user.avatarUrl) ? (
                              <Image src={socio.user.avatarUrl} alt={socio.nome} width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={socio.user.avatarUrl} alt={socio.nome} loading="lazy" decoding="async" className="h-8 w-8 rounded-full object-cover" />
                            )
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.1)] text-xs font-bold text-[rgb(var(--color-primary-fg))]">
                              {socio.nome.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-[rgb(var(--foreground))]">{socio.nome}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-[rgb(var(--foreground-muted))]">
                          {socio.user.email ?? '—'}
                        </span>
                      </td>

                      {/* Validade */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {vencida ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                          ) : vencendo ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                          )}
                          <span
                            className={[
                              'text-sm',
                              vencida
                                ? 'text-red-600 dark:text-red-400'
                                : vencendo
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-[rgb(var(--foreground))]',
                            ].join(' ')}
                          >
                            {socio.validade.toLocaleDateString('pt-BR')}
                          </span>
                          {vencida && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                              Vencida
                            </span>
                          )}
                          {vencendo && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                              Vence em breve
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <SocioActions
                          socioId={socio.id}
                          validade={socio.validade.toISOString().split('T')[0]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </MotionReveal>
        )}
        </div>
      </div>
    </div>
  )
}
