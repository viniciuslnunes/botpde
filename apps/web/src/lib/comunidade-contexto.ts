import { cache } from 'react'
import { db } from '@torcida/db'
import { getActiveTenant } from '@/lib/tenant'

export type AfiliacaoComunidade = {
  id: string
  nome: string
  apelido: string | null
  slug: string | null
  escudoUrl: string | null
}

export type ContextoComunidadePortal =
  | {
      modo: 'torcida'
      tenant: {
        id: string
        nome: string
        afiliacaoId: string | null
        logoUrl: string | null
        corPrimaria: string
        balancoFinanceiroVisivel: boolean
      }
      afiliacao: AfiliacaoComunidade | null
    }
  | {
      modo: 'nacional'
      tenant: null
      afiliacao: AfiliacaoComunidade
    }

/**
 * Resolve tenant ativo ou modo comunidade nacional (torcedor global sem torcida
 * na plataforma, mas com clube no PerfilTorcedor).
 */
export const resolverContextoComunidade = cache(
  async (userId: string, email?: string | null): Promise<ContextoComunidadePortal | null> => {
    const tenant = await getActiveTenant(userId, email)
    if (tenant) {
      let afiliacao: AfiliacaoComunidade | null = null
      if (tenant.afiliacaoId) {
        afiliacao = await db.afiliacao.findUnique({
          where: { id: tenant.afiliacaoId },
          select: { id: true, nome: true, apelido: true, slug: true, escudoUrl: true },
        })
      }

      // Subsede/PDE promovida a tenant próprio: sem logo de marca definido,
      // usa a foto da Sede raiz do tenant — senão a topbar mostra a inicial
      // da unidade mesmo com foto já cadastrada. A unidade promovida (Caso B)
      // mantém Sede.sedeId apontando pra Sede-mãe (outro tenant), então não dá
      // pra achar a raiz por `sedeId: null`; e se ela tiver filhos territoriais
      // movidos junto (mesmo tenantId), um findFirst sem esse critério pode
      // pegar a foto de um filho em vez da própria unidade.
      let logoUrl = tenant.logoUrl
      if (!logoUrl) {
        const sedesDoTenant: Array<{ id: string; sedeId: string | null; fotoUrl: string | null }> =
          await db.sede.findMany({
            where: { tenantId: tenant.id },
            select: { id: true, sedeId: true, fotoUrl: true },
          })
        const idsDoTenant = new Set(sedesDoTenant.map((s) => s.id))
        const raiz = sedesDoTenant.find((s) => !s.sedeId || !idsDoTenant.has(s.sedeId))
        logoUrl = raiz?.fotoUrl ?? null
      }

      return {
        modo: 'torcida',
        tenant: {
          id: tenant.id,
          nome: tenant.nome,
          afiliacaoId: tenant.afiliacaoId,
          logoUrl,
          corPrimaria: tenant.corPrimaria,
          balancoFinanceiroVisivel: tenant.balancoFinanceiroVisivel,
        },
        afiliacao,
      }
    }

    const perfil: {
      onboardingConcluidoEm: Date | null
      afiliacaoId: string | null
    } | null = await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true, afiliacaoId: true },
    })
    if (!perfil?.onboardingConcluidoEm || !perfil.afiliacaoId) return null

    const afiliacao: AfiliacaoComunidade | null = await db.afiliacao.findUnique({
      where: { id: perfil.afiliacaoId },
      select: { id: true, nome: true, apelido: true, slug: true, escudoUrl: true },
    })
    if (!afiliacao) return null

    return { modo: 'nacional', tenant: null, afiliacao }
  },
)

/**
 * Get-or-create do tenant sintético da Comunidade Nacional do clube — container
 * de posts de torcedores globais (sem Sede/Role/SaasMembro). Unicidade garantida
 * pelo slug reservado `{slug}-nacional` (slug é @unique no Tenant).
 */
export async function getOrCreateComunidadeNacionalTenant(
  afiliacaoId: string,
): Promise<{ id: string }> {
  const afiliacao: {
    nome: string
    apelido: string | null
    slug: string | null
    escudoUrl: string | null
  } | null = await db.afiliacao.findUnique({
    where: { id: afiliacaoId },
    select: { nome: true, apelido: true, slug: true, escudoUrl: true },
  })
  if (!afiliacao) throw new Error('Clube não encontrado')

  const slugReservado = `${afiliacao.slug ?? afiliacaoId}-nacional`

  const existente: { id: string } | null = await db.tenant.findFirst({
    where: { slug: slugReservado },
    select: { id: true },
  })
  if (existente) return existente

  try {
    const criado: { id: string } = await db.tenant.create({
      data: {
        nome: `${afiliacao.apelido ?? afiliacao.nome} — Comunidade Nacional`,
        slug: slugReservado,
        afiliacaoId,
        logoUrl: afiliacao.escudoUrl,
        corPrimaria: '#7c3aed',
        ativo: true,
        sintetico: true,
      },
      select: { id: true },
    })
    return criado
  } catch (error) {
    // Corrida rara: outro torcedor global criou o tenant no mesmo instante e o
    // create bateu no slug @unique — recupera o registro vencedor.
    const vencedor: { id: string } | null = await db.tenant.findFirst({
      where: { slug: slugReservado },
      select: { id: true },
    })
    if (vencedor) return vencedor
    throw error
  }
}

/** IDs de tenants ativos do mesmo clube (feed nacional agregado). */
export const getTenantIdsPorAfiliacao = cache(async (afiliacaoId: string): Promise<string[]> => {
  const tenants: { id: string }[] = await db.tenant.findMany({
    where: { afiliacaoId, ativo: true },
    select: { id: true },
    orderBy: { nome: 'asc' },
  })
  return tenants.map((t) => t.id)
})
