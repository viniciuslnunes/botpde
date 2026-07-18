/**
 * Smoke do PDV Bar — fluxo PIX mock (sem UI / sem NextAuth).
 *
 * Uso:
 *   node --env-file=apps/web/.env.local --env-file=packages/db/.env scripts/smoke-bar-pix.mjs
 *
 * Cria produto + venda PENDENTE, assina webhook mock, confirma pagamento,
 * valida RECEITA BAR e limpa os registros de smoke.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(__dirname, '../packages/db/package.json'))
const { PrismaClient } = require('@prisma/client')

const SLUG = process.argv[2] ?? 'pde-gavioes-fiel'
const db = new PrismaClient()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function criarPixMock({ referencia, tenantSlug, valor }) {
  const externalId = `mock_${referencia}`
  const valorStr = Number(valor).toFixed(2)
  const copiaCola = [
    '00020126',
    `BR.GOV.BCB.PIX0114${tenantSlug.slice(0, 14).padEnd(14, '0')}`,
    `52040000530398654${String(valorStr.length).padStart(2, '0')}${valorStr}`,
    `5802BR5913TORCIDA SAAS6009SAO PAULO62`,
    `05${String(referencia.length).padStart(2, '0')}${referencia}`,
    '6304MOCK',
  ].join('')
  return { provider: 'mock', externalId, copiaCola }
}

function assinarWebhookMockBar(vendaId, secret) {
  return createHmac('sha256', secret).update(`pix-mock-bar:${vendaId}`).digest('hex')
}

function verificarWebhookMockBar(vendaId, signature, secret) {
  const expected = assinarWebhookMockBar(vendaId, secret)
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(signature, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

async function confirmarVendaBarPaga({ tenantId, vendaId, atorId }) {
  const venda = await db.barVenda.findFirst({
    where: { id: vendaId, tenantId },
    select: {
      id: true,
      status: true,
      total: true,
      financeiroLancamentoId: true,
      operadorId: true,
    },
  })
  assert(venda, 'Venda não encontrada')
  if (venda.status === 'PAGA') return { ok: true, idempotent: true }
  assert(venda.status !== 'CANCELADA', 'Venda cancelada')

  await db.$transaction(async (tx) => {
    let lancamentoId = venda.financeiroLancamentoId
    if (!lancamentoId) {
      const lanc = await tx.financeiroLancamento.create({
        data: {
          tenantId,
          tipo: 'RECEITA',
          categoria: 'BAR',
          valor: venda.total,
          descricao: 'Venda do bar',
          data: new Date(),
          observacao: `Pagamento PIX — venda ${venda.id} (smoke)`,
          criadoPorId: atorId ?? venda.operadorId,
        },
        select: { id: true },
      })
      lancamentoId = lanc.id
    }
    await tx.barVenda.update({
      where: { id: venda.id },
      data: {
        status: 'PAGA',
        pagoEm: new Date(),
        financeiroLancamentoId: lancamentoId,
      },
    })
  })
  return { ok: true, idempotent: false }
}

async function main() {
  const secret = process.env.AUTH_SECRET
  assert(secret, 'AUTH_SECRET ausente (carregue apps/web/.env.local)')

  const tenant = await db.tenant.findFirst({
    where: { slug: SLUG },
    select: { id: true, slug: true, balancoFinanceiroVisivel: true },
  })
  assert(tenant, `Tenant ${SLUG} não encontrado`)

  const owner = await db.userRole.findFirst({
    where: { tenantId: tenant.id, role: { isSystem: true, nome: 'owner' } },
    select: { userId: true },
  })
  assert(owner?.userId, 'Owner do tenant não encontrado')

  const sede = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE', ativa: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true },
  })
  assert(sede, 'Nenhuma SEDE ativa')

  const marker = `smoke-bar-pix-${Date.now()}`
  let produtoId = null
  let vendaId = null
  let lancamentoId = null

  console.log('— smoke Bar PIX mock —')
  console.log(`tenant: ${tenant.slug} (${tenant.id})`)
  console.log(`unidade: ${sede.nome} (${sede.id})`)
  console.log(`balancoFinanceiroVisivel: ${tenant.balancoFinanceiroVisivel}`)

  try {
    const produto = await db.barProduto.create({
      data: {
        tenantId: tenant.id,
        sedeId: sede.id,
        nome: marker,
        preco: 12.5,
        custoMedio: 4,
        estoque: 10,
        ativo: true,
        destaque: false,
        ordem: 0,
        criadoPorId: owner.userId,
      },
      select: { id: true, estoque: true, preco: true },
    })
    produtoId = produto.id
    console.log(`produto criado: ${produtoId} (estoque ${produto.estoque})`)

    const qtd = 2
    const total = 25
    const venda = await db.$transaction(async (tx) => {
      const v = await tx.barVenda.create({
        data: {
          tenantId: tenant.id,
          sedeId: sede.id,
          operadorId: owner.userId,
          subtotal: total,
          desconto: 0,
          total,
          metodoPagamento: 'PIX',
          status: 'PENDENTE',
          observacao: marker,
          itens: {
            create: [
              {
                produtoId: produto.id,
                produtoNome: marker,
                precoUnit: 12.5,
                custoUnit: 4,
                quantidade: qtd,
                total,
              },
            ],
          },
        },
        select: { id: true },
      })
      await tx.barProduto.update({
        where: { id: produto.id },
        data: { estoque: { decrement: qtd } },
      })
      await tx.barMovimentacaoEstoque.create({
        data: {
          tenantId: tenant.id,
          sedeId: sede.id,
          produtoId: produto.id,
          tipo: 'SAIDA',
          quantidade: qtd,
          vendaId: v.id,
          operadorId: owner.userId,
          motivo: marker,
        },
      })
      return v
    })
    vendaId = venda.id

    const pix = criarPixMock({
      referencia: vendaId,
      tenantSlug: tenant.slug,
      valor: total,
    })
    await db.barVenda.update({
      where: { id: vendaId },
      data: {
        gatewayProvider: pix.provider,
        gatewayExternalId: pix.externalId,
        pixCopiaCola: pix.copiaCola,
      },
    })
    console.log(`venda PENDENTE: ${vendaId}`)
    console.log(`pix.provider=${pix.provider} externalId=${pix.externalId}`)
    console.log(`pix.copiaCola length=${pix.copiaCola.length}`)

    const estoqueApos = await db.barProduto.findUnique({
      where: { id: produtoId },
      select: { estoque: true },
    })
    assert(estoqueApos?.estoque === 8, `estoque esperado 8, got ${estoqueApos?.estoque}`)

    const signature = assinarWebhookMockBar(vendaId, secret)
    assert(verificarWebhookMockBar(vendaId, signature, secret), 'assinatura mock inválida')
    console.log('assinatura webhook mock: ok')

    const conf = await confirmarVendaBarPaga({
      tenantId: tenant.id,
      vendaId,
      atorId: owner.userId,
    })
    assert(conf.ok, 'confirmação falhou')

    const conf2 = await confirmarVendaBarPaga({
      tenantId: tenant.id,
      vendaId,
      atorId: owner.userId,
    })
    assert(conf2.idempotent === true, 'segunda confirmação deveria ser idempotente')

    const paga = await db.barVenda.findUnique({
      where: { id: vendaId },
      select: {
        status: true,
        pagoEm: true,
        financeiroLancamentoId: true,
        gatewayProvider: true,
      },
    })
    assert(paga?.status === 'PAGA', `status esperado PAGA, got ${paga?.status}`)
    assert(paga.pagoEm, 'pagoEm ausente')
    assert(paga.financeiroLancamentoId, 'financeiroLancamentoId ausente')
    lancamentoId = paga.financeiroLancamentoId

    const lanc = await db.financeiroLancamento.findUnique({
      where: { id: lancamentoId },
      select: { tipo: true, categoria: true, valor: true, descricao: true },
    })
    assert(lanc?.tipo === 'RECEITA', 'lançamento não é RECEITA')
    assert(lanc?.categoria === 'BAR', 'categoria não é BAR')
    assert(Number(lanc.valor) === total, `valor esperado ${total}, got ${lanc.valor}`)

    // Estoque NÃO sobe na confirmação PIX (já baixou no registro).
    const estoqueFinal = await db.barProduto.findUnique({
      where: { id: produtoId },
      select: { estoque: true },
    })
    assert(estoqueFinal?.estoque === 8, `estoque pós-PIX deveria permanecer 8, got ${estoqueFinal?.estoque}`)

    console.log('confirmação PIX: PAGA + RECEITA BAR + estoque estável')
    console.log('SMOKE OK')
  } finally {
    // Limpeza (ordem: mov → itens/venda → produto → lançamento)
    if (vendaId) {
      await db.barMovimentacaoEstoque.deleteMany({ where: { vendaId } })
      await db.barVendaItem.deleteMany({ where: { vendaId } })
      await db.barVenda.deleteMany({ where: { id: vendaId } })
    }
    if (produtoId) {
      await db.barMovimentacaoEstoque.deleteMany({ where: { produtoId } })
      await db.barProduto.deleteMany({ where: { id: produtoId } })
    }
    if (lancamentoId) {
      await db.financeiroLancamento.deleteMany({ where: { id: lancamentoId } })
    }
    // fallback por marker
    await db.barProduto.deleteMany({ where: { tenantId: tenant.id, nome: marker } })
    console.log('cleanup: ok')
  }
}

main()
  .catch((e) => {
    console.error('SMOKE FAIL', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
