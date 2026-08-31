import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarFornecedoresBar, listarMovimentacoesEstoqueBar, listarProdutosBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarFornecedorLite, BarMovimentacaoEstoqueLite, BarProdutoLite } from '@/lib/bar'
import { serializeProdutoBar } from '@/lib/bar-serialize'
import {
  BarEstoqueTabela,
  BarMovimentacoesEstoqueLista,
  RegistrarCompraBarForm,
  type BarMovimentacaoEstoqueItem,
} from '@/components/admin/bar/bar-estoque'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Estoque — Bar Admin' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

export default async function AdminBarEstoquePage() {
  let session: Awaited<ReturnType<typeof assertPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertPermission(PERMISSIONS.BAR_MANAGE))
  } catch {
    redirect('/admin/bar')
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)
  const [produtos, fornecedores, movimentacoes]: [
    BarProdutoLite[],
    BarFornecedorLite[],
    BarMovimentacaoEstoqueLite[],
  ] = await Promise.all([
    listarProdutosBar(tenant.id, unidade.id),
    listarFornecedoresBar(tenant.id, { apenasAtivos: true }),
    listarMovimentacoesEstoqueBar(tenant.id, unidade.id),
  ])
  const serializados = produtos.map(serializeProdutoBar)
  const baixos = serializados.filter(
    (p) => p.ativo && p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo,
  ).length

  const movimentacoesItens: BarMovimentacaoEstoqueItem[] = movimentacoes.map((m) => ({
    id: m.id,
    produtoNome: m.produtoNome,
    tipo: m.tipo,
    quantidade: m.quantidade,
    custoTotal: m.custoTotal != null ? Number(m.custoTotal) : null,
    motivo: m.motivo,
    criadoEmLabel: formatarData(m.criadoEm),
    fornecedorNome: m.fornecedor?.nome ?? null,
    operadorNome: m.operador?.nome ?? null,
  }))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          {baixos > 0
            ? `${baixos} produto${baixos !== 1 ? 's' : ''} abaixo do mínimo`
            : 'Nenhum produto abaixo do mínimo'}
        </p>
        <Link
          href="/admin/bar/fornecedores"
          className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Fornecedores
        </Link>
      </div>

      <MotionReveal>
        <RegistrarCompraBarForm produtos={serializados} fornecedores={fornecedores} />
      </MotionReveal>

      <BarEstoqueTabela produtos={serializados} />

      <MotionReveal index={1}>
        <section className="space-y-3">
          <h2 className="font-semibold text-[rgb(var(--foreground))]">Movimentações recentes</h2>
          <BarMovimentacoesEstoqueLista movimentacoes={movimentacoesItens} />
        </section>
      </MotionReveal>
    </>
  )
}
