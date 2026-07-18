import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Receipt } from 'lucide-react'
import {
  formatarMoedaBRL,
  formatDataCompetenciaInput,
  STATUS_COBRANCA_LABEL,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarCobrancasTenant } from '@/lib/cobrancas'
import { getPixProvider } from '@/lib/pix-gateway'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { db } from '@torcida/db'
import type { StatusCobrancaAssociacao } from '@torcida/db'
import { AdminCriarCobrancaForm } from './admin-criar-cobranca-form'
import { AdminCobrancaAcoes, DispararLembretesButton } from './admin-cobrancas-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cobranças — Admin' }

type Props = { searchParams: Promise<{ status?: string }> }

const STATUS_FILTROS: Array<{ value: '' | StatusCobrancaAssociacao; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'PENDENTE', label: 'Pendentes' },
  { value: 'VENCIDA', label: 'Vencidas' },
  { value: 'PAGA', label: 'Pagas' },
  { value: 'CANCELADA', label: 'Canceladas' },
]

export default async function CobrancasAdminPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const statusFiltro = (sp.status as StatusCobrancaAssociacao | undefined) ?? undefined

  const [cobrancas, membrosRaw, planosRaw] = await Promise.all([
    listarCobrancasTenant(tenant.id, {
      status: statusFiltro,
      limite: 80,
    }),
    db.saasMembro.findMany({
      where: { tenantId: tenant.id, status: 'APROVADO', desligadoEm: null },
      orderBy: { nome: 'asc' },
      select: { userId: true, nome: true },
      take: 500,
    }),
    db.planoAssociacao.findMany({
      where: { tenantId: tenant.id, ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, valor: true },
    }),
  ])

  const provider = getPixProvider()

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[rgb(var(--foreground))]">Cobranças</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Mensalidades e taxas — gateway Pix:{' '}
                <span className="font-medium">{provider === 'mock' ? 'Mock (dev)' : 'Mercado Pago'}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DispararLembretesButton />
            <Link
              href="/admin/planos-associacao"
              className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              Planos
            </Link>
          </div>
        </div>
      </MotionReveal>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTROS.map((f) => {
          const href = f.value ? `/admin/cobrancas?status=${f.value}` : '/admin/cobrancas'
          const active = (statusFiltro ?? '') === f.value
          return (
            <Link
              key={f.label}
              href={href}
              className={[
                'rounded-full px-3 py-1 text-xs transition-colors',
                active
                  ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                  : 'bg-[rgb(var(--background-subtle))] font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      <AdminCriarCobrancaForm
        membros={membrosRaw.map((m: (typeof membrosRaw)[number]) => ({ userId: m.userId, label: m.nome }))}
        planos={planosRaw.map((p: (typeof planosRaw)[number]) => ({
          id: p.id,
          nome: p.nome,
          valor: Number(p.valor),
        }))}
      />

      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        {cobrancas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma cobrança encontrada.
          </p>
        ) : (
          <table className="w-full min-w-0 text-sm md:min-w-[36rem] xl:min-w-[48rem]">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Associado
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Descrição
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Vencimento
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {cobrancas.map((c) => {
                const statusLabel =
                  STATUS_COBRANCA_LABEL[c.status as keyof typeof STATUS_COBRANCA_LABEL] ?? c.status
                const statusClass =
                  c.status === 'PAGA'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : c.status === 'VENCIDA'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : c.status === 'CANCELADA'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'

                return (
                  <tr key={c.id} className="hover:bg-[rgb(var(--background-subtle)_/_0.5)]">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.user.nome ?? '—'}</p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">{c.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{c.descricao}</p>
                      <p className="font-mono text-xs text-[rgb(var(--foreground-muted))]">
                        {formatarMoedaBRL(Number(c.valor))}
                        {c.planoAssociacao ? ` · ${c.planoAssociacao.nome}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {formatDataCompetenciaInput(c.vencimento)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
                        {statusLabel}
                      </span>
                      {c.pixCopiaCola && c.status !== 'PAGA' && (
                        <p className="mt-0.5 text-[10px] text-[rgb(var(--foreground-muted))]">Pix gerado</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AdminCobrancaAcoes cobrancaId={c.id} status={c.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
