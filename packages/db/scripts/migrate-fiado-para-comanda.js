/**
 * Migra BarFiado → BarComanda (+ BarComandaPagamento nos quitados).
 * Idempotente: pula se já existe comanda MIGR-<fiado.id> ou venda.comandaId setado.
 * NÃO cria FinanceiroLancamento novo — quitados herdam o id existente.
 *
 *   pnpm --filter @torcida/db db:migrate-fiado-comanda
 *   node scripts/migrate-fiado-para-comanda.js
 *
 * Ver docs/data/modulo-bar-comanda.md §9.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

/** @param {string} status */
function statusComandaDeFiado(status) {
  switch (status) {
    case 'PENDENTE':
      return 'FECHADA_COM_DEBITO'
    case 'VENCIDA':
      return 'VENCIDA'
    case 'PAGA':
      return 'QUITADA'
    case 'CANCELADA':
      return 'CANCELADA'
    default:
      throw new Error(`Status de fiado desconhecido: ${status}`)
  }
}

async function main() {
  console.log('🔄 Migrando BarFiado → BarComanda...')

  const fiados = await db.barFiado.findMany({
    include: {
      user: { select: { id: true, nome: true } },
      membro: { select: { id: true, nome: true } },
      venda: {
        select: {
          id: true,
          comandaId: true,
          operadorId: true,
          turnoId: true,
          status: true,
        },
      },
      criadoPor: { select: { id: true } },
    },
    orderBy: { criadoEm: 'asc' },
  })

  let criados = 0
  let pulados = 0
  let pagamentos = 0
  let erros = 0

  for (const fiado of fiados) {
    const codigo = `MIGR-${fiado.id}`

    if (fiado.venda.comandaId) {
      pulados += 1
      continue
    }

    const existente = await db.barComanda.findFirst({
      where: {
        tenantId: fiado.tenantId,
        sedeId: fiado.sedeId,
        codigo,
      },
      select: { id: true },
    })
    if (existente) {
      // Comanda já criada mas venda sem vínculo — só amarra e segue.
      if (!fiado.venda.comandaId) {
        await db.barVenda.update({
          where: { id: fiado.vendaId },
          data: {
            comandaId: existente.id,
            status: 'EM_COMANDA',
            financeiroLancamentoId: null,
          },
        })
      }
      pulados += 1
      continue
    }

    const titularNome =
      (fiado.membro?.nome && String(fiado.membro.nome).trim()) ||
      (fiado.user?.nome && String(fiado.user.nome).trim()) ||
      'Membro migrado'

    const abertaPorId = fiado.criadoPorId || fiado.venda.operadorId
    if (!abertaPorId) {
      console.error(`❌ Fiado ${fiado.id}: sem abertaPorId (criadoPor/operador) — pulando`)
      erros += 1
      continue
    }

    const statusComanda = statusComandaDeFiado(fiado.status)
    const totalPago =
      fiado.status === 'PAGA' ? fiado.valor : 0
    const fechadaEm =
      fiado.status === 'PAGA'
        ? fiado.pagoEm ?? fiado.criadoEm
        : fiado.status === 'CANCELADA'
          ? fiado.criadoEm
          : fiado.criadoEm
    const vencimento =
      statusComanda === 'FECHADA_COM_DEBITO' || statusComanda === 'VENCIDA'
        ? fiado.vencimento
        : null

    try {
      await db.$transaction(async (tx) => {
        const comanda = await tx.barComanda.create({
          data: {
            tenantId: fiado.tenantId,
            sedeId: fiado.sedeId,
            codigo,
            titularUserId: fiado.userId,
            titularMembroId: fiado.membroId,
            titularNome,
            tipo: 'MEMBRO',
            status: statusComanda,
            limite: null,
            total: fiado.valor,
            totalPago,
            desconto: 0,
            turnoAberturaId: fiado.venda.turnoId,
            turnoFechamentoId: fiado.venda.turnoId,
            abertaEm: fiado.criadoEm,
            abertaPorId,
            fechadaEm,
            fechadaPorId: abertaPorId,
            vencimento,
            pagoEm: fiado.status === 'PAGA' ? fiado.pagoEm : null,
            canceladaEm: fiado.status === 'CANCELADA' ? fiado.criadoEm : null,
            motivoCancelamento:
              fiado.status === 'CANCELADA' ? 'Migrado de fiado cancelado' : null,
            observacao: `Migrado de BarFiado ${fiado.id}`,
          },
        })

        await tx.barVenda.update({
          where: { id: fiado.vendaId },
          data: {
            comandaId: comanda.id,
            status: 'EM_COMANDA',
            // Receita passa a viver no pagamento da comanda (quitados) ou
            // ainda não existe (débito aberto). Nunca no lançamento EM_COMANDA.
            financeiroLancamentoId: null,
          },
        })

        if (fiado.status === 'PAGA' && fiado.financeiroLancamentoId) {
          const metodo =
            fiado.metodoPagamentoQuitacao ?? 'DINHEIRO'
          await tx.barComandaPagamento.create({
            data: {
              comandaId: comanda.id,
              metodoPagamento: metodo,
              valor: fiado.valor,
              recebidoEm: fiado.pagoEm ?? fiado.criadoEm,
              turnoId: fiado.venda.turnoId,
              operadorId: abertaPorId,
              pagoEm: fiado.pagoEm ?? fiado.criadoEm,
              status: 'CONFIRMADO',
              financeiroLancamentoId: fiado.financeiroLancamentoId,
            },
          })
          pagamentos += 1
        } else if (fiado.status === 'PAGA' && !fiado.financeiroLancamentoId) {
          console.warn(
            `⚠️  Fiado PAGA ${fiado.id} sem financeiroLancamentoId — comanda QUITADA sem pagamento`,
          )
        }
      })
      criados += 1
    } catch (e) {
      console.error(`❌ Fiado ${fiado.id}:`, e instanceof Error ? e.message : e)
      erros += 1
    }
  }

  const totalComandasMigr = await db.barComanda.count({
    where: { codigo: { startsWith: 'MIGR-' } },
  })
  const totalFiados = fiados.length

  // Reparo idempotente: lançamento EM_COMANDA nunca carrega receita.
  const reparoFin = await db.barVenda.updateMany({
    where: { status: 'EM_COMANDA', financeiroLancamentoId: { not: null } },
    data: { financeiroLancamentoId: null },
  })
  if (reparoFin.count > 0) {
    console.log(`   Reparo: ${reparoFin.count} venda(s) EM_COMANDA com finId limpo`)
  }

  console.log('── Resumo ──')
  console.log(`   Fiados lidos:           ${totalFiados}`)
  console.log(`   Comandas criadas agora: ${criados}`)
  console.log(`   Pulados (já migrados):  ${pulados}`)
  console.log(`   Pagamentos criados:     ${pagamentos}`)
  console.log(`   Erros:                  ${erros}`)
  console.log(`   Comandas MIGR-* total:  ${totalComandasMigr}`)

  if (erros > 0) process.exitCode = 1
  else console.log('✅ Migração fiado → comanda concluída.')
}

main()
  .catch((e) => {
    console.error('❌ Erro na migração:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
