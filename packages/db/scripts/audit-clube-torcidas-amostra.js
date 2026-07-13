/**
 * Amostra de validação clube × torcidas (rodar após audit:clube-torcidas).
 *   node scripts/audit-clube-torcidas-amostra.js
 */
import { PrismaClient } from '@prisma/client'
import { saoMesmoClube } from '../src/data/afiliacoes-normalize.js'
import { TORCIDAS_CONHECIDAS } from '../src/data/torcidas-conhecidas.js'

const db = new PrismaClient()

const AMOSTRA = [
  { clube: 'Sport Club Corinthians Paulista', uf: 'SP', esperadas: ['Gaviões', 'Camisa 12', 'Pavilhão'] },
  { clube: 'Clube de Regatas Flamengo', uf: 'RJ', esperadas: ['Raça', 'Jovem'] },
  { clube: 'Grêmio Foot-Ball Porto Alegrense', uf: 'RS', esperadas: ['Geral', 'Braço'] },
  { clube: 'São Paulo Futebol Clube', uf: 'SP', esperadas: ['Dragões', 'Independente'] },
]

async function main() {
  const afiliacoes = await db.afiliacao.findMany({
    select: { id: true, nome: true, estado: true, apelido: true },
  })

  console.log('Validação amostral clube ↔ torcidas\n')

  for (const { clube, uf, esperadas } of AMOSTRA) {
    const ref = { nome: clube, estado: uf }
    const grupo = afiliacoes.filter((a) => saoMesmoClube(ref, a))
    const ids = grupo.map((a) => a.id)

    const tenants = await db.tenant.findMany({
      where: { afiliacaoId: { in: ids }, ativo: true },
      select: {
        slug: true,
        torcidaConhecida: { select: { titulo: true, nome: true } },
      },
    })

    const titulos = tenants.map((t) => t.torcidaConhecida?.titulo ?? t.slug)
    const faltando = esperadas.filter(
      (e) => !titulos.some((t) => t.toLowerCase().includes(e.toLowerCase())),
    )

    const noDataset = TORCIDAS_CONHECIDAS.filter(
      (tc) =>
        tc.uf === uf &&
        saoMesmoClube({ nome: tc.clubeNomeOriginal ?? '', estado: tc.uf }, ref),
    ).length

    console.log(`${clube} (${uf})`)
    console.log(`  Afiliacao no grupo : ${grupo.length} (${grupo.map((a) => a.nome).join(' | ')})`)
    console.log(`  Dataset scraper    : ${noDataset} torcidas`)
    console.log(`  Tenants ativos     : ${tenants.length}`)
    console.log(`  Amostra títulos    : ${titulos.slice(0, 6).join(', ')}${titulos.length > 6 ? '…' : ''}`)
    if (faltando.length) console.log(`  ⚠ não achou substring: ${faltando.join(', ')}`)
    else console.log('  ✓ amostra esperada OK')
    console.log()
  }

  // Afiliacoes do diretório sem nenhuma torcida no catálogo
  const semCatalogo = await db.afiliacao.count({
    where: { torcidasConhecidas: { none: {} } },
  })
  const semTenant = await db.afiliacao.count({
    where: { tenants: { none: { ativo: true } } },
  })
  console.log(`Afiliacoes sem entrada no catálogo nacional: ${semCatalogo}`)
  console.log(`Afiliacoes sem tenant ativo: ${semTenant}`)
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
