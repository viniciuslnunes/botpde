import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Estornos — Bar Admin' }

const PERIODO_DIAS = 30

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
    <div className="app-container space-y-6 py-8">
      <MotionReveal>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/bar"
            className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]"
          >
            <ArrowLeft className="h-4 w-4" /> Bar
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Estornos do bar</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {unidade.nome} · últimos {PERIODO_DIAS} dias
            </p>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={1}>
        <BarEstornosResumo porOperador={porOperador} porProduto={porProduto} />
      </MotionReveal>

      <MotionReveal index={2}>
        <BarEstornosTabela estornos={estornos} />
      </MotionReveal>
    </div>
  )
}
