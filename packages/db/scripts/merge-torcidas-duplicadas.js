/**
 * Merge dos pares de tenants duplicados (mesmo clube) descritos em
 * docs/ops/plano-merge-torcidas-duplicadas.md
 *
 * Inclui variantes de prefixo (Torcida X ≈ X) e hífen (Alvi-verde ≈ Alviverde).
 *
 *   pnpm --filter @torcida/db exec node scripts/merge-torcidas-duplicadas.js
 *   pnpm --filter @torcida/db exec node scripts/merge-torcidas-duplicadas.js --apply
 *
 * Default = dry-run (somente leitura + log). --apply escreve em transaction por par.
 */
import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const db = new PrismaClient()

/** Limite de membros na candidata para remanejamento automático. */
const MAX_MEMBROS_DUPE = 5

/** @typedef {{ clube: string, manterSlug: string, dupeSlug: string, nomeFormal: string }} Par */

/** @type {Par[]} */
const PARES = [
  {
    clube: 'Fogão (RJ)',
    manterSlug: 'furia-jovem-do-botafogo-rj',
    dupeSlug: 'furia-jovem-botafogo',
    nomeFormal: 'Fúria Jovem do Botafogo',
  },
  {
    // Print onboarding: JOVEM DO FLAMENGO (logo) + TORCIDA JOVEM DO FLAMENGO (dados, sem logo)
    clube: 'Mengão (RJ)',
    manterSlug: 'torcida-jovem-flamengo',
    dupeSlug: 'torcida-jovem-do-flamengo-rj',
    nomeFormal: 'Torcida Jovem do Flamengo',
  },
  {
    clube: 'Peixe (SP)',
    manterSlug: 'torcida-jovem-santos',
    dupeSlug: 'torcida-jovem-santos-sp',
    nomeFormal: 'Torcida Jovem do Santos',
  },
  {
    // Print onboarding: MANCHA ALVI-VERDE (logo+catálogo) + MANCHA ALVIVERDE (dados, sem logo)
    clube: 'Verdão (SP)',
    manterSlug: 'mancha-alviverde',
    dupeSlug: 'mancha-alvi-verde-sp',
    nomeFormal: 'Mancha Alviverde',
  },
  {
    clube: 'Colorado (RS)',
    manterSlug: 'camisa-12-inter',
    dupeSlug: 'torcida-organizada-camisa-12-rs',
    nomeFormal: 'Camisa 12',
  },
  {
    clube: 'Tricolor (SP)',
    manterSlug: 'torcida-tricolor-independente-sp',
    dupeSlug: 'tti-sao-paulo',
    nomeFormal: 'Torcida Tricolor Independente',
  },
  {
    clube: 'Tricolor (RS)',
    manterSlug: 'torcida-jovem-do-gremio-rs',
    dupeSlug: 'torcida-jovem-gremio',
    nomeFormal: 'Torcida Jovem do Grêmio',
  },
]

const STATUS_RANK = { ATIVA: 4, PENDENTE: 3, SUGERIDA: 2, ENCERRADA: 1 }

/**
 * @param {string} a
 * @param {string} b
 */
function ordenarPar(a, b) {
  return a < b ? [a, b] : [b, a]
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} slug
 */
async function carregarTenant(tx, slug) {
  return tx.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      nome: true,
      logoUrl: true,
      torcidaConhecidaId: true,
      afiliacaoId: true,
      torcidaConhecida: {
        select: {
          id: true,
          slug: true,
          logoUrl: true,
          nome: true,
          titulo: true,
          cidade: true,
          uf: true,
          sede: true,
        },
      },
      _count: { select: { membros: true, sedes: true } },
    },
  })
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} tx
 * @param {Par} par
 * @param {{ apply: boolean }} opts
 */
async function mergePar(tx, par, opts) {
  const log = []
  const step = (msg) => {
    log.push(msg)
    console.log(`  · ${msg}`)
  }

  const manter = await carregarTenant(tx, par.manterSlug)
  const dupe = await carregarTenant(tx, par.dupeSlug)

  if (!manter) throw new Error(`Keeper não encontrado: ${par.manterSlug}`)
  if (!dupe) {
    step(`SKIP — dupe ${par.dupeSlug} já não existe (merge prévio?)`)
    return { log, skipped: true }
  }
  if (manter.id === dupe.id) throw new Error('Keeper e dupe são o mesmo tenant')
  if (dupe._count.membros > MAX_MEMBROS_DUPE) {
    throw new Error(
      `Abortado: dupe ${dupe.slug} tem ${dupe._count.membros} membro(s) (>${MAX_MEMBROS_DUPE}). Remanejamento grande exige revisão manual.`,
    )
  }

  step(`keeper=${manter.slug} (${manter.id.slice(0, 8)}) ← dupe=${dupe.slug} (${dupe.id.slice(0, 8)})`)

  const sedeKeeperPrincipal = await tx.sede.findFirst({
    where: { tenantId: manter.id, tipo: 'SEDE' },
    select: {
      id: true,
      endereco: true,
      cidade: true,
      estado: true,
      lat: true,
      lng: true,
    },
  })

  // ── 1. Fill keeper (nome, logo, catálogo) ─────────────────────────────────
  /** @type {Record<string, unknown>} */
  const fill = {}
  if (manter.nome !== par.nomeFormal) {
    fill.nome = par.nomeFormal
    step(`renomear keeper: "${manter.nome}" → "${par.nomeFormal}"`)
  }

  const logoDupe = dupe.logoUrl || dupe.torcidaConhecida?.logoUrl || null
  const logoKeeper = manter.logoUrl || manter.torcidaConhecida?.logoUrl || null
  if (!logoKeeper && logoDupe) {
    fill.logoUrl = logoDupe
    step(`copiar logoUrl → keeper (imagem da candidata/catálogo)`)
  }

  let catalogoParaMover = null
  if (!manter.torcidaConhecidaId && dupe.torcidaConhecidaId) {
    catalogoParaMover = dupe.torcidaConhecidaId
    step(
      `mover torcidaConhecidaId ${dupe.torcidaConhecida?.slug ?? catalogoParaMover.slice(0, 8)} → keeper`,
    )
  }

  if (opts.apply) {
    if (catalogoParaMover) {
      await tx.tenant.update({
        where: { id: dupe.id },
        data: { torcidaConhecidaId: null },
      })
      fill.torcidaConhecidaId = catalogoParaMover
    }
    if (Object.keys(fill).length > 0) {
      await tx.tenant.update({ where: { id: manter.id }, data: fill })
    }
  } else if (catalogoParaMover) {
    step(`(dry-run) liberaria catálogo no dupe antes de gravar no keeper`)
  }

  // Localização: enriquecer SEDE do keeper a partir do catálogo (não sobrescrever se já tem)
  const catLoc = dupe.torcidaConhecida
  if (sedeKeeperPrincipal && catLoc?.sede) {
    /** @type {Record<string, unknown>} */
    const sedeFill = {}
    if (!sedeKeeperPrincipal.endereco && catLoc.sede) sedeFill.endereco = catLoc.sede
    if (!sedeKeeperPrincipal.cidade && catLoc.cidade) sedeFill.cidade = catLoc.cidade
    if (!sedeKeeperPrincipal.estado && catLoc.uf) sedeFill.estado = catLoc.uf
    if (Object.keys(sedeFill).length > 0) {
      step(
        `enriquecer localização da SEDE do keeper a partir do catálogo: ${JSON.stringify(sedeFill)}`,
      )
      if (opts.apply) {
        await tx.sede.update({ where: { id: sedeKeeperPrincipal.id }, data: sedeFill })
      }
    } else {
      step(
        `localização do keeper já ok ("${sedeKeeperPrincipal.endereco ?? ''}"); catálogo="${catLoc.sede}" — sem overwrite`,
      )
    }
  }

  // ── 1b. Membros da candidata → keeper ─────────────────────────────────────
  if (dupe._count.membros > 0) {
    const membrosDupe = await tx.saasMembro.findMany({
      where: { tenantId: dupe.id },
      select: { id: true, userId: true, status: true },
    })
    for (const m of membrosDupe) {
      const jaNoKeeper = await tx.saasMembro.findFirst({
        where: { tenantId: manter.id, userId: m.userId },
        select: { id: true },
      })
      if (jaNoKeeper) {
        step(`membro ${m.id.slice(0, 8)} status=${m.status} já no keeper → DELETE da candidata`)
        if (opts.apply) await tx.saasMembro.delete({ where: { id: m.id } })
        continue
      }
      if (!sedeKeeperPrincipal) {
        throw new Error(`Keeper ${manter.slug} sem SEDE para receber membro ${m.id}`)
      }
      step(
        `remanejar membro ${m.id.slice(0, 8)} status=${m.status} → keeper (SEDE principal; depto limpo)`,
      )
      if (opts.apply) {
        await tx.saasMembro.update({
          where: { id: m.id },
          data: {
            tenantId: manter.id,
            sedeId: sedeKeeperPrincipal.id,
            departamentoId: null,
            departamentoSedeId: null,
          },
        })
        await tx.userRole.deleteMany({ where: { tenantId: dupe.id, userId: m.userId } })
        await tx.userPermission.deleteMany({ where: { tenantId: dupe.id, userId: m.userId } })
        await tx.userDepartamento.deleteMany({ where: { tenantId: dupe.id, userId: m.userId } })
      }
    }
  }

  // ── 2. Alianças ───────────────────────────────────────────────────────────
  const aliancasDupe = await tx.alianca.findMany({
    where: { OR: [{ tenantOrigemId: dupe.id }, { tenantAliadoId: dupe.id }] },
  })
  const aliancasKeeper = await tx.alianca.findMany({
    where: { OR: [{ tenantOrigemId: manter.id }, { tenantAliadoId: manter.id }] },
  })
  const parceirosKeeper = new Set(
    aliancasKeeper.map((a) =>
      a.tenantOrigemId === manter.id ? a.tenantAliadoId : a.tenantOrigemId,
    ),
  )

  for (const a of aliancasDupe) {
    const outro = a.tenantOrigemId === dupe.id ? a.tenantAliadoId : a.tenantOrigemId
    if (outro === manter.id) {
      step(`aliança ${a.id.slice(0, 8)} entre keeper↔dupe → DELETE`)
      if (opts.apply) await tx.alianca.delete({ where: { id: a.id } })
      continue
    }
    if (parceirosKeeper.has(outro)) {
      const existente = aliancasKeeper.find(
        (k) =>
          (k.tenantOrigemId === manter.id && k.tenantAliadoId === outro) ||
          (k.tenantAliadoId === manter.id && k.tenantOrigemId === outro),
      )
      const rankDupe = STATUS_RANK[a.status] ?? 0
      const rankKeep = STATUS_RANK[existente?.status ?? ''] ?? 0
      if (existente && rankDupe > rankKeep) {
        step(
          `aliança c/ ${outro.slice(0, 8)}: keeper ${existente.status} ← promover p/ ${a.status}; DELETE dupe`,
        )
        if (opts.apply) {
          await tx.alianca.update({
            where: { id: existente.id },
            data: { status: a.status, confirmadaEm: a.confirmadaEm, confirmadaPorId: a.confirmadaPorId },
          })
          await tx.alianca.delete({ where: { id: a.id } })
        }
      } else {
        step(`aliança ${a.id.slice(0, 8)} status=${a.status} c/ parceiro já no keeper → DELETE dupe`)
        if (opts.apply) await tx.alianca.delete({ where: { id: a.id } })
      }
      continue
    }
    const data =
      a.tenantOrigemId === dupe.id
        ? { tenantOrigemId: manter.id }
        : { tenantAliadoId: manter.id }
    step(`transferir aliança ${a.id.slice(0, 8)} status=${a.status} → keeper`)
    if (opts.apply) await tx.alianca.update({ where: { id: a.id }, data })
    parceirosKeeper.add(outro)
  }

  // ── 3. Rivalidades ────────────────────────────────────────────────────────
  const rivDupe = await tx.rivalidadeTorcida.findMany({
    where: { OR: [{ tenantAId: dupe.id }, { tenantBId: dupe.id }] },
  })
  const rivKeeper = await tx.rivalidadeTorcida.findMany({
    where: { OR: [{ tenantAId: manter.id }, { tenantBId: manter.id }] },
  })
  const rivaisKeeper = new Set(
    rivKeeper.map((r) => (r.tenantAId === manter.id ? r.tenantBId : r.tenantAId)),
  )

  for (const r of rivDupe) {
    const outro = r.tenantAId === dupe.id ? r.tenantBId : r.tenantAId
    if (outro === manter.id) {
      step(`rivalidade ${r.id.slice(0, 8)} entre keeper↔dupe → DELETE`)
      if (opts.apply) await tx.rivalidadeTorcida.delete({ where: { id: r.id } })
      continue
    }
    if (rivaisKeeper.has(outro)) {
      step(`rivalidade ${r.id.slice(0, 8)} c/ rival já no keeper → DELETE dupe`)
      if (opts.apply) await tx.rivalidadeTorcida.delete({ where: { id: r.id } })
      continue
    }
    const [aId, bId] = ordenarPar(manter.id, outro)
    step(`transferir rivalidade ${r.id.slice(0, 8)} → keeper (canônico)`)
    if (opts.apply) {
      // delete+create evita conflito se a ordem a/b muda sob o mesmo id
      await tx.rivalidadeTorcida.delete({ where: { id: r.id } })
      await tx.rivalidadeTorcida.create({
        data: { tenantAId: aId, tenantBId: bId },
      })
    }
    rivaisKeeper.add(outro)
  }

  // ── 4. Soft refs ──────────────────────────────────────────────────────────
  const softNotif = await tx.notificacao.count({ where: { tenantId: dupe.id } })
  if (softNotif > 0) {
    step(`remapear ${softNotif} Notificacao.tenantId → keeper`)
    if (opts.apply) {
      await tx.notificacao.updateMany({
        where: { tenantId: dupe.id },
        data: { tenantId: manter.id },
      })
    }
  }

  const softRecTenant = await tx.recomendacaoAlianca.count({ where: { tenantId: dupe.id } })
  if (softRecTenant > 0) {
    step(`remapear ${softRecTenant} RecomendacaoAlianca.tenantId → keeper`)
    if (opts.apply) {
      await tx.recomendacaoAlianca.updateMany({
        where: { tenantId: dupe.id },
        data: { tenantId: manter.id },
      })
    }
  }

  // tenantSugeridoId não tem FK — updateMany por campo string
  const softRecSug = await tx.recomendacaoAlianca.count({
    where: { tenantSugeridoId: dupe.id },
  })
  if (softRecSug > 0) {
    step(`remapear ${softRecSug} RecomendacaoAlianca.tenantSugeridoId → keeper`)
    if (opts.apply) {
      await tx.recomendacaoAlianca.updateMany({
        where: { tenantSugeridoId: dupe.id },
        data: { tenantSugeridoId: manter.id },
      })
    }
  }

  const softAprov = await tx.saasMembro.count({
    where: { aprovadoNaUnidadeTenantId: dupe.id },
  })
  if (softAprov > 0) {
    step(`remapear ${softAprov} SaasMembro.aprovadoNaUnidadeTenantId → keeper`)
    if (opts.apply) {
      await tx.saasMembro.updateMany({
        where: { aprovadoNaUnidadeTenantId: dupe.id },
        data: { aprovadoNaUnidadeTenantId: manter.id },
      })
    }
  }

  // ── 5. Sedes ──────────────────────────────────────────────────────────────
  const sedesDupe = await tx.sede.findMany({
    where: { tenantId: dupe.id },
    select: {
      id: true,
      nome: true,
      tipo: true,
      endereco: true,
      _count: { select: { filhos: true, membros: true, eventos: true } },
    },
  })

  for (const s of sedesDupe) {
    const vazia = s._count.membros === 0 && s._count.eventos === 0 && s._count.filhos === 0
    if (vazia) {
      step(`apagar SEDE vazia/errada do dupe: ${s.tipo} "${s.nome}" (${s.endereco ?? 'sem end.'})`)
      if (opts.apply) await tx.sede.delete({ where: { id: s.id } })
      continue
    }
    if (!sedeKeeperPrincipal) {
      step(`transferir sede com dados "${s.nome}" → keeper (sem SEDE no keeper)`)
      if (opts.apply) {
        await tx.sede.update({ where: { id: s.id }, data: { tenantId: manter.id } })
      }
      continue
    }
    step(
      `remanejar ${s._count.membros} membro(s)/${s._count.eventos} evento(s) da sede "${s.nome}" → SEDE do keeper; depois DELETE (não sobrescreve endereço do keeper)`,
    )
    if (opts.apply) {
      await tx.saasMembro.updateMany({
        where: { sedeId: s.id },
        data: { sedeId: sedeKeeperPrincipal.id },
      })
      await tx.evento.updateMany({
        where: { sedeId: s.id },
        data: { sedeId: sedeKeeperPrincipal.id },
      })
      await tx.sede.updateMany({
        where: { sedeId: s.id },
        data: { sedeId: sedeKeeperPrincipal.id },
      })
      await tx.sede.delete({ where: { id: s.id } })
    }
  }

  // ── 6–7. Delete tenant dupe (Cascade limpa Role/Departamento/scaffolding) ─
  // Sedes já foram removidas acima (SetNull — não cascateiam).
  step(`DELETE tenant ${dupe.slug} (cascade roles/deptos/resto)`)
  if (opts.apply) {
    await tx.tenant.delete({ where: { id: dupe.id } })
    await tx.auditLog.create({
      data: {
        tenantId: manter.id,
        atorId: null,
        acao: 'TORCIDA_MERGE',
        entidade: 'Tenant',
        entidadeId: manter.id,
        detalhes: {
          dupeSlug: dupe.slug,
          dupeId: dupe.id,
          nomeFormal: par.nomeFormal,
          clube: par.clube,
        },
      },
    })
    step(`AuditLog TORCIDA_MERGE gravado no keeper`)
  }

  return { log, skipped: false }
}

async function main() {
  console.log(`Merge torcidas duplicadas ${APPLY ? '(APPLY)' : '(dry-run)'}`)
  console.log(`Pares: ${PARES.length}\n`)

  for (const par of PARES) {
    console.log(`\n=== ${par.clube}: ${par.manterSlug} ← ${par.dupeSlug} ===`)
    try {
      if (APPLY) {
        await db.$transaction(
          async (tx) => {
            await mergePar(tx, par, { apply: true })
          },
          { maxWait: 30_000, timeout: 120_000 },
        )
      } else {
        await mergePar(db, par, { apply: false })
      }
    } catch (err) {
      console.error(`  ✗ ERRO: ${err instanceof Error ? err.message : err}`)
      if (APPLY) {
        await db.$disconnect()
        process.exit(1)
      }
    }
  }

  console.log(`\n${APPLY ? 'Apply concluído.' : 'Dry-run ok. Rerode com --apply para gravar.'}`)
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
