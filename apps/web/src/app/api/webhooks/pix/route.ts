import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { confirmarVendaBarPaga } from '@/lib/bar'
import {
  confirmarPagamentoComandaBar,
  resolverPagamentoComandaBar,
} from '@/lib/bar-comanda'
import { baixarCobrancaComoPaga } from '@/lib/cobrancas'
import {
  getPixProvider,
  verificarWebhookMock,
  verificarWebhookMockBar,
  verificarWebhookMockComandaBar,
} from '@/lib/pix-gateway'

const mockSchema = z.object({
  cobrancaId: z.string().uuid(),
  signature: z.string().min(1),
})

const mockBarSchema = z.object({
  tipo: z.literal('bar'),
  vendaId: z.string().uuid(),
  signature: z.string().min(1),
})

const mockComandaSchema = z.object({
  tipo: z.literal('bar_comanda'),
  pagamentoId: z.string().uuid(),
  signature: z.string().min(1),
})

const mpSchema = z.object({
  action: z.string().optional(),
  type: z.string().optional(),
  data: z.object({ id: z.union([z.string(), z.number()]) }).optional(),
})

async function resolverCobrancaPorExternalId(externalId: string) {
  type Row = { id: string; tenantId: string; status: string }
  return db.cobrancaAssociacao.findFirst({
    where: { gatewayExternalId: externalId },
    select: { id: true, tenantId: true, status: true },
  }) as Promise<Row | null>
}

async function processarPagamento(cobrancaId: string, tenantId: string) {
  type CobLite = { criadoPorId: string | null; userId: string }
  const meta: CobLite | null = await db.cobrancaAssociacao.findFirst({
    where: { id: cobrancaId, tenantId },
    select: { criadoPorId: true, userId: true },
  })
  if (!meta) return { ok: false as const, error: 'Cobrança não encontrada' }

  let atorId = meta.criadoPorId
  if (!atorId) {
    const fallback: { userId: string } | null = await db.userRole.findFirst({
      where: { tenantId },
      select: { userId: true },
    })
    atorId = fallback?.userId ?? meta.userId
  }

  const result = await baixarCobrancaComoPaga({
    tenantId,
    cobrancaId,
    atorId,
    metodo: 'PIX',
  })
  if (!result.ok) return { ok: false as const, error: result.error }

  await db.auditLog.create({
    data: {
      tenantId,
      atorId: null,
      acao: 'COBRANCA_PIX_WEBHOOK',
      entidade: 'CobrancaAssociacao',
      entidadeId: cobrancaId,
    },
  })
  return { ok: true as const }
}

async function processarPagamentoBar(vendaId: string, tenantId: string) {
  // Ator do lançamento: quem gerou a cobrança não existe no webhook; usamos o
  // operador da venda como fallback dentro de `confirmarVendaBarPaga`.
  const result = await confirmarVendaBarPaga({ tenantId, vendaId, atorId: null })
  if (!result.ok) return { ok: false as const, error: result.error }

  await db.auditLog.create({
    data: {
      tenantId,
      atorId: null,
      acao: 'BAR_VENDA_PIX_WEBHOOK',
      entidade: 'BarVenda',
      entidadeId: vendaId,
    },
  })
  return { ok: true as const }
}

async function processarPagamentoComanda(pagamentoId: string, tenantId: string) {
  const result = await confirmarPagamentoComandaBar({
    tenantId,
    pagamentoId,
    atorId: null,
  })
  if (!result.ok) return { ok: false as const, error: result.error }

  await db.auditLog.create({
    data: {
      tenantId,
      atorId: null,
      acao: 'BAR_COMANDA_PAGAMENTO',
      entidade: 'BarComandaPagamento',
      entidadeId: pagamentoId,
      detalhes: { webhook: true, comandaId: result.comandaId },
    },
  })

  // Se o webhook completou o fechamento (último PIX), registra FECHADA.
  type St = { status: string }
  const apos: St | null = await db.barComanda.findFirst({
    where: { id: result.comandaId },
    select: { status: true },
  })
  if (apos?.status === 'FECHADA_PAGA') {
    await db.auditLog.create({
      data: {
        tenantId,
        atorId: null,
        acao: 'BAR_COMANDA_FECHADA',
        entidade: 'BarComanda',
        entidadeId: result.comandaId,
        detalhes: { via: 'pix_webhook' },
      },
    })
  }

  return { ok: true as const }
}

async function resolverVendaBar(ref: string): Promise<{ id: string; tenantId: string } | null> {
  type Row = { id: string; tenantId: string }
  const byId: Row | null = await db.barVenda.findFirst({
    where: { id: ref },
    select: { id: true, tenantId: true },
  })
  if (byId) return byId
  const byExt: Row | null = await db.barVenda.findFirst({
    where: { gatewayExternalId: ref },
    select: { id: true, tenantId: true },
  })
  return byExt
}

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null)
  if (!json) return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })

  const mockComandaParsed = mockComandaSchema.safeParse(json)
  if (mockComandaParsed.success) {
    const { pagamentoId, signature } = mockComandaParsed.data
    if (!verificarWebhookMockComandaBar(pagamentoId, signature)) {
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
    }

    const pag = await resolverPagamentoComandaBar(pagamentoId)
    if (!pag) return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 })

    const res = await processarPagamentoComanda(pag.id, pag.tenantId)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  const mockBarParsed = mockBarSchema.safeParse(json)
  if (mockBarParsed.success) {
    const { vendaId, signature } = mockBarParsed.data
    if (!verificarWebhookMockBar(vendaId, signature)) {
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
    }

    type Row = { id: string; tenantId: string }
    const venda: Row | null = await db.barVenda.findFirst({
      where: { id: vendaId },
      select: { id: true, tenantId: true },
    })
    if (!venda) return NextResponse.json({ error: 'Venda não encontrada' }, { status: 404 })

    const res = await processarPagamentoBar(venda.id, venda.tenantId)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  const mockParsed = mockSchema.safeParse(json)
  if (mockParsed.success) {
    const { cobrancaId, signature } = mockParsed.data
    if (!verificarWebhookMock(cobrancaId, signature)) {
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
    }

    type Row = { id: string; tenantId: string }
    const cob: Row | null = await db.cobrancaAssociacao.findFirst({
      where: { id: cobrancaId },
      select: { id: true, tenantId: true },
    })
    if (!cob) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 })

    const res = await processarPagamento(cob.id, cob.tenantId)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  const mpParsed = mpSchema.safeParse(json)
  if (mpParsed.success && getPixProvider() === 'mercadopago') {
    const { action, type, data } = mpParsed.data
    if (
      (action === 'payment.updated' || type === 'payment') &&
      data?.id
    ) {
      const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
      if (!token) {
        return NextResponse.json({ error: 'Mercado Pago não configurado' }, { status: 503 })
      }

      const paymentId = String(data.id)
      const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!payRes.ok) {
        return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 })
      }

      const payment = (await payRes.json()) as {
        status?: string
        external_reference?: string
        metadata?: {
          tipo?: string
          cobrancaId?: string
          vendaId?: string
          pagamentoId?: string
        }
      }

      if (payment.status !== 'approved') {
        return NextResponse.json({ ok: true, ignored: true })
      }

      if (payment.metadata?.tipo === 'bar_comanda') {
        const ref =
          payment.metadata?.pagamentoId ?? payment.external_reference ?? paymentId
        const pag = await resolverPagamentoComandaBar(ref)
        if (!pag) {
          return NextResponse.json({ error: 'Pagamento de comanda não mapeado' }, { status: 404 })
        }
        const res = await processarPagamentoComanda(pag.id, pag.tenantId)
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
        return NextResponse.json({ ok: true })
      }

      if (payment.metadata?.tipo === 'bar') {
        const ref =
          payment.metadata?.vendaId ?? payment.external_reference ?? paymentId
        const venda = await resolverVendaBar(ref)
        if (!venda) return NextResponse.json({ error: 'Venda não mapeada' }, { status: 404 })
        const res = await processarPagamentoBar(venda.id, venda.tenantId)
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
        return NextResponse.json({ ok: true })
      }

      const cobrancaId =
        payment.metadata?.cobrancaId ?? payment.external_reference ?? null
      if (!cobrancaId) {
        const byExt = await resolverCobrancaPorExternalId(paymentId)
        if (!byExt) return NextResponse.json({ error: 'Cobrança não mapeada' }, { status: 404 })
        const res = await processarPagamento(byExt.id, byExt.tenantId)
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
        return NextResponse.json({ ok: true })
      }

      type Row = { id: string; tenantId: string }
      const cob: Row | null = await db.cobrancaAssociacao.findFirst({
        where: { id: cobrancaId },
        select: { id: true, tenantId: true },
      })
      if (!cob) return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 })

      const res = await processarPagamento(cob.id, cob.tenantId)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      return NextResponse.json({ ok: true })
    }
  }

  return NextResponse.json({ error: 'Payload não reconhecido' }, { status: 400 })
}
