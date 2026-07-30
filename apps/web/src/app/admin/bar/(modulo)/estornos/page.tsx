import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PERMISSIONS, METODO_PAGAMENTO_BAR_LABEL } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarEstornosBar, LIMIAR_ESTORNOS_ANOMALO, resolveUnidadeBar } from '@/lib/bar'
import type { BarEstornosResumo as BarEstornosResumoData } from '@/lib/bar'
import {
  BarEstornosResumo,
  BarEstornosTabela,
  type BarEstornoItem,
  type BarEstornoOperadorItem,
  type BarEstornoProdutoItem,
} from '@/components/admin/bar/bar-estornos'
import { diasDoPeriodo, PERIODO_LABEL, PERIODO_PADRAO } from '@/lib/admin-insights'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Estornos — Bar Admin' }

const PERIODO_DIAS = diasDoPeriodo(PERIODO_PADRAO)

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

export default async function AdminBarEstornosPage() {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE))
  } catch {
    redirect('/admin/bar')
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

  const ate = new Date()
  const de = new Date(ate.getTime() - PERIODO_DIAS * 24 * 60 * 60 * 1000)
  const resumo: BarEstornosResumoData = await listarEstornosBar(tenant.id, unidade.id, { de, ate })

  const estornos: BarEstornoItem[] = resumo.vendas.map((v) => ({
    id: v.id,
    totalLabel: formatarPreco(Number(v.total)),
    metodoLabel: METODO_PAGAMENTO_BAR_LABEL[v.metodoPagamento] ?? v.metodoPagamento,
    operadorNome: v.operador.nome ?? '—',
    estornadoPorNome: v.estornadoPor?.nome ?? null,
    motivo: v.motivoEstorno,
    criadoEmLabel: formatarData(v.criadoEm),
    estornadoEmLabel: v.estornadoEm ? formatarData(v.estornadoEm) : null,
  }))

  const porOperador: BarEstornoOperadorItem[] = resumo.porOperador.map((op) => ({
    operadorId: op.operadorId,
    operadorNome: op.operadorNome ?? '—',
    quantidade: op.quantidade,
    valorLabel: formatarPreco(op.valorTotal),
    anomalo: op.quantidade >= LIMIAR_ESTORNOS_ANOMALO,
  }))

  const porProduto: BarEstornoProdutoItem[] = resumo.porProduto.map((p) => ({
    produtoId: p.produtoId,
    produtoNome: p.produtoNome,
    quantidade: p.quantidade,
    valorLabel: formatarPreco(p.valorTotal),
  }))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[rgb(var(--foreground))]">Estornos do bar</h2>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            {PERIODO_LABEL[PERIODO_PADRAO]}
          </p>
        </div>
        <Link
          href="/admin/bar/vendas"
          className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Voltar às vendas
        </Link>
      </div>

      <MotionReveal>
        <BarEstornosResumo porOperador={porOperador} porProduto={porProduto} />
      </MotionReveal>

      <MotionReveal index={1}>
        <BarEstornosTabela estornos={estornos} />
      </MotionReveal>
    </>
  )
}
