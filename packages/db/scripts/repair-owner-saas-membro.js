/**
 * Repara unidades promovidas a portal (Caso B) cujo owner tem UserRole mas
 * não tem SaasMembro/MembroConversa no tenant novo — sequela de
 * `promoverUnidadeAPortal` ter falhado no meio do caminho (bug corrigido em
 * 2026-07-20) ou de ter rodado antes do backfill de SaasMembro existir.
 * Sem SaasMembro, `resolveUserTenantSlugForUser` nunca resolve esse tenant
 * como "casa" pós-login e o owner nunca acessa o próprio /admin.
 *
 *   node scripts/repair-owner-saas-membro.js
 */
import { db } from '../src/index.js'

const owners = await db.userRole.findMany({
  where: { role: { nome: 'owner', isSystem: true } },
  select: {
    tenantId: true,
    userId: true,
    user: { select: { nome: true } },
    tenant: { select: { nome: true } },
  },
})

let reparados = 0

for (const o of owners) {
  const membro = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: o.tenantId, userId: o.userId } },
    select: { id: true },
  })
  if (membro) continue

  await db.saasMembro.create({
    data: {
      tenantId: o.tenantId,
      userId: o.userId,
      tipo: 'SOCIO',
      nome: o.user.nome ?? o.tenant.nome,
      status: 'APROVADO',
      aprovadoPorNome: 'Reparo automático (repair-owner-saas-membro)',
      aprovadoEm: new Date(),
    },
  })

  const sedesComCanal = await db.sede.findMany({
    where: { tenantId: o.tenantId, canalConversaId: { not: null } },
    select: { canalConversaId: true },
  })
  for (const s of sedesComCanal) {
    if (!s.canalConversaId) continue
    await db.membroConversa.upsert({
      where: { conversaId_userId: { conversaId: s.canalConversaId, userId: o.userId } },
      create: { conversaId: s.canalConversaId, userId: o.userId, papel: 'MEMBRO' },
      update: { saiuEm: null },
    })
  }

  console.log(`Reparado: ${o.user.nome} owner de "${o.tenant.nome}" (${o.tenantId})`)
  reparados++
}

console.log(`\n${reparados} owner(s) reparado(s) de ${owners.length} verificado(s).`)
process.exit(0)
