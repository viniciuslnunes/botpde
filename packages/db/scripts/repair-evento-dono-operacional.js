/**
 * Backfill do dono operacional do evento (`Evento.departamentoId`/`areaId`).
 *
 * O campo nasceu depois dos eventos: até então, o hub thin do departamento só
 * enxergava evento por `projeto.departamentoId`. Aqui o vínculo herdado do
 * projeto vira dono explícito — sem inventar dono para quem não tem projeto,
 * porque isso é decisão de quem opera, não de script.
 *
 * Só preenche o que está nulo: dono já definido na tela nunca é sobrescrito.
 *
 * Uso:
 *   pnpm --filter @torcida/db db:repair-evento-dono-operacional -- --dry-run
 *   pnpm --filter @torcida/db db:repair-evento-dono-operacional
 *   TENANT_SLUG=pde-gavioes-fiel pnpm --filter @torcida/db db:repair-evento-dono-operacional
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')
const tenantSlug = process.env.TENANT_SLUG || null

async function main() {
  const tenants = await db.tenant.findMany({
    where: tenantSlug ? { slug: tenantSlug } : { ativo: true },
    select: { id: true, slug: true },
    orderBy: { slug: 'asc' },
  })

  if (tenants.length === 0) {
    console.log('Nenhum tenant encontrado.')
    return
  }

  let totalCandidatos = 0
  let totalAplicados = 0

  for (const tenant of tenants) {
    // Evento sem dono, mas com projeto: o projeto sabe o departamento e a frente.
    const candidatos = await db.evento.findMany({
      where: {
        tenantId: tenant.id,
        departamentoId: null,
        projetoId: { not: null },
      },
      select: {
        id: true,
        titulo: true,
        projeto: { select: { departamentoId: true, areaId: true } },
      },
    })

    if (candidatos.length === 0) continue
    totalCandidatos += candidatos.length

    if (dryRun) {
      console.log(`  · ${tenant.slug} — ${candidatos.length} evento(s) herdariam dono do projeto`)
      continue
    }

    let aplicados = 0
    for (const evento of candidatos) {
      const departamentoId = evento.projeto?.departamentoId ?? null
      if (!departamentoId) continue
      await db.evento.update({
        where: { id: evento.id },
        data: { departamentoId, areaId: evento.projeto?.areaId ?? null },
      })
      aplicados += 1
    }
    totalAplicados += aplicados
    console.log(`  ✓ ${tenant.slug} — ${aplicados} evento(s) com dono operacional`)
  }

  console.log(
    `\n${dryRun ? 'Resumo (dry-run)' : 'Resumo'}: candidatos=${totalCandidatos}, aplicados=${totalAplicados}`,
  )
  if (dryRun) console.log('Rode sem --dry-run para aplicar.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
