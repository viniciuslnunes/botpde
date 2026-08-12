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
 *
 * **Tirar o cargo não bastava (2026-08-11).** Junto com o owner herdado, a
 * promoção criava para a mesma pessoa um `SaasMembro` APROVADO (com `sedeId` da
 * unidade) e um `MembroConversa` ADMIN no canal oficial. Removida a presidência
 * — pela UI ou por este script —, esses dois ficavam: o super-admin seguia
 * "sócio" de um portal que nunca foi dele e, pior, `resolverUnidadeDoVinculo`
 * elege a aba **Minha unidade** pelo `SaasMembro` mais recente da worktree, sem
 * olhar liderança. Resultado: a Comunidade abria no canal da subsede alheia.
 * Operar a plataforma não associa ninguém a uma torcida, então o vínculo
 * fabricado sai junto.
 *
 * Vínculo **fabricado** exige, além das três condições acima, a evidência
 * direta: o `AuditLog SEDE_PROMOVIDA_TENANT` daquela unidade registrou essa
 * pessoa em `detalhes.ownerUserId`. Sem isso o script não encosta — presidente
 * da Sede que também é sócio de verdade da subsede tem vínculo legítimo.
 * Carteirinha (`SaasSocio`) nunca é apagada: é identidade, e sai à mão se for
 * o caso — o script só reporta.
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
let vinculosRemovidos = 0
let carteirinhasReportadas = 0

/**
 * Quem a promoção gravou como owner do portal. É a evidência de que o vínculo
 * daquela pessoa no tenant novo foi fabricado pela herança, e não uma
 * associação real — o `SaasMembro` do owner nasce no mesmo `$transaction`.
 */
async function ownerRegistradoNaPromocao(sedeId) {
  const log = await db.auditLog.findFirst({
    where: { acao: 'SEDE_PROMOVIDA_TENANT', entidade: 'Sede', entidadeId: sedeId },
    orderBy: { criadoEm: 'desc' },
    select: { detalhes: true },
  })
  const valor = log?.detalhes?.ownerUserId
  return typeof valor === 'string' && valor ? valor : null
}

/** Tira o vínculo fabricado: SaasMembro do portal + presença nos canais dele. */
async function limparVinculoFabricado(unidade, usuario) {
  const membro = await db.saasMembro.findFirst({
    where: { tenantId: unidade.tenantId, userId: usuario.userId },
    select: { id: true, status: true },
  })

  const sedesDoPortal = await db.sede.findMany({
    where: { tenantId: unidade.tenantId, canalConversaId: { not: null } },
    select: { canalConversaId: true },
  })
  const canalIds = sedesDoPortal.map((s) => s.canalConversaId)
  const canais = canalIds.length
    ? await db.membroConversa.findMany({
        where: { userId: usuario.userId, conversaId: { in: canalIds } },
        select: { id: true },
      })
    : []

  if (!membro && canais.length === 0) return

  // Carteirinha é identidade: reporta e deixa a decisão com o operador.
  const socio = await db.saasSocio.findFirst({
    where: { tenantId: unidade.tenantId, userId: usuario.userId },
    select: { numeroSocio: true },
  })
  if (socio) {
    carteirinhasReportadas++
    console.log(
      `  ATENÇÃO: ${usuario.email} tem carteirinha #${socio.numeroSocio} em ` +
        `"${unidade.nome}" — não removida, avalie à mão.`,
    )
  }

  console.log(
    `  ${aplicar ? 'removendo' : '[simulação] removeria'} vínculo fabricado de ${usuario.email} ` +
      `em "${unidade.nome}": ${membro ? `SaasMembro ${membro.status}` : 'sem SaasMembro'}, ` +
      `${canais.length} canal(is)`,
  )

  if (aplicar) {
    if (canais.length > 0) {
      await db.membroConversa.deleteMany({ where: { id: { in: canais.map((c) => c.id) } } })
    }
    if (membro) await db.saasMembro.delete({ where: { id: membro.id } })
    await db.auditLog.create({
      data: {
        tenantId: unidade.tenantId,
        atorId: usuario.userId,
        acao: 'MEMBRO_REMOVIDO',
        entidade: 'SaasMembro',
        entidadeId: membro?.id ?? unidade.tenantId,
        detalhes: {
          motivo:
            'vínculo fabricado pela herança de owner na promoção (repair-owner-heranca-promocao)',
          email: usuario.email,
          sedeId: unidade.id,
          canaisRemovidos: canais.length,
          carteirinhaMantida: socio ? socio.numeroSocio : null,
        },
      },
    })
  }
  vinculosRemovidos++
}

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

  // Vínculo fabricado sobrevive à saída do cargo — inclusive quando a
  // presidência já foi removida à mão pela UI, caso em que o laço acima não
  // acha nada. Por isso a evidência vem do AuditLog da promoção, não do
  // `UserRole` que pode já ter sumido.
  const herdeiro = await ownerRegistradoNaPromocao(unidade.id)
  if (!herdeiro || herdeiro === unidade.responsavelUserId) continue

  const aindaEhOwnerDaMae = await db.userRole.findFirst({
    where: { tenantId: tenantMaeId, userId: herdeiro, role: { isSystem: true, nome: 'owner' } },
    select: { id: true },
  })
  if (!aindaEhOwnerDaMae) continue

  const user = await db.user.findUnique({
    where: { id: herdeiro },
    select: { email: true, nome: true },
  })
  await limparVinculoFabricado(unidade, {
    userId: herdeiro,
    email: user?.email ?? user?.nome ?? herdeiro,
  })
}

console.log(
  `\n${removidos} owner(s) herdado(s) ${aplicar ? 'removido(s)' : 'encontrado(s)'} e ` +
    `${vinculosRemovidos} vínculo(s) fabricado(s) ${aplicar ? 'removido(s)' : 'encontrado(s)'} ` +
    `em ${casosB.length} portal(is) de unidade.`,
)
if (carteirinhasReportadas > 0) {
  console.log(`${carteirinhasReportadas} carteirinha(s) mantida(s) — avalie à mão.`)
}
if (!aplicar && removidos + vinculosRemovidos > 0) {
  console.log('Rode de novo com --apply para aplicar.')
}
process.exit(0)
