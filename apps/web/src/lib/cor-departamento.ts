import { cache } from 'react'
import { db } from '@torcida/db'
import { resolverCorSemRivalidade } from '@torcida/types'

/** Campos do tenant usados para não pintar a casa com cor de arquirrival. */
export type TenantParaCor = {
  slug: string
  corPrimaria: string
  corArquirrival?: string | null
  design?: unknown
  afiliacaoId?: string | null
  clubeNome?: string | null
  clubeApelido?: string | null
}

export const optsCorDoTenant = cache(async function optsCorDoTenant(tenant: TenantParaCor) {
  let clubeNome = tenant.clubeNome ?? null
  let clubeApelido = tenant.clubeApelido ?? null
  if (!clubeNome && tenant.afiliacaoId) {
    const afiliacao: { nome: string; apelido: string | null } | null =
      await db.afiliacao.findUnique({
        where: { id: tenant.afiliacaoId },
        select: { nome: true, apelido: true },
      })
    clubeNome = afiliacao?.nome ?? null
    clubeApelido = afiliacao?.apelido ?? null
  }
  return {
    slug: tenant.slug,
    corPrimaria: tenant.corPrimaria,
    corArquirrival: tenant.corArquirrival ?? null,
    design: tenant.design,
    clubeNome,
    clubeApelido,
  }
})

export async function corDepartamentoDoTenant(
  cor: string,
  tenant: TenantParaCor,
): Promise<string> {
  const opts = await optsCorDoTenant(tenant)
  return resolverCorSemRivalidade(cor, opts)
}

export async function comCorDepartamento<T extends { cor: string }>(
  rows: T[],
  tenant: TenantParaCor,
): Promise<T[]> {
  const opts = await optsCorDoTenant(tenant)
  return rows.map((row) => ({ ...row, cor: resolverCorSemRivalidade(row.cor, opts) }))
}

/** Alias: cargo, departamento, qualquer hex de UI da unidade. */
export const comCorSemRivalidade = comCorDepartamento
