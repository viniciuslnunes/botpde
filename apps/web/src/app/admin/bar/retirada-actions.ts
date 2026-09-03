'use server'

import { db, type Prisma } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { extrairPayloadDeQr } from '@/lib/qr-token'
import { lerQrVendaBar } from '@/lib/venda-bar-qr'

/**
 * Balcão: bipa o vale da compra antecipada e entrega a mercadoria.
 *
 * `PAGA` diz que o dinheiro entrou, **não** que a bebida saiu — a mesma
 * distinção de RSVP × embarque e de pedido × retirada. Este é o passo que fecha
 * a segunda metade.
 *
 * **Retirada é parcial por natureza.** Quem compra quatro cervejas leva duas
 * agora e volta no intervalo; um `retiradoEm` booleano obrigaria o operador a
 * mentir (entregar tudo no papel) ou a recusar. O ledger fica em
 * `BarVendaItem.retiradoQtd`, e `BarVenda.retiradoEm` só é carimbado quando
 * **todos** os itens fecham.
 *
 * O estoque **não** se mexe aqui: ele já baixou na compra (a venda reserva a
 * mercadoria, senão o bar vende o que não tem). Retirar só carimba a entrega.
 */

const RetiradaParcialSchema = z.object({
  payload: z.string().min(1, 'QR ausente'),
  /** `itemId -> quantidade a retirar agora`. Ausente = leva tudo o que falta. */
  quantidades: z.record(z.string().uuid(), z.coerce.number().int().min(0).max(99)).optional(),
})

export type ItemValeBar = {
  id: string
  produtoNome: string
  quantidade: number
  retiradoQtd: number
  /** Quanto ainda falta sair do balcão. */
  restante: number
}

export type ResultadoValeBar =
  | { ok: true; vendaId: string; comprador: string; total: number; itens: ItemValeBar[] }
  | { ok: false; error: string }

export type ResultadoRetiradaBar =
  | {
      ok: true
      comprador: string
      entregue: string
      completo: boolean
      restante: ItemValeBar[]
    }
  | { ok: false; error: string }

type VendaVale = {
  id: string
  status: string
  origem: string
  total: { toNumber(): number } | number
  retiradoEm: Date | null
  comprador: { nome: string | null; email: string | null } | null
  itens: Array<{ id: string; produtoNome: string; quantidade: number; retiradoQtd: number }>
}

async function carregarVale(
  payloadBruto: string,
  tenantId: string,
): Promise<{ ok: true; venda: VendaVale } | { ok: false; error: string }> {
  const vendaId = lerQrVendaBar(extrairPayloadDeQr(payloadBruto))
  if (!vendaId) return { ok: false, error: 'QR inválido ou adulterado.' }

  const venda: VendaVale | null = await db.barVenda.findFirst({
    where: { id: vendaId, tenantId },
    select: {
      id: true,
      status: true,
      origem: true,
      total: true,
      retiradoEm: true,
      comprador: { select: { nome: true, email: true } },
      itens: {
        select: { id: true, produtoNome: true, quantidade: true, retiradoQtd: true },
        orderBy: { produtoNome: 'asc' },
      },
    },
  })

  // Venda de outra torcida some como inexistente — o conferente não precisa
  // saber que ela existe noutro bar.
  if (!venda) return { ok: false, error: 'Compra não encontrada neste bar.' }
  if (venda.origem !== 'PORTAL') {
    return { ok: false, error: 'Esta venda foi feita no balcão e já foi entregue.' }
  }
  if (venda.status === 'CANCELADA' || venda.status === 'ESTORNADA') {
    return { ok: false, error: 'Esta compra foi cancelada.' }
  }
  if (venda.status !== 'PAGA') {
    return { ok: false, error: 'O PIX ainda não foi confirmado. Peça para o sócio conferir.' }
  }
  if (venda.retiradoEm) return { ok: false, error: 'Esta compra já foi retirada por inteiro.' }

  return { ok: true, venda }
}

function nomeComprador(venda: VendaVale): string {
  return venda.comprador?.nome?.trim() || venda.comprador?.email || 'Sócio'
}

function mapearItens(venda: VendaVale): ItemValeBar[] {
  return venda.itens.map((i) => ({
    id: i.id,
    produtoNome: i.produtoNome,
    quantidade: i.quantidade,
    retiradoQtd: i.retiradoQtd,
    restante: Math.max(i.quantidade - i.retiradoQtd, 0),
  }))
}

/**
 * Passo 1 — lê o vale e devolve o que **falta** entregar, sem gravar nada.
 *
 * O operador precisa ver nome e itens antes de soltar a sacola: um "ok" verde
 * sozinho entregaria pedido trocado sem ninguém perceber, e a mercadoria sai da
 * mão para nunca mais voltar.
 */
export async function lerValeVendaBar(payloadBruto: string): Promise<ResultadoValeBar> {
  const { tenant } = await assertAnyPermission([PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE])

  const r = await carregarVale(payloadBruto, tenant.id)
  if (!r.ok) return r

  return {
    ok: true,
    vendaId: r.venda.id,
    comprador: nomeComprador(r.venda),
    total: typeof r.venda.total === 'number' ? r.venda.total : r.venda.total.toNumber(),
    itens: mapearItens(r.venda),
  }
}

/** Passo 2 — entrega o que o operador confirmou (tudo, ou parte). */
export async function confirmarRetiradaVendaBar(
  input: unknown,
): Promise<ResultadoRetiradaBar> {
  const { session, tenant } = await assertAnyPermission([
    PERMISSIONS.BAR_OPERATE,
    PERMISSIONS.BAR_MANAGE,
  ])

  const parsed = RetiradaParcialSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
  }

  const r = await carregarVale(parsed.data.payload, tenant.id)
  if (!r.ok) return r
  const venda = r.venda

  // Sem quantidades explícitas, entrega tudo o que falta — o caso comum.
  const pedidas = parsed.data.quantidades ?? {}
  const aEntregar = venda.itens.map((i) => {
    const restante = Math.max(i.quantidade - i.retiradoQtd, 0)
    const pedido = pedidas[i.id]
    const qtd = pedido === undefined ? restante : Math.min(Math.max(pedido, 0), restante)
    return { item: i, qtd }
  })

  const total = aEntregar.reduce((acc, e) => acc + e.qtd, 0)
  if (total === 0) return { ok: false, error: 'Nada a entregar nesta leitura.' }

  const completo = aEntregar.every((e) => e.item.retiradoQtd + e.qtd >= e.item.quantidade)

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const { item, qtd } of aEntregar) {
      if (qtd <= 0) continue
      await tx.barVendaItem.update({
        where: { id: item.id },
        data: { retiradoQtd: { increment: qtd } },
      })
    }
    if (completo) {
      await tx.barVenda.update({
        where: { id: venda.id },
        data: { retiradoEm: new Date(), retiradoPorId: session.user.id },
      })
    }
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'BAR_RETIRADA_ANTECIPADA',
      entidade: 'BarVenda',
      entidadeId: venda.id,
      detalhes: {
        completo,
        entregue: aEntregar
          .filter((e) => e.qtd > 0)
          .map((e) => `${e.item.produtoNome} ×${e.qtd}`),
      },
    },
  })

  revalidatePath('/admin/bar')
  revalidatePath('/portal/bar')

  const atualizada: VendaVale = {
    ...venda,
    itens: venda.itens.map((i) => {
      const e = aEntregar.find((x) => x.item.id === i.id)
      return { ...i, retiradoQtd: i.retiradoQtd + (e?.qtd ?? 0) }
    }),
  }

  return {
    ok: true,
    comprador: nomeComprador(venda),
    entregue: aEntregar
      .filter((e) => e.qtd > 0)
      .map((e) => `${e.item.produtoNome} ×${e.qtd}`)
      .join(', '),
    completo,
    restante: mapearItens(atualizada).filter((i) => i.restante > 0),
  }
}
