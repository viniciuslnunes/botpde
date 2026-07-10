/**
 * Migra pedidos legados (1 produto por linha em saas_pedidos) para o modelo
 * header + itens (SaasPedidoItem). Rode uma vez após db:push se a tabela
 * ainda tiver colunas legadas produto_id / produto_nome.
 *
 *   node scripts/migrate-loja-pedidos-legacy.js
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function colunaExiste(tabela, coluna) {
  const rows = await db.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    tabela,
    coluna,
  )
  return Array.isArray(rows) && rows.length > 0
}

async function main() {
  const legado = await colunaExiste('saas_pedidos', 'produto_id')
  if (!legado) {
    console.log('✅ Nenhuma coluna legada em saas_pedidos — migração não necessária.')
    return
  }

  console.log('🔄 Migrando pedidos legados para SaasPedidoItem...')

  const pedidos = await db.$queryRawUnsafe(`
    SELECT id, tenant_id, user_id, produto_id, produto_nome, tamanho, quantidade,
           preco_unit, total, status, discord_id, canal_ticket_id, criado_em, atualizado_em
    FROM saas_pedidos
    WHERE produto_id IS NOT NULL
  `)

  for (const p of pedidos) {
    const itemExiste = await db.saasPedidoItem.findFirst({ where: { pedidoId: p.id } })
    if (itemExiste) continue

    await db.saasPedidoItem.create({
      data: {
        pedidoId: p.id,
        produtoId: p.produto_id,
        produtoNome: p.produto_nome,
        tamanho: p.tamanho,
        quantidade: p.quantidade,
        precoUnit: p.preco_unit,
        total: p.total,
      },
    })

    await db.$executeRawUnsafe(
      `UPDATE saas_pedidos SET subtotal = $1, desconto = 0, total = $1 WHERE id = $2`,
      p.total,
      p.id,
    )
  }

  console.log(`✅ ${pedidos.length} pedido(s) migrado(s). Remova colunas legadas com db:push.`)
}

main()
  .catch((e) => {
    console.error('❌ Erro na migração:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
