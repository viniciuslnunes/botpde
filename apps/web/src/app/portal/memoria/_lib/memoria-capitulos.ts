import { db, withDbRetry } from '@torcida/db'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import { diaIsoDe, type MemoriaMarcoBruto } from '@/lib/memoria-dia'
import { getUserPermissionsInTenant } from '@/lib/tenant'

export type MemoriaCapituloResumo = {
  id: string
  slug: string
  titulo: string
  descricao: string | null
  dias: string[]
}

export async function podeGerirAcervoMemoria(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  return hasPermission(effective, PERMISSIONS.SETTINGS_MANAGE)
}

export async function carregarMarcosMemoria(
  tenantIds: string[],
  janela: { gte: Date; lt: Date },
): Promise<MemoriaMarcoBruto[]> {
  if (tenantIds.length === 0) return []
  const rows: Array<{
    id: string
    dia: Date
    titulo: string
    descricao: string | null
  }> = await withDbRetry(() =>
    db.memoriaMarco.findMany({
      where: {
        tenantId: { in: tenantIds },
        dia: { gte: janela.gte, lt: janela.lt },
      },
      select: { id: true, dia: true, titulo: true, descricao: true },
      orderBy: { dia: 'desc' },
      take: 200,
    }),
  )
  return rows.map((r) => ({
    id: r.id,
    dia: r.dia,
    titulo: r.titulo,
    descricao: r.descricao,
  }))
}

export async function carregarCapitulosMemoria(
  tenantId: string,
): Promise<MemoriaCapituloResumo[]> {
  const rows: Array<{
    id: string
    slug: string
    titulo: string
    descricao: string | null
    dias: Array<{ dia: Date; ordem: number }>
  }> = await db.memoriaCapitulo.findMany({
    where: { tenantId, ativo: true },
    select: {
      id: true,
      slug: true,
      titulo: true,
      descricao: true,
      dias: { select: { dia: true, ordem: true }, orderBy: { ordem: 'asc' } },
    },
    orderBy: { titulo: 'asc' },
    take: 40,
  })
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    titulo: c.titulo,
    descricao: c.descricao,
    dias: c.dias.map((d) => diaIsoDe(d.dia)),
  }))
}

export function resolverCapituloAtivo(
  capitulos: MemoriaCapituloResumo[],
  capRaw: string | null | undefined,
): MemoriaCapituloResumo | null {
  if (!capRaw?.trim()) return null
  return capitulos.find((c) => c.slug === capRaw.trim()) ?? null
}
