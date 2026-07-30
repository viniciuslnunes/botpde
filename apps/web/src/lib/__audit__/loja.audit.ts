/**
 * Auditoria de LOJA — cupom, estoque e o ciclo do pedido.
 *
 * A rodada 2 cobriu o caminho feliz (sacola → cupom → checkout) e o bloqueio
 * cross-tenant. Aqui entram as bordas, que é onde loja quebra de verdade:
 *
 *   A. Cupom — expirado, de primeira compra para quem já comprou, e cupom
 *      de outra torcida.
 *   B. Estoque — recusa sem escrita parcial, e **concorrência**: dois
 *      checkouts simultâneos na última unidade. O decremento é um
 *      read-modify-write sobre coluna JSON (`estoque[chave] - qtd`); sob
 *      READ COMMITTED, duas transações leem o mesmo valor e a segunda
 *      sobrescreve a primeira. Se vender duas vezes a última peça, o achado
 *      é de dinheiro, não de UX.
 *   C. Pedido — escopo de tenant na mudança de status, e restauração de
 *      estoque no cancelamento.
 *   D. Seguir — rivalidade também vale para a rede social (contraste com a
 *      mensageria, já auditada na rodada 6).
 *
 * **Não auditado porque não existe**: limite de uso por cupom e valor mínimo
 * de pedido não estão no modelo (`SaasCupom` só tem `ativo`, `validoAte`,
 * `primeiraCompra`). É lacuna de produto, não defeito.
 *
 * ⚠️ **Este arquivo MUTA o banco.** Reversão registrada antes de cada mutação;
 * fixtures levam `[AUDIT-LOJA]`.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:loja
 */
import { afterAll, beforeAll, describe, it, vi } from 'vitest'
import { criarAjudantes, criarColetor, tentativa } from './_harness'

// ── Sessão simulada ──────────────────────────────────────────────────────
let sessaoAtual: { user: { id: string; email: string; name: string } } | null = null

vi.mock('next/cache', () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidateTag: () => {},
  revalidatePath: () => {},
  unstable_noStore: () => {},
}))
vi.mock('next/headers', () => ({
  headers: async () => new Map(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock('@/lib/auth', () => ({
  auth: async () => sessaoAtual,
  signIn: async () => {},
  signOut: async () => {},
  handlers: {},
}))

const MARCA = '[AUDIT-LOJA]'

const { achados, erro, alerta, ok, aoDesfazer, encerrar } = criarColetor()

type Db = typeof import('@torcida/db').db
let db: Db
let comoUsuario: ReturnType<typeof criarAjudantes>['comoUsuario']
let atorComPermissao: ReturnType<typeof criarAjudantes>['atorComPermissao']
let membrosAprovados: ReturnType<typeof criarAjudantes>['membrosAprovados']

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
  ;({ comoUsuario, atorComPermissao, membrosAprovados } = criarAjudantes(
    db,
    (s) => {
      sessaoAtual = s
    },
    () => sessaoAtual,
  ))
})

afterAll(async () => {
  await encerrar('AUDITORIA DE LOJA (cupom, estoque, pedido)', 'auditoria-loja.txt')
})

// ── Contexto ─────────────────────────────────────────────────────────────

type ContextoLoja = { tenantId: string; slug: string }

/**
 * Tenant com catálogo de loja ativo.
 *
 * `NOT contains MARCA` não é detalhe: as fixtures desta auditoria vivem até o
 * `afterAll`, e sem o filtro uma delas podia ganhar o `orderBy` e mudar o
 * tenant escolhido no meio da execução — duas rodadas seguidas davam
 * contagens diferentes. Mesma classe do Achado 9.
 */
async function contextoLoja(): Promise<ContextoLoja | null> {
  const produto: { tenantId: string } | null = await db.saasProduto.findFirst({
    where: { ativo: true, nome: { not: { contains: MARCA } } },
    select: { tenantId: true },
    orderBy: { id: 'asc' },
  })
  if (!produto) return null
  const tenant: { id: string; slug: string } | null = await db.tenant.findUnique({
    where: { id: produto.tenantId },
    select: { id: true, slug: true },
  })
  return tenant ? { tenantId: tenant.id, slug: tenant.slug } : null
}

/** Produto de auditoria com estoque controlado, e sua reversão. */
async function criarProdutoFixture(
  tenantId: string,
  estoque: Record<string, number>,
  preco = 50,
): Promise<{ id: string }> {
  const categoria: { id: string } | null = await db.saasCategoria.findFirst({
    where: { tenantId },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  const produto: { id: string } = await db.saasProduto.create({
    data: {
      tenantId,
      nome: `${MARCA} produto de auditoria`,
      descricao: 'Fixture da auditoria de loja — não é item real.',
      preco,
      estoque,
      tamanhos: Object.keys(estoque).filter((k) => k !== 'UN'),
      ativo: true,
      ...(categoria ? { categoriaId: categoria.id } : {}),
    },
    select: { id: true },
  })
  aoDesfazer(`remover produto fixture ${produto.id}`, async () => {
    await db.saasCarrinhoItem.deleteMany({ where: { produtoId: produto.id } })
    await db.saasPedidoItem.deleteMany({ where: { produtoId: produto.id } })
    await db.saasProduto.deleteMany({ where: { id: produto.id } })
  })
  return produto
}

/** Limpa a sacola do usuário e devolve ao estado anterior no fim. */
async function comSacolaLimpa(userId: string): Promise<void> {
  const antes: { produtoId: string; tamanho: string; quantidade: number; tenantId: string }[] =
    await db.saasCarrinhoItem.findMany({
      where: { userId },
      select: { produtoId: true, tamanho: true, quantidade: true, tenantId: true },
    })
  aoDesfazer(`restaurar sacola de ${userId}`, async () => {
    await db.saasCarrinhoItem.deleteMany({ where: { userId } })
    for (const i of antes) {
      await db.saasCarrinhoItem
        .create({
          data: {
            userId,
            produtoId: i.produtoId,
            tamanho: i.tamanho,
            quantidade: i.quantidade,
            tenantId: i.tenantId,
          },
        })
        .catch(() => {})
    }
  })
  await db.saasCarrinhoItem.deleteMany({ where: { userId } })
}

function formCheckout(cupom?: string): FormData {
  const f = new FormData()
  f.set('modalidadeEntrega', 'RETIRADA')
  if (cupom) f.set('cupomCodigo', cupom)
  return f
}

/** Remove pedidos criados pela auditoria (por grupo de itens do fixture). */
function limparPedidosDoProduto(produtoId: string): void {
  aoDesfazer(`remover pedidos do produto fixture ${produtoId}`, async () => {
    const itens: { pedidoId: string }[] = await db.saasPedidoItem.findMany({
      where: { produtoId },
      select: { pedidoId: true },
    })
    const ids = [...new Set(itens.map((i) => i.pedidoId))]
    if (ids.length === 0) return
    await db.saasPedidoItem.deleteMany({ where: { pedidoId: { in: ids } } })
    await db.saasPedido.deleteMany({ where: { id: { in: ids } } })
  })
}

// ═════════════════════════════════════════════════════════════════════════
// A. CUPOM — as bordas
// ═════════════════════════════════════════════════════════════════════════

describe('cupom: expirado, primeira compra e de outra torcida', () => {
  it('cupom vencido é recusado no checkout', async () => {
    const AREA = 'loja/cupom'
    const ctx = await contextoLoja()
    if (!ctx) {
      alerta(AREA, 'Nenhum tenant com catálogo ativo — cupom não exercitado')
      return
    }
    const [comprador] = await membrosAprovados(ctx.tenantId, 1, { tipo: 'SOCIO' })
    if (!comprador) {
      alerta(AREA, `Sem membro aprovado em ${ctx.slug} — cupom não exercitado`)
      return
    }

    const cupom: { id: string; codigo: string } = await db.saasCupom.create({
      data: {
        tenantId: ctx.tenantId,
        codigo: 'AUDITVENCIDO',
        tipo: 'PERCENTUAL',
        valor: 10,
        ativo: true,
        validoAte: new Date(Date.now() - 24 * 3600_000),
      },
      select: { id: true, codigo: true },
    })
    aoDesfazer(`remover cupom vencido ${cupom.id}`, async () => {
      await db.saasCupom.deleteMany({ where: { id: cupom.id } })
    })

    const produto = await criarProdutoFixture(ctx.tenantId, { UN: 5 })
    limparPedidosDoProduto(produto.id)
    await comSacolaLimpa(comprador)
    await db.saasCarrinhoItem.create({
      data: { userId: comprador, produtoId: produto.id, tamanho: 'UN', quantidade: 1, tenantId: ctx.tenantId },
    })

    const { finalizarPedido } = await import('@/app/portal/loja/actions')
    const r = await comoUsuario(comprador, () =>
      tentativa(() => finalizarPedido({}, formCheckout(cupom.codigo))),
    )
    if (r.ok) {
      erro(AREA, 'Checkout aceitou cupom VENCIDO — desconto concedido fora da validade')
    } else if (/expirado/i.test(r.erro)) {
      ok(AREA, `Cupom vencido recusado no checkout: "${r.erro}"`)
    } else {
      alerta(AREA, `Checkout com cupom vencido falhou por outro motivo: "${r.erro}"`)
    }

    const pedidos: number = await db.saasPedidoItem.count({ where: { produtoId: produto.id } })
    if (pedidos === 0) ok(AREA, 'Recusa por cupom não deixou pedido pela metade')
    else erro(AREA, `Recusa por cupom gravou ${pedidos} item(ns) de pedido — escrita parcial`)
  })

  it('cupom de primeira compra é recusado para quem já comprou', async () => {
    const AREA = 'loja/cupom'
    const ctx = await contextoLoja()
    if (!ctx) return

    // Comprador com histórico: o `primeiraCompra` só faz sentido nele.
    const jaComprou: { userId: string } | null = await db.saasPedido.findFirst({
      where: { tenantId: ctx.tenantId, status: { not: 'CANCELADO' } },
      select: { userId: true },
      orderBy: { id: 'asc' },
    })
    if (!jaComprou) {
      alerta(AREA, `Sem comprador com pedido anterior em ${ctx.slug} — regra de primeira compra não exercitada`)
      return
    }

    const cupom: { id: string; codigo: string } = await db.saasCupom.create({
      data: {
        tenantId: ctx.tenantId,
        codigo: 'AUDITPRIMEIRA',
        tipo: 'PERCENTUAL',
        valor: 15,
        ativo: true,
        primeiraCompra: true,
      },
      select: { id: true, codigo: true },
    })
    aoDesfazer(`remover cupom de primeira compra ${cupom.id}`, async () => {
      await db.saasCupom.deleteMany({ where: { id: cupom.id } })
    })

    const produto = await criarProdutoFixture(ctx.tenantId, { UN: 5 })
    limparPedidosDoProduto(produto.id)
    await comSacolaLimpa(jaComprou.userId)
    await db.saasCarrinhoItem.create({
      data: {
        userId: jaComprou.userId,
        produtoId: produto.id,
        tamanho: 'UN',
        quantidade: 1,
        tenantId: ctx.tenantId,
      },
    })

    const { finalizarPedido } = await import('@/app/portal/loja/actions')
    const r = await comoUsuario(jaComprou.userId, () =>
      tentativa(() => finalizarPedido({}, formCheckout(cupom.codigo))),
    )
    if (r.ok) {
      erro(AREA, 'Cupom de PRIMEIRA COMPRA foi aceito de quem já tem pedido anterior')
    } else if (/primeira compra/i.test(r.erro)) {
      ok(AREA, `Cupom de primeira compra recusado para comprador recorrente: "${r.erro}"`)
    } else {
      alerta(AREA, `Falhou por outro motivo: "${r.erro}"`)
    }
  })

  it('cupom de outra torcida não vale na loja desta', async () => {
    const AREA = 'loja/cupom'
    const ctx = await contextoLoja()
    if (!ctx) return

    const outroTenant: { id: string; slug: string } | null = await db.tenant.findFirst({
      where: { id: { not: ctx.tenantId }, produtos: { some: { ativo: true } } },
      select: { id: true, slug: true },
      orderBy: { id: 'asc' },
    })
    if (!outroTenant) {
      alerta(AREA, 'Sem segundo tenant com catálogo — cupom cross-tenant não exercitado')
      return
    }

    const cupomAlheio: { id: string; codigo: string } = await db.saasCupom.create({
      data: {
        tenantId: outroTenant.id,
        codigo: 'AUDITALHEIO',
        tipo: 'FIXO',
        valor: 20,
        ativo: true,
      },
      select: { id: true, codigo: true },
    })
    aoDesfazer(`remover cupom alheio ${cupomAlheio.id}`, async () => {
      await db.saasCupom.deleteMany({ where: { id: cupomAlheio.id } })
    })

    const [comprador] = await membrosAprovados(ctx.tenantId, 1, { tipo: 'SOCIO' })
    if (!comprador) return
    const produto = await criarProdutoFixture(ctx.tenantId, { UN: 5 })
    limparPedidosDoProduto(produto.id)
    await comSacolaLimpa(comprador)
    await db.saasCarrinhoItem.create({
      data: { userId: comprador, produtoId: produto.id, tamanho: 'UN', quantidade: 1, tenantId: ctx.tenantId },
    })

    const { finalizarPedido } = await import('@/app/portal/loja/actions')
    const r = await comoUsuario(comprador, () =>
      tentativa(() => finalizarPedido({}, formCheckout(cupomAlheio.codigo))),
    )
    if (r.ok) {
      erro(
        AREA,
        `Cupom de ${outroTenant.slug} foi aceito na loja de ${ctx.slug} — desconto atravessa a fronteira de tenant`,
      )
    } else if (/inválido/i.test(r.erro)) {
      ok(AREA, `Cupom de outra torcida recusado: "${r.erro}"`)
    } else {
      alerta(AREA, `Falhou por outro motivo: "${r.erro}"`)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// B. ESTOQUE — recusa limpa e concorrência
// ═════════════════════════════════════════════════════════════════════════

describe('estoque: recusa sem resíduo e a última unidade sob concorrência', () => {
  it('estoque insuficiente recusa o checkout inteiro, sem escrita parcial', async () => {
    const AREA = 'loja/estoque'
    const ctx = await contextoLoja()
    if (!ctx) return
    const [comprador] = await membrosAprovados(ctx.tenantId, 1, { tipo: 'SOCIO' })
    if (!comprador) return

    // Dois itens: um com estoque, outro sem. O checkout é por tenant, então a
    // recusa do segundo tem de desfazer o decremento do primeiro.
    const comEstoque = await criarProdutoFixture(ctx.tenantId, { UN: 10 })
    const semEstoque = await criarProdutoFixture(ctx.tenantId, { UN: 1 })
    limparPedidosDoProduto(comEstoque.id)
    limparPedidosDoProduto(semEstoque.id)

    // Fura o estoque por baixo: a sacola valida na inclusão, o checkout revalida.
    await db.saasProduto.update({ where: { id: semEstoque.id }, data: { estoque: { UN: 0 } } })

    await comSacolaLimpa(comprador)
    await db.saasCarrinhoItem.createMany({
      data: [
        { userId: comprador, produtoId: comEstoque.id, tamanho: 'UN', quantidade: 2, tenantId: ctx.tenantId },
        { userId: comprador, produtoId: semEstoque.id, tamanho: 'UN', quantidade: 1, tenantId: ctx.tenantId },
      ],
    })

    const { finalizarPedido } = await import('@/app/portal/loja/actions')
    const r = await comoUsuario(comprador, () => tentativa(() => finalizarPedido({}, formCheckout())))

    if (r.ok) {
      erro(AREA, 'Checkout concluiu com item sem estoque — venda de produto indisponível')
      return
    }
    if (/estoque insuficiente/i.test(r.erro)) {
      ok(AREA, `Checkout recusado por estoque insuficiente: "${r.erro}"`)
    } else {
      alerta(AREA, `Checkout falhou por outro motivo: "${r.erro}"`)
    }

    const estoqueDepois: { estoque: unknown } | null = await db.saasProduto.findUnique({
      where: { id: comEstoque.id },
      select: { estoque: true },
    })
    const restante = (estoqueDepois?.estoque as Record<string, number>)?.UN
    if (restante === 10) {
      ok(AREA, 'Recusa desfez o decremento do item que TINHA estoque (transação íntegra)')
    } else {
      erro(
        AREA,
        `ESCRITA PARCIAL: item com estoque foi decrementado (10 → ${restante}) numa compra que falhou`,
      )
    }

    const pedidos: number = await db.saasPedidoItem.count({
      where: { produtoId: { in: [comEstoque.id, semEstoque.id] } },
    })
    if (pedidos === 0) ok(AREA, 'Nenhum pedido gravado na recusa')
    else erro(AREA, `Recusa deixou ${pedidos} item(ns) de pedido gravados`)

    const sacola: number = await db.saasCarrinhoItem.count({ where: { userId: comprador } })
    if (sacola === 2) ok(AREA, 'Sacola preservada após a recusa (o comprador não perde o que montou)')
    else alerta(AREA, `Sacola ficou com ${sacola} item(ns) após a recusa (esperado 2)`)
  })

  it('dois compradores disputam a última unidade ao mesmo tempo', async () => {
    const AREA = 'loja/concorrencia'
    const ctx = await contextoLoja()
    if (!ctx) return
    const dois = await membrosAprovados(ctx.tenantId, 2, { tipo: 'SOCIO' })
    if (dois.length < 2) {
      alerta(AREA, `Menos de 2 compradores em ${ctx.slug} — concorrência não exercitada`)
      return
    }
    const [a, b] = dois

    const produto = await criarProdutoFixture(ctx.tenantId, { UN: 1 })
    limparPedidosDoProduto(produto.id)

    await comSacolaLimpa(a)
    await comSacolaLimpa(b)
    await db.saasCarrinhoItem.createMany({
      data: [
        { userId: a, produtoId: produto.id, tamanho: 'UN', quantidade: 1, tenantId: ctx.tenantId },
        { userId: b, produtoId: produto.id, tamanho: 'UN', quantidade: 1, tenantId: ctx.tenantId },
      ],
    })

    const { finalizarPedido } = await import('@/app/portal/loja/actions')

    // Disparo simultâneo: é o que a loja real vê num lançamento de camisa.
    const [rA, rB] = await Promise.all([
      comoUsuario(a, () => tentativa(() => finalizarPedido({}, formCheckout()))),
      comoUsuario(b, () => tentativa(() => finalizarPedido({}, formCheckout()))),
    ])

    const sucessos = [rA, rB].filter((r) => r.ok).length
    const motivosPerda = [rA, rB].filter((r) => !r.ok).map((r) => (r as { erro: string }).erro)

    // Sem isto, "1 checkout concluído" é ambíguo: pode ser a disputa resolvida
    // certo, ou o segundo comprador nem ter sido elegível. A primeira execução
    // desta auditoria caiu exatamente nessa armadilha (comprador TORCEDOR não
    // tem vínculo de loja e falhava com "produto não disponível").
    const perdeuPorEstoque = motivosPerda.some((m) => /estoque insuficiente/i.test(m))
    const perdeuPorElegibilidade = motivosPerda.some((m) => /não está mais disponível|não encontrado/i.test(m))
    if (perdeuPorElegibilidade) {
      alerta(
        AREA,
        `Concorrência NÃO exercitada: um dos compradores foi barrado por elegibilidade, não pela disputa (${motivosPerda.join(' | ')})`,
      )
      return
    }
    if (sucessos === 2) {
      // cai no ramo de oversell abaixo
    } else if (!perdeuPorEstoque && motivosPerda.length > 0) {
      alerta(AREA, `Perdedor da disputa falhou por outro motivo: "${motivosPerda.join(' | ')}"`)
    }
    const itensVendidos: { quantidade: number }[] = await db.saasPedidoItem.findMany({
      where: { produtoId: produto.id },
      select: { quantidade: true },
    })
    const totalVendido = itensVendidos.reduce((s, i) => s + i.quantidade, 0)
    const depois: { estoque: unknown } | null = await db.saasProduto.findUnique({
      where: { id: produto.id },
      select: { estoque: true },
    })
    const restante = (depois?.estoque as Record<string, number>)?.UN

    if (totalVendido > 1 || restante < 0) {
      erro(
        AREA,
        `OVERSELL: 1 unidade em estoque, ${sucessos} checkout(s) concluído(s), ${totalVendido} unidade(s) vendida(s), estoque final ${restante}. ` +
          'O decremento é read-modify-write sobre a coluna JSON `estoque` (`{...estoque, [chave]: disponivel - qtd}`) dentro de uma interactive transaction: sob READ COMMITTED as duas transações leem o mesmo valor e a segunda sobrescreve a primeira. Não há trava de linha nem checagem condicional. A torcida vende duas vezes a mesma peça.',
      )
    } else if (totalVendido === 1 && restante === 0) {
      ok(
        AREA,
        `Disputa real pela última unidade resolvida sem oversell: 1 comprador concluiu, o outro recebeu "${motivosPerda[0] ?? '—'}"; 1 vendida, estoque 0`,
      )
    } else {
      alerta(
        AREA,
        `Resultado inconclusivo da concorrência: ${sucessos} sucesso(s), ${totalVendido} vendida(s), estoque ${restante}`,
      )
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// C. PEDIDO — escopo e cancelamento
// ═════════════════════════════════════════════════════════════════════════

describe('pedido: escopo de tenant e devolução de estoque no cancelamento', () => {
  it('admin não muda status de pedido de outra torcida; cancelar devolve o estoque', async () => {
    const AREA = 'loja/pedido'
    const { PERMISSIONS } = await import('@torcida/types')
    const ctx = await contextoLoja()
    if (!ctx) return

    const gestor = await atorComPermissao(ctx.tenantId, PERMISSIONS.STORE_MANAGE)
    if (!gestor) {
      alerta(AREA, `Ninguém com store:manage e tenant ativo ${ctx.slug} — ciclo do pedido não exercitado`)
      return
    }

    // Pedido de OUTRA torcida: o escopo tem de estar na query.
    const alheio: { id: string; tenantId: string } | null = await db.saasPedido.findFirst({
      where: { tenantId: { not: ctx.tenantId } },
      select: { id: true, tenantId: true },
      orderBy: { id: 'asc' },
    })
    const { atualizarStatusPedido } = await import('@/app/admin/loja/actions')
    if (alheio) {
      const f = new FormData()
      f.set('status', 'CANCELADO')
      const r = await comoUsuario(gestor, () => tentativa(() => atualizarStatusPedido(alheio.id, {}, f)))
      if (r.ok) {
        erro(AREA, 'Gestor mudou o status de pedido de OUTRA torcida — escopo de tenant furado')
      } else if (/não encontrado/i.test(r.erro)) {
        ok(AREA, `Pedido de outra torcida invisível para o gestor: "${r.erro}"`)
      } else {
        alerta(AREA, `Falhou por outro motivo: "${r.erro}"`)
      }
    }

    // Cancelamento devolve estoque: monta um pedido próprio pelo fluxo real.
    const [comprador] = await membrosAprovados(ctx.tenantId, 1, { tipo: 'SOCIO' })
    if (!comprador) return
    const produto = await criarProdutoFixture(ctx.tenantId, { UN: 4 })
    limparPedidosDoProduto(produto.id)
    await comSacolaLimpa(comprador)
    await db.saasCarrinhoItem.create({
      data: { userId: comprador, produtoId: produto.id, tamanho: 'UN', quantidade: 2, tenantId: ctx.tenantId },
    })

    const { finalizarPedido } = await import('@/app/portal/loja/actions')
    const rCompra = await comoUsuario(comprador, () =>
      tentativa(() => finalizarPedido({}, formCheckout())),
    )
    if (!rCompra.ok) {
      alerta(AREA, `Compra de apoio falhou: "${rCompra.erro}" — cancelamento não exercitado`)
      return
    }

    const aposCompra: { estoque: unknown } | null = await db.saasProduto.findUnique({
      where: { id: produto.id },
      select: { estoque: true },
    })
    const restanteAposCompra = (aposCompra?.estoque as Record<string, number>)?.UN
    if (restanteAposCompra === 2) ok(AREA, 'Compra decrementou o estoque (4 → 2)')
    else erro(AREA, `Estoque após compra inesperado: ${restanteAposCompra} (esperado 2)`)

    const item: { pedidoId: string } | null = await db.saasPedidoItem.findFirst({
      where: { produtoId: produto.id },
      select: { pedidoId: true },
    })
    if (!item) {
      erro(AREA, 'Compra concluída mas sem item de pedido gravado')
      return
    }

    const f = new FormData()
    f.set('status', 'CANCELADO')
    const rCancel = await comoUsuario(gestor, () =>
      tentativa(() => atualizarStatusPedido(item.pedidoId, {}, f)),
    )
    if (!rCancel.ok) {
      erro(AREA, `Cancelamento do pedido recusado: "${rCancel.erro}"`)
      return
    }

    const aposCancelar: { estoque: unknown } | null = await db.saasProduto.findUnique({
      where: { id: produto.id },
      select: { estoque: true },
    })
    const restanteFinal = (aposCancelar?.estoque as Record<string, number>)?.UN
    if (restanteFinal === 4) {
      ok(AREA, 'Cancelar o pedido devolveu as unidades ao estoque (2 → 4)')
    } else {
      erro(
        AREA,
        `Cancelamento NÃO devolveu o estoque (ficou ${restanteFinal}, esperado 4) — peça sai do catálogo sem ter sido vendida`,
      )
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// D. SEGUIR — a rivalidade vale também na rede social
// ═════════════════════════════════════════════════════════════════════════

describe('seguir: rivalidade e perfil privado', () => {
  it('sócio não segue sócio de torcida rival', async () => {
    const AREA = 'social/rivalidade'
    const { canFollowUser } = await import('@/lib/social')

    const par = async (slug: string) => {
      const t: { id: string } | null = await db.tenant.findFirst({
        where: { slug },
        select: { id: true },
      })
      if (!t) return null
      const m: { userId: string } | null = await db.saasMembro.findFirst({
        where: {
          tenantId: t.id,
          status: 'APROVADO',
          tipo: 'SOCIO',
          espelhado: false,
          desligadoEm: null,
        },
        select: { userId: true },
        orderBy: { id: 'asc' },
      })
      return m ? { tenantId: t.id, userId: m.userId } : null
    }

    const a = await par('camisa-12-corinthians')
    const b = await par('mancha-alviverde')
    if (!a || !b) {
      alerta(AREA, 'Sem par de sócios rivais — seguimento entre rivais não exercitado')
      return
    }

    const [aSegueB, bSegueA] = await Promise.all([
      canFollowUser(a.userId, b.userId, a.tenantId),
      canFollowUser(b.userId, a.userId, b.tenantId),
    ])
    if (!aSegueB && !bSegueA) {
      ok(AREA, 'Sócios de torcidas rivais não podem se seguir em nenhum sentido — a segregação vale também na rede social')
    } else {
      erro(
        AREA,
        `Seguimento entre sócios rivais permitido (a→b ${aSegueB}, b→a ${bSegueA}) — a mensageria bloqueia (rodada 6) mas a rede social não, e seguir dá acesso a conteúdo`,
      )
    }
  })

  it('perfil privado exige aprovação para ser seguido', async () => {
    const AREA = 'social/privado'
    const { solicitarSeguir } = await import('@/app/portal/comunidade/actions')

    type PerfilLite = { userId: string; tenantId: string }
    const privados: PerfilLite[] = await db.perfilMembro.findMany({
      where: { perfilPrivado: true },
      select: { userId: true, tenantId: true },
      orderBy: { id: 'asc' },
      take: 10,
    })
    if (privados.length === 0) {
      alerta(AREA, 'Nenhum perfil privado no banco — regra de aprovação não exercitada')
      return
    }

    const { getActiveTenant } = await import('@/lib/tenant')
    for (const alvo of privados) {
      const candidatos = await membrosAprovados(alvo.tenantId, 8, { excluir: [alvo.userId] })
      let seguidor: string | null = null
      for (const c of candidatos) {
        const u: { email: string } | null = await db.user.findUnique({
          where: { id: c },
          select: { email: true },
        })
        const ativo = await getActiveTenant(c, u?.email ?? null)
        if (ativo?.id !== alvo.tenantId) continue
        const jaExiste: { id: string } | null = await db.seguimento.findFirst({
          where: { seguidorId: c, seguidoId: alvo.userId },
          select: { id: true },
        })
        if (jaExiste) continue
        seguidor = c
        break
      }
      if (!seguidor) continue

      aoDesfazer(`remover seguimento ${seguidor} → ${alvo.userId}`, async () => {
        await db.seguimento.deleteMany({ where: { seguidorId: seguidor, seguidoId: alvo.userId } })
        await db.notificacao.deleteMany({
          where: { atorId: seguidor, userId: alvo.userId, tipo: 'SEGUIMENTO_PENDENTE' },
        })
      })

      const r = await comoUsuario(seguidor, () => tentativa(() => solicitarSeguir(alvo.userId)))
      if (!r.ok) {
        alerta(AREA, `Solicitação de seguir falhou: "${r.erro}" — regra do perfil privado não exercitada`)
        return
      }

      const seguimento: { status: string } | null = await db.seguimento.findFirst({
        where: { seguidorId: seguidor, seguidoId: alvo.userId },
        select: { status: true },
      })
      if (seguimento?.status === 'PENDENTE') {
        ok(AREA, 'Seguir perfil PRIVADO cria solicitação PENDENTE em vez de aprovar direto')
      } else if (seguimento?.status === 'APROVADO') {
        erro(
          AREA,
          'Perfil PRIVADO foi seguido sem aprovação — a privacidade do perfil não segura no servidor',
        )
      } else {
        alerta(AREA, `Seguimento ficou com status inesperado: ${seguimento?.status ?? 'nenhum'}`)
      }
      return
    }
    alerta(AREA, 'Nenhum par viável (perfil privado + seguidor sem seguimento prévio) — regra não exercitada')
  })
})

describe('sanidade', () => {
  it('a auditoria produziu achados', () => {
    if (achados.length === 0) throw new Error('Nenhuma checagem rodou — auditoria inconclusiva')
  })
})
