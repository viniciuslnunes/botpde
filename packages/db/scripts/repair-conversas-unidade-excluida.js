/**
 * Remove CANAL/GRUPO órfãos deixados por exclusão de Subsede/PDE.
 *
 * Antes de 2026-08-03, `excluirSede` só apagava a Sede e (no Caso B)
 * desativava o tenant — canais oficiais e grupos continuavam na inbox via
 * `MembroConversa`. A action agora chama `apagarConversasAoExcluirUnidade`;
 * este script limpa o legado.
 *
 * Critérios:
 *  1. CANAL/GRUPO cujo tenant está `ativo: false`
 *  2. CANAL oficial sem ponteiro em Sede/Departamento/DepartamentoArea
 *
 *   node scripts/repair-conversas-unidade-excluida.js           # dry-run
 *   node scripts/repair-conversas-unidade-excluida.js --apply
 */
import { db } from '../src/index.js'

const apply = process.argv.includes('--apply')

const porTenantInativo = await db.conversa.findMany({
  where: {
    tipo: { in: ['CANAL', 'GRUPO'] },
    tenant: { ativo: false },
  },
  select: { id: true, tipo: true, nome: true, tenantId: true, canalOficial: true },
})

const apontadosSede = await db.sede.findMany({
  where: { canalConversaId: { not: null } },
  select: { canalConversaId: true },
})
const apontadosDepto = await db.departamento.findMany({
  where: { canalConversaId: { not: null } },
  select: { canalConversaId: true },
})
const apontadosArea = await db.departamentoArea.findMany({
  where: { canalConversaId: { not: null } },
  select: { canalConversaId: true },
})
const aindaApontados = new Set(
  [...apontadosSede, ...apontadosDepto, ...apontadosArea]
    .map((r) => r.canalConversaId)
    .filter(Boolean),
)

const oficiaisOrfaos = await db.conversa.findMany({
  where: {
    tipo: 'CANAL',
    canalOficial: true,
    id: { notIn: [...aindaApontados] },
  },
  select: { id: true, tipo: true, nome: true, tenantId: true, canalOficial: true },
})

const porId = new Map()
for (const c of [...porTenantInativo, ...oficiaisOrfaos]) {
  porId.set(c.id, c)
}
const alvos = [...porId.values()]

console.log(
  `${apply ? 'APPLY' : 'DRY-RUN'}: ${alvos.length} conversa(s) órfã(s)` +
    ` (${porTenantInativo.length} em tenant inativo, ${oficiaisOrfaos.length} canal oficial sem ponteiro)`,
)

for (const c of alvos) {
  console.log(`  · [${c.tipo}${c.canalOficial ? '/oficial' : ''}] ${c.nome ?? '(sem nome)'} (${c.id})`)
}

if (!apply) {
  console.log('\nRode com --apply para apagar.')
  await db.$disconnect()
  process.exit(0)
}

if (alvos.length === 0) {
  await db.$disconnect()
  process.exit(0)
}

const ids = alvos.map((c) => c.id)
await db.$transaction(async (tx) => {
  await tx.saasPedidoTicket.deleteMany({ where: { conversaId: { in: ids } } })
  await tx.sede.updateMany({
    where: { canalConversaId: { in: ids } },
    data: { canalConversaId: null },
  })
  await tx.departamento.updateMany({
    where: { canalConversaId: { in: ids } },
    data: { canalConversaId: null },
  })
  await tx.departamentoArea.updateMany({
    where: { canalConversaId: { in: ids } },
    data: { canalConversaId: null },
  })
  const result = await tx.conversa.deleteMany({ where: { id: { in: ids } } })
  console.log(`\nRemovidas: ${result.count}`)
})

await db.$disconnect()
