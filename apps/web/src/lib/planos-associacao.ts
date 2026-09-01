import 'server-only'
import { db } from '@torcida/db'
import {
  escolherPlanoParaPeriodicidade,
  PeriodicidadePlanoSchema,
  resolverPeriodicidadesOnboarding,
} from '@torcida/types'
import type { z } from 'zod'

type PeriodicidadePlano = z.infer<typeof PeriodicidadePlanoSchema>

export type PlanoOnboardingLite = {
  id: string
  nome: string
  valor: number
  periodicidade: string
  ativo?: boolean
}

function valorPlano(valor: { toNumber(): number } | number): number {
  return typeof valor === 'number' ? valor : valor.toNumber()
}

export async function listarPlanosOnboardingPorTenants(
  tenantIds: string[],
): Promise<Map<string, PlanoOnboardingLite[]>> {
  const map = new Map<string, PlanoOnboardingLite[]>()
  if (tenantIds.length === 0) return map

  type PlanoRow = {
    id: string
    tenantId: string
    nome: string
    valor: { toNumber(): number } | number
    periodicidade: string
  }

  const rows: PlanoRow[] = await db.planoAssociacao.findMany({
    where: { tenantId: { in: tenantIds }, ativo: true },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      valor: true,
      periodicidade: true,
    },
    orderBy: { nome: 'asc' },
  })

  for (const row of rows) {
    const list = map.get(row.tenantId) ?? []
    list.push({
      id: row.id,
      nome: row.nome,
      valor: valorPlano(row.valor),
      periodicidade: row.periodicidade,
      ativo: true,
    })
    map.set(row.tenantId, list)
  }
  return map
}

export async function listarPlanosOnboarding(tenantId: string): Promise<PlanoOnboardingLite[]> {
  const porTenant = await listarPlanosOnboardingPorTenants([tenantId])
  return porTenant.get(tenantId) ?? []
}

export async function resolverPlanoVinculo(
  tenantId: string,
  periodicidade: string,
  planoIdPreferido?: string | null,
): Promise<PlanoOnboardingLite | null> {
  const planos = await listarPlanosOnboarding(tenantId)
  return escolherPlanoParaPeriodicidade(planos, periodicidade, planoIdPreferido)
}

export async function persistirOfertaOnboarding(
  tenantId: string,
  periodicidades: PeriodicidadePlano[],
): Promise<void> {
  await db.tenant.update({
    where: { id: tenantId },
    data: { periodicidadesOnboarding: periodicidades },
  })
}

/** Materializa o fallback (quadrimensal+anual) se a oferta ainda estiver vazia. */
export async function garantirPeriodicidadeNaOferta(
  tenantId: string,
  periodicidade: PeriodicidadePlano,
): Promise<void> {
  const tenant: { periodicidadesOnboarding: string[] } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { periodicidadesOnboarding: true },
  })
  if (!tenant) return

  const atuais = resolverPeriodicidadesOnboarding(tenant.periodicidadesOnboarding)
  const next = atuais.includes(periodicidade) ? atuais : [...atuais, periodicidade]
  const gravadas = tenant.periodicidadesOnboarding
  const igual =
    gravadas.length === next.length && next.every((p) => gravadas.includes(p))
  if (igual) return

  await persistirOfertaOnboarding(tenantId, next)
}
