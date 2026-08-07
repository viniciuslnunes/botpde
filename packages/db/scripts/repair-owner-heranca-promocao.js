/**
 * Tira o owner **herdado** de portais de unidade (Caso B).
 *
 * Até 2026-08-06 `promoverSedeParaTenant` tinha um fallback: unidade sem
 * `responsavelUserId` (ou com liderança que não era `SaasMembro` APROVADO na
 * mãe) fazia o **owner do tenant mãe** virar owner do portal novo. Como quem
 * provisiona a torcida costuma ser o super-admin, ele acabou dono de portais de
 * subsede/PDE que nunca foram dele. O fallback foi removido; este script limpa
 * o passivo.
 *
 * Critério de "herdado" — as três condições juntas:
 *   1. o tenant é portal de unidade (Sede com `sedeId` apontando para uma Sede
 *      de OUTRO tenant — a mãe);
 *   2. o mesmo usuário é owner do tenant mãe;
 *   3. ele NÃO é a liderança vinculada da unidade (`Sede.responsavelUserId`).
 *
 * O portal fica **sem presidente** — estado suportado: o super-admin volta a
 * operar as configs reservadas até `transferirLideranca` definir o presidente
 * de verdade (`/super-admin/liderancas` ou a aba Presidência do admin).
 * `SaasMembro`, carteirinha e canais não são tocados: só o cargo sai.
 *
 *   node scripts/repair-owner-heranca-promocao.js            # simulação
 *   node scripts/repair-owner-heranca-promocao.js --apply    # aplica
 */
import { db } from '../src/index.js'

const aplicar = process.argv.includes('--apply')

/** Unidades com portal próprio: Sede cujo pai vive em outro tenant. */
const unidades = await db.sede.findMany({
  where: { sedeId: { not: null }, tenantId: { not: null } },
  select: {
    id: true,
    nome: true,
    tenantId: true,
    responsavelUserId: true,
    sede: { select: { tenantId: true } },
    tenant: { select: { nome: true } },
  },
})

const casosB = unidades.filter(
  (u) => u.sede?.tenantId && u.tenantId && u.sede.tenantId !== u.tenantId,
)

let removidos = 0

for (const unidade of casosB) {
  const tenantMaeId = unidade.sede.tenantId

  const ownersDoPortal = await db.userRole.findMany({
    where: { tenantId: unidade.tenantId, role: { isSystem: true, nome: 'owner' } },
    select: { id: true, userId: true, user: { select: { nome: true, email: true } } },
  })

  for (const owner of ownersDoPortal) {
    // A liderança da própria unidade é owner legítimo — nunca sai.
    if (owner.userId === unidade.responsavelUserId) continue

    const ehOwnerDaMae = await db.userRole.findFirst({
      where: { tenantId: tenantMaeId, userId: owner.userId, role: { isSystem: true, nome: 'owner' } },
      select: { id: true },
    })
    if (!ehOwnerDaMae) continue

    console.log(
      `${aplicar ? 'Removendo' : '[simulação] removeria'}: ${owner.user.email ?? owner.user.nome} ` +
        `owner herdado de "${unidade.tenant?.nome ?? unidade.nome}" (${unidade.tenantId})`,
    )

    if (aplicar) {
      await db.userRole.delete({ where: { id: owner.id } })
      await db.auditLog.create({
        data: {
          tenantId: unidade.tenantId,
          atorId: owner.userId,
          acao: 'OWNER_REMOVIDO',
          entidade: 'Tenant',
          entidadeId: unidade.tenantId,
          detalhes: {
            motivo: 'owner herdado da torcida mãe na promoção (repair-owner-heranca-promocao)',
            tenantMaeId,
            sedeId: unidade.id,
            ownerRemovidoEmail: owner.user.email,
          },
        },
      })
    }
    removidos++
  }
}

console.log(
  `\n${removidos} owner(s) herdado(s) ${aplicar ? 'removido(s)' : 'encontrado(s)'} ` +
    `em ${casosB.length} portal(is) de unidade.`,
)
if (!aplicar && removidos > 0) {
  console.log('Rode de novo com --apply para aplicar.')
}
process.exit(0)
