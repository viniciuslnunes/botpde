/**
 * Seed de recomendações de aliança a partir do conhecimento curado.
 *
 *   pnpm --filter @torcida/db seed:recomendacoes-aliancas
 *
 * Idempotente: upsert por (tenantId + nomeSugerido).
 * Nunca grava rivais. Mapeia tenantSugeridoId quando o aliado já existe no SaaS.
 */
import { PrismaClient } from '@prisma/client'
import {
  RECOMENDACOES_ALIANCAS,
  TORCIDAS_PRINCIPAIS,
  resumoRecomendacoes,
} from '../src/data/recomendacoes-aliancas.js'

const db = new PrismaClient()

/**
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string[]} slugs
 */
async function findTenantBySlugs(client, slugs) {
  const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))]
  if (unique.length === 0) return null
  return client.tenant.findFirst({
    where: { ativo: true, slug: { in: unique } },
    select: { id: true, nome: true, slug: true },
  })
}

/**
 * @param {import('@prisma/client').PrismaClient} client
 * @param {{ slugsSugeridos?: string[], nomesAlternativos?: string[], nomeSugerido: string }} item
 */
async function resolverTenantSugerido(client, item) {
  const bySlug = await findTenantBySlugs(client, item.slugsSugeridos ?? [])
  if (bySlug) return bySlug

  const nomes = [item.nomeSugerido, ...(item.nomesAlternativos ?? [])]
  const uniqueNomes = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))]
  if (uniqueNomes.length === 0) return null

  const byNome = await client.tenant.findFirst({
    where: {
      ativo: true,
      OR: uniqueNomes.map((nome) => ({
        nome: { equals: nome, mode: 'insensitive' },
      })),
    },
    select: { id: true, nome: true, slug: true },
  })
  return byNome
}

/**
 * Resolve o tenant que recebe a recomendação (slug principal ou alternativos do registro).
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} tenantSlug
 */
async function resolverTenantOrigem(client, tenantSlug) {
  const direct = await client.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, nome: true, slug: true },
  })
  if (direct) return direct

  const ref = Object.values(TORCIDAS_PRINCIPAIS).find((t) => t.slug === tenantSlug)
  if (!ref) return null
  return findTenantBySlugs(client, [ref.slug, ...(ref.slugs ?? [])])
}

async function main() {
  const resumo = resumoRecomendacoes()
  console.log(
    `Seed de recomendações de aliança (${resumo.torcidasNoCorte} torcidas no corte, ` +
      `${resumo.recomendacoes} edges bidirecionais: ` +
      `${resumo.porConfianca.ALTA} ALTA / ${resumo.porConfianca.MEDIA} MEDIA / ${resumo.porConfianca.BAIXA} BAIXA)...\n`,
  )

  /** @type {Map<string, { id: string, nome: string, slug: string }>} */
  const tenantsBySlug = new Map()
  let criadas = 0
  let atualizadas = 0
  let puladas = 0
  let mapeadas = 0
  let informativas = 0

  for (const item of RECOMENDACOES_ALIANCAS) {
    let tenant = tenantsBySlug.get(item.tenantSlug)
    if (!tenant) {
      const found = await resolverTenantOrigem(db, item.tenantSlug)
      if (!found) {
        console.warn(`  · tenant "${item.tenantSlug}" não encontrado — pulando ${item.nomeSugerido}`)
        puladas += 1
        continue
      }
      tenantsBySlug.set(item.tenantSlug, found)
      tenant = found
    }

    const sugerido = await resolverTenantSugerido(db, item)
    if (sugerido) {
      mapeadas += 1
    } else {
      informativas += 1
    }

    const existente = await db.recomendacaoAlianca.findFirst({
      where: {
        tenantId: tenant.id,
        nomeSugerido: item.nomeSugerido,
      },
      select: { id: true },
    })

    const data = {
      tenantSugeridoId: sugerido?.id ?? null,
      confianca: item.confianca,
      fonte: item.fonte,
      observacao: item.observacao ?? null,
    }

    if (existente) {
      await db.recomendacaoAlianca.update({
        where: { id: existente.id },
        data,
      })
      atualizadas += 1
      console.log(
        `  ✓ atualizada ${tenant.slug} → ${item.nomeSugerido} (${item.confianca})` +
          (sugerido ? ` [@${sugerido.slug}]` : ' [sem tenant na plataforma]'),
      )
    } else {
      await db.recomendacaoAlianca.create({
        data: {
          tenantId: tenant.id,
          nomeSugerido: item.nomeSugerido,
          ...data,
        },
      })
      criadas += 1
      console.log(
        `  + criada ${tenant.slug} → ${item.nomeSugerido} (${item.confianca})` +
          (sugerido ? ` [@${sugerido.slug}]` : ' [sem tenant na plataforma]'),
      )
    }
  }

  console.log(
    `\nConcluído: ${criadas} criada(s), ${atualizadas} atualizada(s), ${puladas} pulada(s).` +
      `\nMapeadas a tenant: ${mapeadas}; só nome (informativas): ${informativas}.`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
