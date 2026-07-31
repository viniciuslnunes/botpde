import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import {
  PERMISSIONS,
  STATUS_COMANDA_BAR_LABEL,
  saldoComanda,
} from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { resolveUnidadeBar } from '@/lib/bar'
import {
  listarComandasBar,
  type BarComandaListagemLite,
  type FiltroListagemComandaBar,
} from '@/lib/bar-comanda'
import {
  BarComandasList,
  type BarComandaListItem,
} from '@/components/admin/bar/bar-comandas-list'
import { AdminTabs, adminTabIds } from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Comandas — Bar Admin' }

const TABS: Array<{ id: FiltroListagemComandaBar; label: string }> = [
  { id: 'abertas', label: 'Abertas' },
  { id: 'em_aberto', label: 'Em aberto' },
  { id: 'historico', label: 'Histórico' },
]

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(data)
}

function formatarDataHora(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data)
}

function resolverFiltro(raw: string | undefined): FiltroListagemComandaBar {
  if (raw === 'em_aberto' || raw === 'historico' || raw === 'abertas') return raw
  return 'abertas'
}

function metaDaComanda(c: BarComandaListagemLite, filtro: FiltroListagemComandaBar): string {
  if (filtro === 'abertas') {
    const limite =
      c.limite != null ? ` · limite ${formatarPreco(Number(c.limite))}` : ''
    return `Aberta em ${formatarDataHora(c.abertaEm)}${limite}`
  }
  if (filtro === 'em_aberto') {
    const venc = c.vencimento ? ` · vence ${formatarData(c.vencimento)}` : ''
    return `Fechada ${c.fechadaEm ? formatarData(c.fechadaEm) : '—'}${venc}`
  }
  if (c.status === 'CANCELADA' && c.canceladaEm) {
    return `Cancelada em ${formatarData(c.canceladaEm)}`
  }
  if (c.pagoEm) return `Paga em ${formatarData(c.pagoEm)}`
  if (c.fechadaEm) return `Fechada em ${formatarData(c.fechadaEm)}`
  return `Aberta em ${formatarData(c.abertaEm)}`
}

export default async function AdminBarComandasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.BAR_MANAGE,
    ]))
  } catch {
    redirect('/admin/bar')
  }

  let podeGerir = false
  try {
    await assertPermission(PERMISSIONS.BAR_MANAGE)
    podeGerir = true
  } catch {
    // Operador vê a lista; quitar/cancelar exige manage.
  }

  const params = await searchParams
  const filtro = resolverFiltro(params.tab)

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
  const whereUnidade = { tenantId: tenant.id, sedeId: unidade.id }

  const [comandas, countAbertas, countEmAberto]: [
    BarComandaListagemLite[],
    number,
    number,
  ] = await Promise.all([
    listarComandasBar(tenant.id, unidade.id, { filtro }),
    db.barComanda.count({ where: { ...whereUnidade, status: 'ABERTA' } }),
    db.barComanda.count({
      where: {
        ...whereUnidade,
        status: { in: ['FECHADA_COM_DEBITO', 'VENCIDA'] },
      },
    }),
  ])

  const saldos: Record<string, number> = {}
  const itens: BarComandaListItem[] = comandas.map((c) => {
    const total = Number(c.total)
    const desconto = Number(c.desconto)
    const totalPago = Number(c.totalPago)
    const saldo = saldoComanda({ total, desconto, totalPago })
    if (filtro === 'em_aberto') saldos[c.id] = saldo
    return {
      id: c.id,
      codigo: c.codigo,
      titularNome: c.titularNome,
      totalLabel: formatarPreco(total),
      saldoLabel: filtro === 'em_aberto' ? formatarPreco(saldo) : null,
      limiteLabel: c.limite != null ? formatarPreco(Number(c.limite)) : null,
      vencimentoLabel: c.vencimento ? formatarData(c.vencimento) : null,
      abertaEmLabel: formatarDataHora(c.abertaEm),
      status: c.status,
      statusLabel: STATUS_COMANDA_BAR_LABEL[c.status] ?? c.status,
      metaLabel: metaDaComanda(c, filtro),
    }
  })

  const { panelId, tabId } = adminTabIds('tab', filtro)

  const resumo =
    filtro === 'abertas'
      ? countAbertas > 0
        ? `${countAbertas} comanda${countAbertas !== 1 ? 's' : ''} aberta${countAbertas !== 1 ? 's' : ''} nesta unidade.`
        : 'Nenhuma comanda aberta nesta unidade.'
      : filtro === 'em_aberto'
        ? countEmAberto > 0
          ? `${countEmAberto} comanda${countEmAberto !== 1 ? 's' : ''} com débito em aberto.`
          : 'Nenhum débito em aberto nesta unidade.'
        : 'Histórico recente de comandas fechadas, quitadas ou canceladas.'

  return (
    <>
      <p className="text-sm text-[rgb(var(--foreground-muted))]">{resumo}</p>

      <AdminTabs
        tabs={TABS.map((t) => ({
          id: t.id,
          label: t.label,
          count:
            t.id === 'abertas'
              ? countAbertas
              : t.id === 'em_aberto'
                ? countEmAberto
                : undefined,
          countClass:
            t.id === 'em_aberto'
              ? 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]'
              : undefined,
        }))}
        basePath="/admin/bar/comandas"
        activeId={filtro}
        paramKey="tab"
      />

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="mt-4">
        <BarComandasList
          comandas={itens}
          modo={filtro}
          podeGerir={podeGerir}
          saldos={filtro === 'em_aberto' ? saldos : undefined}
        />
      </div>
    </>
  )
}
