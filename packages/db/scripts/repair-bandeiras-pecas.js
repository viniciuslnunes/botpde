/**
 * Bandeira não é lote: cada peça tem foto, vistoria e empréstimo próprios.
 * O seed antigo (e o form de patrimônio) gravava `quantidade: N` numa ficha
 * só — o KPI "No acervo" somava N e a grade mostrava 1 card.
 *
 * Idempotente: item já com quantidade 1 não mexe.
 *
 * Uso:
 *   pnpm --filter @torcida/db db:repair-bandeiras-pecas -- --dry-run
 *   pnpm --filter @torcida/db db:repair-bandeiras-pecas
 */
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { nomesPecasPatrimonio } from '../../types/src/patrimonio.js'

const db = new PrismaClient()

const dryRun = process.argv.includes('--dry-run')

async function main() {
  const lotes = await db.patrimonioItem.findMany({
    where: { categoria: 'BANDEIRA', quantidade: { gt: 1 } },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      quantidade: true,
      status: true,
      localizacao: true,
      valorEstimado: true,
      observacao: true,
      fotoUrl: true,
      meta: true,
      areaId: true,
      responsavelId: true,
      criadoPorId: true,
      tenant: { select: { slug: true } },
    },
  })

  if (lotes.length === 0) {
    console.log('Nenhum lote de bandeira (quantidade > 1).')
  }

  let pecasNovas = 0
  for (const lote of lotes) {
    const nomes = nomesPecasPatrimonio(lote.nome, lote.quantidade)
    const clones = nomes.slice(1)
    pecasNovas += clones.length
    console.log(
      `  ${lote.tenant.slug}: "${lote.nome}" qtd ${lote.quantidade} → ${nomes.length} peças`,
    )
    if (dryRun) continue

    if (clones.length > 0) {
      await db.patrimonioItem.createMany({
        data: clones.map((nome) => ({
          id: crypto.randomUUID(),
          tenantId: lote.tenantId,
          nome,
          categoria: 'BANDEIRA',
          status: lote.status === 'BAIXADO' ? 'BAIXADO' : 'DISPONIVEL',
          quantidade: 1,
          localizacao: lote.localizacao,
          valorEstimado: lote.valorEstimado,
          observacao: lote.observacao,
          fotoUrl: lote.fotoUrl,
          meta: lote.meta ?? undefined,
          areaId: lote.areaId,
          responsavelId: lote.responsavelId,
          criadoPorId: lote.criadoPorId,
        })),
      })
    }
    await db.patrimonioItem.update({
      where: { id: lote.id },
      data: { quantidade: 1, nome: nomes[0] },
    })
  }

  if (lotes.length > 0) {
    console.log(
      dryRun
        ? `Dry-run: ${lotes.length} lote(s) virariam ${pecasNovas} peça(s) extra.`
        : `Pronto: ${lotes.length} lote(s) viraram ${pecasNovas} peça(s) extra.`,
    )
  }

  // Lote baixado não pode "ressuscitar" nas cópias (passagem anterior
  // nascia DISPONIVEL). Irmãs de `Nome · 1` BAIXADO também baixam.
  const origensBaixadas = await db.patrimonioItem.findMany({
    where: { categoria: 'BANDEIRA', status: 'BAIXADO', nome: { endsWith: ' · 1' } },
    select: { id: true, tenantId: true, nome: true, tenant: { select: { slug: true } } },
  })
  let irmasBaixadas = 0
  for (const origem of origensBaixadas) {
    const base = origem.nome.replace(/\s·\s1$/, '')
    const where = {
      tenantId: origem.tenantId,
      categoria: 'BANDEIRA',
      id: { not: origem.id },
      nome: { startsWith: `${base} · ` },
      status: { not: 'BAIXADO' },
    }
    const n = await db.patrimonioItem.count({ where })
    if (n === 0) continue
    console.log(`  ${origem.tenant.slug}: baixar ${n} irmã(s) de "${origem.nome}"`)
    if (!dryRun) {
      const upd = await db.patrimonioItem.updateMany({
        where,
        data: { status: 'BAIXADO' },
      })
      irmasBaixadas += upd.count
    } else {
      irmasBaixadas += n
    }
  }
  if (irmasBaixadas > 0) {
    console.log(
      dryRun
        ? `Dry-run: ${irmasBaixadas} peça(s) nascidas de lote baixado voltariam a BAIXADO.`
        : `Corrigido: ${irmasBaixadas} peça(s) nascidas de lote baixado voltaram a BAIXADO.`,
    )
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
