import { cache } from 'react'
import { db } from '@torcida/db'

export type ScopeType = 'TORCIDA' | 'CLUBE'

export type TorcidaOpcao = {
  id: string
  slug: string
  nome: string
  afiliacaoId: string | null
  clubeNome: string | null
  clubeUf: string | null
}

export type AfiliacaoOpcao = {
  id: string
  nome: string
  apelido: string | null
}

export type ResumoPrivacidade = {
  tenantId: string
  tenantSlug: string
  tenantNome: string
  totalTorcedoresAprovados: number
  torcedoresComPerfilMarcadoPrivado: number
  torcedoresPublicosEfetivos: number
}

export type TorcedorPrivadoRow = {
  tenantId: string
  tenantSlug: string
  tenantNome: string
  userId: string
  userEmail: string | null
  userNome: string | null
  torcedorNome: string
  perfilPrivadoBanco: boolean // PerfilMembro.perfilPrivado
  atualizadoEm: Date
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(n, max)
}

export const listarTorcidasParaSelecaoRelatorios = cache(async function listarTorcidasParaSelecaoRelatorios(): Promise<
  TorcidaOpcao[]
> {
  const rows: Array<{
    id: string
    slug: string
    nome: string
    afiliacaoId: string | null
    afiliacao: { nome: string; apelido: string | null; estado: string | null } | null
  }> =
    await db.tenant.findMany({
    where: { ativo: true, sintetico: false },
    select: {
      id: true,
      slug: true,
      nome: true,
      afiliacaoId: true,
      afiliacao: { select: { nome: true, apelido: true, estado: true } },
    },
    orderBy: { nome: 'asc' },
  })

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    nome: r.nome,
    afiliacaoId: r.afiliacaoId ?? null,
    clubeNome: r.afiliacao ? (r.afiliacao.apelido ?? r.afiliacao.nome) : null,
    clubeUf: r.afiliacao?.estado ?? null,
  }))
})

export const listarAfiliacoesParaRelatorios = cache(async function listarAfiliacoesParaRelatorios(): Promise<
  AfiliacaoOpcao[]
> {
  const rows = await db.afiliacao.findMany({
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, apelido: true },
  })
  return rows
})

async function obterResumoPrivacidadePorTenant(tenantId: string): Promise<ResumoPrivacidade> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, nome: true },
  })
  if (!tenant) {
    throw new Error('Tenant não encontrado')
  }

  const totalTorcedoresAprovados = await db.saasMembro.count({
    where: { tenantId, tipo: 'TORCEDOR', status: 'APROVADO' },
  })

  const torcedoresComPerfilMarcadoPrivado = await db.perfilMembro.count({
    where: {
      tenantId,
      perfilPrivado: true,
      user: {
        membros: {
          some: {
            tenantId,
            tipo: 'TORCEDOR',
            status: 'APROVADO',
          },
        },
      },
    },
  })

  return {
    tenantId,
    tenantSlug: tenant.slug,
    tenantNome: tenant.nome,
    totalTorcedoresAprovados,
    torcedoresComPerfilMarcadoPrivado,
    torcedoresPublicosEfetivos: Math.max(0, totalTorcedoresAprovados - torcedoresComPerfilMarcadoPrivado),
  }
}

export const getResumoPrivacidadePorTenant = cache(obterResumoPrivacidadePorTenant)

export async function getTorcedoresPrivadosPorTenant(opts: {
  tenantId: string
  page?: string
  take?: number
}): Promise<{ resumo: ResumoPrivacidade; rows: TorcedorPrivadoRow[]; total: number }> {
  const { tenantId } = opts
  const page = parsePositiveInt(opts.page, 1, 10000)
  const take = parsePositiveInt(String(opts.take ?? 25), 25, 100)
  const skip = (page - 1) * take

  const resumo = await getResumoPrivacidadePorTenant(tenantId)

  const tenant = {
    id: resumo.tenantId,
    slug: resumo.tenantSlug,
    nome: resumo.tenantNome,
  }

  // Query por PerfilMembro (fonte da flag perfil_privado) + constraint de SaasMembro
  // pra limitar apenas torcedores aprovados no mesmo tenant.
  const rows: Array<{
    userId: string
    perfilPrivado: boolean
    atualizadoEm: Date
    user: {
      id: string
      email: string | null
      nome: string | null
      membros: Array<{ nome: string }>
    }
  }> = await db.perfilMembro.findMany({
    where: {
      tenantId,
      perfilPrivado: true,
      user: {
        membros: {
          some: {
            tenantId,
            tipo: 'TORCEDOR',
            status: 'APROVADO',
          },
        },
      },
    },
    orderBy: { atualizadoEm: 'desc' },
    skip,
    take,
    select: {
      userId: true,
      perfilPrivado: true,
      atualizadoEm: true,
      user: {
        select: {
          id: true,
          email: true,
          nome: true,
          membros: {
            where: { tenantId, tipo: 'TORCEDOR', status: 'APROVADO' },
            select: { nome: true },
            take: 1,
          },
        },
      },
    },
  })

  const total = resumo.torcedoresComPerfilMarcadoPrivado

  return {
    resumo,
    rows: rows.map((r) => {
      const torcedorNome = r.user.membros[0]?.nome ?? '—'
      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantNome: tenant.nome,
        userId: r.userId,
        userEmail: r.user.email,
        userNome: r.user.nome,
        torcedorNome,
        perfilPrivadoBanco: r.perfilPrivado,
        atualizadoEm: r.atualizadoEm,
      }
    }),
    total,
  }
}

export async function getTenantsPorAfiliacao(afiliacaoId: string): Promise<Array<{ id: string; slug: string; nome: string }>> {
  const rows = await db.tenant.findMany({
    where: { ativo: true, sintetico: false, afiliacaoId },
    select: { id: true, slug: true, nome: true },
    orderBy: { nome: 'asc' },
  })
  return rows
}

