/**
 * Exclui um tenant criado por ERRO DE REGISTRO (torcida que nunca existiu como
 * torcida — tipicamente algo que deveria ter nascido subsede/PDE de outra).
 *
 *   pnpm --filter @torcida/db excluir:torcida-erro -- --slug=fiel-cubatao-cubatao
 *   pnpm --filter @torcida/db excluir:torcida-erro -- --slug=... --apply
 *
 * Dry-run por padrão: imprime o inventário completo e NÃO grava.
 *
 * Trava de segurança — recusa se:
 *   - o tenant estiver `ativo: true` (arquive antes: exclusão não é o caminho
 *     padrão de baixa, ver docs/data/modulo-super-admin.md);
 *   - algum membro ficaria SEM nenhuma torcida (perderia o acesso à plataforma);
 *   - o tenant tiver Sede própria ou for mãe de portal Caso B (tem estrutura
 *     real: não é erro de registro, é merge/rebaixamento — outro roteiro).
 *
 * O delete cascateia todo o resto (roles, departamentos, posts, conversas…) —
 * por isso o inventário é impresso e vai inteiro para o `AuditLog` de
 * plataforma (`tenantId: null`), que sobrevive à exclusão.
 *
 * REQUER DATABASE_URL — não roda no CI.
 */
import { randomUUID } from 'node:crypto'

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const slug = (process.argv.find((a) => a.startsWith('--slug=')) ?? '').split('=')[1]

/** Linhas por tabela que referenciam o tenant (catálogo do Postgres). */
async function inventariar(tenantId) {
  /** @type {{ table_name: string }[]} */
  const tabelas = await db.$queryRaw`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id'
    ORDER BY table_name
  `
  /** @type {Record<string, number>} */
  const out = {}
  for (const { table_name } of tabelas) {
    const [{ n }] = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM "${table_name}" WHERE tenant_id = $1`,
      tenantId,
    )
    if (n > 0) out[table_name] = n
  }
  return out
}

async function main() {
  if (!slug) {
    console.error('Uso: --slug=<slug-do-tenant> [--apply]')
    process.exit(1)
  }

  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true, nome: true, slug: true, ativo: true, criadoEm: true, afiliacaoId: true },
  })
  if (!tenant) {
    console.error(`Tenant "${slug}" não encontrado.`)
    process.exit(1)
  }

  console.log(`Tenant: ${tenant.nome} (${tenant.slug})`)
  console.log(`  id       : ${tenant.id}`)
  console.log(`  ativo    : ${tenant.ativo}`)
  console.log(`  criado em: ${tenant.criadoEm.toISOString()}`)

  /** @type {string[]} */
  const bloqueios = []
  if (tenant.ativo) bloqueios.push('tenant está ATIVO — arquive antes de excluir')

  const sedes = await db.sede.count({ where: { tenantId: tenant.id } })
  if (sedes > 0) bloqueios.push(`tem ${sedes} Sede(s) próprias — não é erro de registro`)

  /** @type {{ filho: string }[]} */
  const filhos = await db.$queryRaw`
    SELECT DISTINCT s.tenant_id AS filho
    FROM saas_sedes s INNER JOIN saas_sedes pai ON pai.id = s.sede_id
    WHERE s.tenant_id IS NOT NULL AND pai.tenant_id = ${tenant.id}
      AND s.tenant_id <> pai.tenant_id
  `
  if (filhos.length > 0) bloqueios.push(`é mãe de ${filhos.length} portal(is) Caso B`)

  const membros = await db.saasMembro.findMany({
    where: { tenantId: tenant.id },
    select: {
      tipo: true,
      status: true,
      user: { select: { id: true, nome: true, email: true } },
    },
  })
  /** @type {Array<{ nome: string, email: string, tipo: string, status: string, outrasTorcidas: number }>} */
  const membrosDetalhe = []
  for (const m of membros) {
    const outras = await db.saasMembro.count({
      where: { userId: m.user.id, tenantId: { not: tenant.id } },
    })
    membrosDetalhe.push({
      nome: m.user.nome,
      email: m.user.email,
      tipo: m.tipo,
      status: m.status,
      outrasTorcidas: outras,
    })
    if (outras === 0) {
      bloqueios.push(`${m.user.email} ficaria sem nenhuma torcida`)
    }
  }

  const inventario = await inventariar(tenant.id)
  const totalLinhas = Object.values(inventario).reduce((a, b) => a + b, 0)

  console.log('\nSerá apagado em cascata:')
  for (const [tabela, n] of Object.entries(inventario)) {
    console.log(`  ${tabela.padEnd(34)} ${n}`)
  }
  console.log(`  ${'TOTAL'.padEnd(34)} ${totalLinhas}`)

  if (membrosDetalhe.length > 0) {
    console.log('\nMembros que perdem o vínculo com esta torcida:')
    for (const m of membrosDetalhe) {
      console.log(`  · ${m.nome} <${m.email}> ${m.tipo}/${m.status} — segue em ${m.outrasTorcidas} torcida(s)`)
    }
  }

  if (bloqueios.length > 0) {
    console.log('\n✗ BLOQUEADO:')
    for (const b of bloqueios) console.log(`  · ${b}`)
    process.exit(1)
  }

  if (!APPLY) {
    console.log('\n(dry-run) Nada foi gravado. Repita com --apply para excluir.')
    return
  }

  const detalhes = {
    nome: tenant.nome,
    slug: tenant.slug,
    afiliacaoId: tenant.afiliacaoId,
    criadoEm: tenant.criadoEm.toISOString(),
    motivo: 'Registro indevido como torcida (deveria ser unidade de outra torcida).',
    linhasApagadas: inventario,
    totalLinhas,
    membros: membrosDetalhe,
    script: 'excluir-torcida-erro-registro.js',
  }

  // SQL cru de propósito: o Railway NÃO aplica schema sozinho, então produção
  // costuma estar atrás do schema.prisma local (docs/ops/schema-deploy.md). Um
  // `tenant.delete()` do Prisma lê a linha inteira e quebra com P2022 na
  // primeira coluna ainda não aplicada. A cascata é do Postgres (53 FKs
  // ON DELETE CASCADE), não do client — o DELETE cru limpa tudo igual.
  await db.$transaction(async (tx) => {
    const apagados = await tx.$executeRawUnsafe(
      'DELETE FROM saas_tenants WHERE id = $1',
      tenant.id,
    )
    if (apagados !== 1) throw new Error(`DELETE afetou ${apagados} linhas — abortado.`)

    // tenant_id nulo: a torcida deixou de existir, o registro é de plataforma.
    await tx.$executeRawUnsafe(
      `INSERT INTO saas_audit_logs (id, tenant_id, ator_id, acao, entidade, entidade_id, detalhes, criado_em)
       VALUES ($1, NULL, NULL, $2, 'Tenant', $3, $4::jsonb, NOW())`,
      randomUUID(),
      'TORCIDA_EXCLUIDA_ERRO_REGISTRO',
      tenant.id,
      JSON.stringify(detalhes),
    )
  }, { timeout: 30_000 })

  console.log(`\n✓ Tenant ${tenant.slug} excluído (${totalLinhas} linhas em cascata).`)
  console.log('  AuditLog de plataforma gravado: TORCIDA_EXCLUIDA_ERRO_REGISTRO')
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
