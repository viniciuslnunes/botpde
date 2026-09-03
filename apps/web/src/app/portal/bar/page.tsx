import { redirect } from 'next/navigation'
import { Beer } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { listarCategoriasBar, listarProdutosBar, resolveUnidadeBar } from '@/lib/bar'
import type { BarCategoriaLite, BarProdutoLite } from '@/lib/bar'
import {
  getComandaAbertaDoMembro,
  listarDebitosComandaDoMembro,
  type BarComandaAbertaPortal,
  type BarDebitoComandaPortal,
} from '@/lib/bar-comanda'
import { db } from '@torcida/db'
import { getTurnoAbertoBar } from '@/lib/bar'
import { montarQrComanda } from '@/lib/comanda-qr'
import { montarQrVendaBar } from '@/lib/venda-bar-qr'
import { BarCompraAntecipada } from '@/components/portal/bar/bar-compra-antecipada'
import {
  BarValesRetirada,
  type ValeRetiradaBar,
} from '@/components/portal/bar/bar-vales-retirada'
import { serializeProdutoBar } from '@/lib/bar-serialize'
import { BarCardapio } from '@/components/portal/bar/bar-cardapio'
import { BarMinhaComanda } from '@/components/portal/bar/bar-minha-comanda'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bar' }

export default async function PortalBarPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')

  const userId = session.user.id
  const unidade = await resolveUnidadeBar(tenant.id, userId)

  const [produtos, categorias, comanda, debitos]: [
    BarProdutoLite[],
    BarCategoriaLite[],
    BarComandaAbertaPortal | null,
    BarDebitoComandaPortal[],
  ] = await Promise.all([
    listarProdutosBar(tenant.id, unidade.id, { apenasAtivos: true }),
    listarCategoriasBar(tenant.id, unidade.id),
    getComandaAbertaDoMembro(tenant.id, unidade.id, userId),
    listarDebitosComandaDoMembro(tenant.id, unidade.id, userId),
  ])

  // Compra antecipada só existe com o caixa aberto: é o que garante que toda
  // venda do portal nasce dentro de um turno e a conferência de caixa fecha.
  const turno = await getTurnoAbertoBar(tenant.id, unidade.id)

  type VendaPortalRow = {
    id: string
    total: { toNumber(): number } | number
    status: string
    criadoEm: Date
    itens: Array<{ produtoNome: string; quantidade: number; retiradoQtd: number }>
  }
  const compras: VendaPortalRow[] = await db.barVenda.findMany({
    where: {
      tenantId: tenant.id,
      sedeId: unidade.id,
      compradorUserId: userId,
      origem: 'PORTAL',
      retiradoEm: null,
      status: { in: ['PENDENTE', 'PAGA'] },
    },
    select: {
      id: true,
      total: true,
      status: true,
      criadoEm: true,
      itens: { select: { produtoNome: true, quantidade: true, retiradoQtd: true } },
    },
    orderBy: { criadoEm: 'desc' },
    take: 10,
  })

  const vales: ValeRetiradaBar[] = compras.map((v) => ({
    id: v.id,
    total: typeof v.total === 'number' ? v.total : v.total.toNumber(),
    criadoEm: v.criadoEm,
    pago: v.status === 'PAGA',
    // Mostra o que FALTA, não o que foi comprado: depois de uma retirada
    // parcial, repetir a lista original faria o sócio pedir de novo o que já levou.
    itens: v.itens
      .map((i) => ({ nome: i.produtoNome, falta: Math.max(i.quantidade - i.retiradoQtd, 0) }))
      .filter((i) => i.falta > 0)
      .map((i) => `${i.nome} ×${i.falta}`)
      .join(', '),
    // Sem PIX confirmado não há vale: o QR só nasce quando o dinheiro entrou.
    qr: v.status === 'PAGA' ? montarQrVendaBar(v.id) : null,
  }))

  const categoriasAtivas = categorias
    .filter((c) => c.ativo)
    .map((c) => ({ id: c.id, nome: c.nome }))

  const itens = produtos.map((p) => {
    const s = serializeProdutoBar(p)
    return {
      id: s.id,
      nome: s.nome,
      descricao: s.descricao,
      preco: s.preco,
      imagemUrl: s.imagemUrl,
      destaque: s.destaque,
      estoque: s.estoque,
      categoria: s.categoria,
    }
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MotionReveal>
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-gradient-to-br from-[rgb(var(--primary)_/_0.14)] to-transparent p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.18)] text-[rgb(var(--color-primary-fg))]">
              <Beer className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Bar</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                {unidade.nome} — cardápio do balcão.
              </p>
            </div>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={1}>
        {/* Com comanda/débito: cards; senão: linha discreta (não card vazio barulhento). */}
        <BarMinhaComanda
          comanda={comanda}
          debitos={debitos}
          qrComanda={comanda ? montarQrComanda(comanda.id) : null}
        />
      </MotionReveal>

      <MotionReveal index={2}>
        <BarValesRetirada vales={vales} />
      </MotionReveal>

      {turno && (
        <MotionReveal index={3}>
          <BarCompraAntecipada produtos={itens} />
        </MotionReveal>
      )}

      <MotionReveal index={4}>
        <BarCardapio produtos={itens} categorias={categoriasAtivas} />
      </MotionReveal>
    </div>
  )
}
