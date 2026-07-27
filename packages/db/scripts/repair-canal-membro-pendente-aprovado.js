/**
 * Promove `MembroConversa` PENDENTE → ATIVO em canais oficiais quando o
 * usuário já é `SaasMembro` APROVADO do tenant (ou da unidade do canal).
 *
 * Cenário: sócio pediu entrada no canal fechado (status PENDENTE) e depois
 * foi aprovado / vinculação automática rodou sem promover o status
 * (`vincularMembroCanaisAposAprovacao` só limpava `saiuEm`). Resultado:
 * inbox mostra o canal, composer liberado, POST /mensagens 400
 * "Aprove ou recuse a solicitação…".
 *
 *   node scripts/repair-canal-membro-pendente-aprovado.js
 *   node scripts/repair-canal-membro-pendente-aprovado.js --dry-run
 */
import { db } from '../src/index.js'

const dryRun = process.argv.includes('--dry-run')

const pendentes = await db.membroConversa.findMany({
  where: {
    status: 'PENDENTE',
    saiuEm: null,
    conversa: { tipo: 'CANAL', canalOficial: true },
  },
  select: {
    id: true,
    userId: true,
    conversaId: true,
    conversa: {
      select: {
        tenantId: true,
        nome: true,
        sedeCanal: { select: { id: true, tipo: true } },
      },
    },
  },
})

let promovidos = 0
let ignorados = 0

for (const row of pendentes) {
  const membro = await db.saasMembro.findFirst({
    where: {
      userId: row.userId,
      tenantId: row.conversa.tenantId,
      status: 'APROVADO',
    },
    select: { sedeId: true },
  })

  if (!membro) {
    ignorados++
    continue
  }

  // Canal de unidade Caso A: só promove se o sócio é daquela sede (ou sem sede
  // ainda — herda o mural principal; sedes SEDE sempre liberam).
  const sedeCanal = row.conversa.sedeCanal
  const unidadeCasoA =
    sedeCanal && (sedeCanal.tipo === 'SUBSEDE' || sedeCanal.tipo === 'PONTO_ENCONTRO')
      ? sedeCanal
      : null
  if (unidadeCasoA && membro.sedeId && membro.sedeId !== unidadeCasoA.id) {
    ignorados++
    continue
  }

  if (dryRun) {
    console.log(
      `[dry-run] promover ${row.userId} em "${row.conversa.nome ?? row.conversaId}"`,
    )
  } else {
    await db.membroConversa.update({
      where: { id: row.id },
      data: { status: 'ATIVO' },
    })
    console.log(`Promovido ${row.userId} em "${row.conversa.nome ?? row.conversaId}"`)
  }
  promovidos++
}

console.log(
  `\n${dryRun ? '[dry-run] ' : ''}${promovidos} promovido(s); ${ignorados} ignorado(s) (sem sócio APROVADO / sede distinta). ${pendentes.length} PENDENTE(s) em canal oficial.`,
)
process.exit(0)
