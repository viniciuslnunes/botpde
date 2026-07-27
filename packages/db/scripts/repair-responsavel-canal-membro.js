/**
 * Vincula retroativamente o responsável (liderança) de cada Sede/Subsede/PDE
 * ao canal oficial da unidade como ADMIN.
 *
 * `criarSede`/`editarSede` (apps/web/src/app/admin/sedes/actions.ts) sempre
 * puderam gravar `Sede.responsavelUserId` sem nunca adicionar esse usuário
 * como `MembroConversa` do `Sede.canalConversaId` — o auto-vínculo de canais
 * só rodava em `aprovarMembro` (entrada como sócio), não na atribuição de
 * liderança. Corrigido em 2026-07-24 (vincularResponsavelAoCanalDaSede).
 * Este script repara unidades já criadas antes da correção.
 *
 *   node scripts/repair-responsavel-canal-membro.js
 */
import { db } from '../src/index.js'

const sedes = await db.sede.findMany({
  where: { responsavelUserId: { not: null }, canalConversaId: { not: null } },
  select: { id: true, nome: true, responsavelUserId: true, canalConversaId: true },
})

let vinculados = 0

for (const s of sedes) {
  const membro = await db.membroConversa.findUnique({
    where: { conversaId_userId: { conversaId: s.canalConversaId, userId: s.responsavelUserId } },
  })
  if (membro && membro.papel === 'ADMIN' && !membro.saiuEm) continue

  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId: s.canalConversaId, userId: s.responsavelUserId } },
    create: {
      conversaId: s.canalConversaId,
      userId: s.responsavelUserId,
      papel: 'ADMIN',
      status: 'ATIVO',
    },
    // Pedido de entrada prévio deixa status PENDENTE — promover ao vincular.
    update: { papel: 'ADMIN', saiuEm: null, status: 'ATIVO' },
  })

  console.log(`Vinculado responsável ${s.responsavelUserId} ao canal da unidade "${s.nome}" (${s.id})`)
  vinculados++
}

console.log(`\n${vinculados} responsável(is) vinculado(s) de ${sedes.length} unidade(s) verificada(s).`)
process.exit(0)
