/**
 * Repara os cargos de sistema (owner/admin/member) de todos os tenants.
 *
 * Contexto: até 2026-07-02, o wizard de criação de tenant
 * (apps/web/src/app/super-admin/setup/actions.ts) semeava esses cargos com
 * strings de permissão em português ("membros:ler", "sedes:editar"...),
 * divergentes do vocabulário canônico usado pela UI de cargos e por
 * packages/types/src/permissions.js ("members:view", "sedes:manage"...).
 * Esse desalinhamento foi corrigido no código, mas tenants já criados antes
 * disso ainda têm as permissões antigas gravadas no banco — este script
 * corrige os dados existentes para o valor canônico.
 *
 * Idempotente e seguro de rodar mais de uma vez.
 *
 * Uso:
 *   node scripts/repair-system-role-permissions.js           # aplica as correções
 *   node scripts/repair-system-role-permissions.js --dry-run # só mostra o que mudaria
 */

import { PrismaClient } from '@prisma/client'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '../../types/src/permissions.js'

const db = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

const SYSTEM_ROLE_DEFAULTS = {
  [SYSTEM_ROLES.OWNER]: { cor: '#7c3aed', ordem: 0 },
  [SYSTEM_ROLES.ADMIN]: { cor: '#2563eb', ordem: 1 },
  [SYSTEM_ROLES.MEMBER]: { cor: '#6b7280', ordem: 2 },
}

function sameSet(a, b) {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((v) => setB.has(v))
}

async function main() {
  console.log(dryRun ? '🔍 Dry-run — nenhuma alteração será gravada.\n' : '🔧 Reparando cargos de sistema...\n')

  const tenants = await db.tenant.findMany({ select: { id: true, slug: true, nome: true } })
  console.log(`Encontrados ${tenants.length} tenant(s).\n`)

  let corrigidos = 0
  let criados = 0
  let jaCorretos = 0

  for (const tenant of tenants) {
    for (const nomeRole of Object.values(SYSTEM_ROLES)) {
      const permissoesCanonicas = SYSTEM_ROLE_PERMISSIONS[nomeRole]

      const role = await db.role.findUnique({
        where: { tenantId_nome: { tenantId: tenant.id, nome: nomeRole } },
      })

      if (!role) {
        console.log(`  [criar] ${tenant.slug} — cargo '${nomeRole}' não existia`)
        criados++
        if (!dryRun) {
          await db.role.create({
            data: {
              tenantId: tenant.id,
              nome: nomeRole,
              isSystem: true,
              permissions: permissoesCanonicas,
              ...SYSTEM_ROLE_DEFAULTS[nomeRole],
            },
          })
        }
        continue
      }

      if (sameSet(role.permissions, permissoesCanonicas)) {
        jaCorretos++
        continue
      }

      console.log(`  [corrigir] ${tenant.slug} — cargo '${nomeRole}'`)
      console.log(`      antes:  [${role.permissions.join(', ')}]`)
      console.log(`      depois: [${permissoesCanonicas.join(', ')}]`)
      corrigidos++

      if (!dryRun) {
        await db.role.update({
          where: { id: role.id },
          data: { permissions: permissoesCanonicas },
        })
      }
    }
  }

  console.log(`\n${dryRun ? '📋 Resumo (dry-run)' : '✅ Resumo'}:`)
  console.log(`   ${corrigidos} cargo(s) corrigido(s)`)
  console.log(`   ${criados} cargo(s) criado(s) (faltavam)`)
  console.log(`   ${jaCorretos} cargo(s) já estavam corretos`)

  if (dryRun && (corrigidos > 0 || criados > 0)) {
    console.log('\n   Rode sem --dry-run para aplicar.')
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro ao reparar cargos:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
