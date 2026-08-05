/**
 * Devolve ao sócio a carteirinha que ficou para trás numa promoção de unidade.
 *
 * `promoverSedeParaTenant` migrava os `SaasMembro` da unidade para o tenant
 * novo e **não movia** o `SaasSocio` (corrigido em 2026-08-04; ver
 * `ARCHITECTURE.md` §7 21). O resultado é uma carteirinha hospedada no tenant
 * da mãe apontando para quem já não tem vínculo lá:
 *
 *   - o sócio some das abas Ativos/Vencendo do tenant novo e volta para
 *     "Aguardando emissão", apesar de ter carteirinha válida;
 *   - o número fica ocupado na Sede, bloqueando reemissão;
 *   - e o `qrToken` continua **válido**, validando no portão de uma torcida
 *     da qual a pessoa saiu. É este o motivo de o repair existir.
 *
 * Critério de órfã (conservador — só mexe no que é inequívoco):
 *   1. existe `SaasSocio` em T;
 *   2. **não** existe nenhum `SaasMembro` desse usuário em T (nem espelho);
 *   3. existe exatamente **um** tenant D onde ele tem `SaasMembro`, e D é
 *      descendente de T na árvore de Sedes (assinatura da promoção).
 *
 * Fora desses casos o script **não decide**: reporta e segue. Carteirinha sem
 * vínculo em lugar nenhum, ou com vínculo em vários tenants, é outra história
 * e merece olho humano.
 *
 * Colisão de `numeroSocio` no destino (`@@unique([tenantId, numeroSocio])`)
 * também para o caso: número de associado é identidade, não detalhe técnico —
 * renumerar alguém por conta própria seria pior que deixar como está.
 *
 * Uso:
 *   pnpm --filter @torcida/db db:repair-carteirinha-orfa -- --dry-run
 *   pnpm --filter @torcida/db db:repair-carteirinha-orfa
 */
import { db } from '../src/index.js'

const DRY_RUN = process.argv.includes('--dry-run')

const SEDE_NODE_SELECT = { id: true, tenantId: true, sedeId: true }
const ORDEM_SEDE = [{ criadoEm: 'asc' }, { id: 'asc' }]

/** Nó de partida canônico do tenant (mesma regra de `findSedeRaiz`). */
async function sedeRaizDoTenant(tenantId) {
  return (
    (await db.sede.findFirst({
      where: { tenantId, tipo: 'SEDE' },
      select: SEDE_NODE_SELECT,
      orderBy: ORDEM_SEDE,
    })) ??
    (await db.sede.findFirst({
      where: { tenantId },
      select: SEDE_NODE_SELECT,
      orderBy: ORDEM_SEDE,
    }))
  )
}

/** Tenants descendentes na árvore de Sedes (porta de `getDescendantTenantIds`). */
async function descendentes(sedeId, visitados = new Set()) {
  if (visitados.has(sedeId)) return []
  visitados.add(sedeId)
  const filhos = await db.sede.findMany({
    where: { sedeId },
    select: SEDE_NODE_SELECT,
  })
  const ids = []
  for (const f of filhos) {
    if (f.tenantId) ids.push(f.tenantId)
    ids.push(...(await descendentes(f.id, visitados)))
  }
  return ids
}

async function main() {
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Carteirinhas órfãs por promoção de unidade\n`)

  const socios = await db.saasSocio.findMany({
    select: {
      id: true,
      tenantId: true,
      userId: true,
      numeroSocio: true,
      tenant: { select: { slug: true } },
      user: { select: { email: true } },
    },
  })

  // Um lookup em lote em vez de N queries: são centenas de carteirinhas.
  const membros = await db.saasMembro.findMany({
    where: { userId: { in: [...new Set(socios.map((s) => s.userId))] } },
    select: { userId: true, tenantId: true, tenant: { select: { slug: true } } },
  })
  const tenantsPorUser = new Map()
  for (const m of membros) {
    if (!tenantsPorUser.has(m.userId)) tenantsPorUser.set(m.userId, new Map())
    tenantsPorUser.get(m.userId).set(m.tenantId, m.tenant.slug)
  }

  const descendentesPorTenant = new Map()
  async function descendentesDe(tenantId) {
    if (descendentesPorTenant.has(tenantId)) return descendentesPorTenant.get(tenantId)
    const raiz = await sedeRaizDoTenant(tenantId)
    const ids = raiz ? new Set(await descendentes(raiz.id)) : new Set()
    descendentesPorTenant.set(tenantId, ids)
    return ids
  }

  const migrar = []
  const ambiguos = []
  const semVinculo = []

  for (const s of socios) {
    const doUser = tenantsPorUser.get(s.userId) ?? new Map()
    if (doUser.has(s.tenantId)) continue // tem vínculo aqui — nada a fazer

    if (doUser.size === 0) {
      semVinculo.push(s)
      continue
    }
    if (doUser.size > 1) {
      ambiguos.push({ s, tenants: [...doUser.values()] })
      continue
    }

    const [destinoId, destinoSlug] = [...doUser.entries()][0]
    const filhos = await descendentesDe(s.tenantId)
    if (!filhos.has(destinoId)) {
      ambiguos.push({ s, tenants: [destinoSlug], motivo: 'destino não é descendente' })
      continue
    }
    migrar.push({ s, destinoId, destinoSlug })
  }

  console.log(`Carteirinhas analisadas : ${socios.length}`)
  console.log(`Órfãs por promoção      : ${migrar.length}`)
  console.log(`Sem vínculo em lugar nenhum: ${semVinculo.length}`)
  console.log(`Ambíguas (não tocadas)  : ${ambiguos.length}\n`)

  for (const a of ambiguos.slice(0, 10)) {
    console.log(
      `  ⚠️  ${a.s.user.email} @${a.s.tenant.slug}: vínculo em ${a.tenants.join(', ')}${a.motivo ? ` (${a.motivo})` : ''}`,
    )
  }
  for (const s of semVinculo.slice(0, 10)) {
    console.log(
      `  ⚠️  ${s.user.email} @${s.tenant.slug}: carteirinha nº ${s.numeroSocio} sem NENHUM vínculo — revisar à mão`,
    )
  }

  if (migrar.length === 0) {
    console.log('\nNada a migrar.')
    return
  }

  let migradas = 0
  let colisoes = 0
  for (const { s, destinoId, destinoSlug } of migrar) {
    const conflito = await db.saasSocio.findFirst({
      where: {
        tenantId: destinoId,
        OR: [{ numeroSocio: s.numeroSocio }, { userId: s.userId }],
      },
      select: { numeroSocio: true, userId: true },
    })
    if (conflito) {
      colisoes += 1
      console.log(
        `  ⚠️  ${s.user.email}: já existe carteirinha em ${destinoSlug} (nº ${conflito.numeroSocio}) — a de ${s.tenant.slug} precisa de decisão humana`,
      )
      continue
    }

    if (DRY_RUN) {
      console.log(
        `  [dry-run] ${s.user.email}: nº ${s.numeroSocio} iria de ${s.tenant.slug} → ${destinoSlug}`,
      )
      migradas += 1
      continue
    }

    await db.saasSocio.update({ where: { id: s.id }, data: { tenantId: destinoId } })
    await db.auditLog.create({
      data: {
        tenantId: destinoId,
        atorId: s.userId,
        acao: 'SOCIO_CARTEIRINHA_MIGRADA',
        entidade: 'SaasSocio',
        entidadeId: s.id,
        detalhes: {
          motivo: 'repair-carteirinha-orfa-promocao',
          deTenantSlug: s.tenant.slug,
          paraTenantSlug: destinoSlug,
          numeroSocio: s.numeroSocio,
        },
      },
    })
    migradas += 1
    console.log(`  ✅ ${s.user.email}: nº ${s.numeroSocio} ${s.tenant.slug} → ${destinoSlug}`)
  }

  console.log(
    `\n🎉 ${DRY_RUN ? 'Simulação' : 'Concluído'}: ${migradas} carteirinha(s)${colisoes > 0 ? `, ${colisoes} colisão(ões) não resolvida(s)` : ''}.`,
  )
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
