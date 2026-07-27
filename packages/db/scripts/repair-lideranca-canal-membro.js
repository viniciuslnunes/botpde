/**
 * Vincula retroativamente toda liderança (Role de sistema OWNER/ADMIN) ao
 * canal oficial da própria unidade.
 *
 * `salvarAcessoUsuario`/`salvarPerfilComposto` (apps/web/src/app/admin/acessos/actions.ts)
 * sempre puderam atribuir OWNER/ADMIN a um usuário sem nunca rodar o
 * auto-vínculo de canais — que só existia em `aprovarMembro`. Resultado:
 * liderança promovida por lá (em vez de aprovação de sócio) ficava fora do
 * canal oficial até pedir entrada manualmente. Corrigido em 2026-07-24
 * (chamada a `vincularMembroCanaisAposAprovacao` quando OWNER/ADMIN é
 * concedido). Este script repara atribuições já feitas antes da correção,
 * reimplementando a mesma regra sem depender de imports Next.js (`server-only`,
 * `next/cache`) usados pela versão de app em apps/web/src/lib/canais.ts.
 *
 *   node scripts/repair-lideranca-canal-membro.js
 */
import { db } from '../src/index.js'

const userRoles = await db.userRole.findMany({
  where: { role: { isSystem: true, nome: { in: ['owner', 'admin'] } } },
  select: { userId: true, tenantId: true },
})

const pares = new Map()
for (const ur of userRoles) {
  pares.set(`${ur.userId}:${ur.tenantId}`, ur)
}

let vinculados = 0
let semCanal = 0

for (const { userId, tenantId } of pares.values()) {
  const membro = await db.saasMembro.findFirst({
    where: { userId, tenantId },
    select: { sedeId: true },
  })

  const canalIds = new Set()

  if (membro?.sedeId) {
    const sedeUnidade = await db.sede.findFirst({
      where: { id: membro.sedeId, tenantId },
      select: { canalConversaId: true },
    })
    if (sedeUnidade?.canalConversaId) canalIds.add(sedeUnidade.canalConversaId)
  }

  const sedeRaiz = await db.sede.findFirst({
    where: { tenantId, tipo: 'SEDE', canalConversaId: { not: null } },
    select: { canalConversaId: true },
  })
  if (sedeRaiz?.canalConversaId) canalIds.add(sedeRaiz.canalConversaId)

  if (canalIds.size === 0) {
    semCanal++
    continue
  }

  for (const conversaId of canalIds) {
    await db.membroConversa.upsert({
      where: { conversaId_userId: { conversaId, userId } },
      create: { conversaId, userId, papel: 'MEMBRO', status: 'ATIVO' },
      // Pedido de entrada prévio deixa status PENDENTE — promover ao vincular.
      update: { saiuEm: null, status: 'ATIVO' },
    })
  }
  vinculados++
}

console.log(
  `\n${vinculados} liderança(s) vinculada(s) a canal existente; ${semCanal} sem canal oficial ainda provisionado (não bloqueante — ficará ok quando o canal for criado). ${pares.size} par(es) usuário-tenant verificados.`,
)
process.exit(0)
