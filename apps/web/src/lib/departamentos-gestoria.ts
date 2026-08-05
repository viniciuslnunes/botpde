import { cache } from 'react'
import { db } from '@torcida/db'

/**
 * Slugs dos departamentos em que o usuário é gestor (`DepartamentoGestor`)
 * no tenant ativo. Usado pelo menu admin para hubs thin com `departamentoSlug`.
 */
export const listarSlugsGestoriaNoTenant = cache(
  async (userId: string, tenantId: string): Promise<string[]> => {
    const rows: { departamento: { slug: string } }[] = await db.departamentoGestor.findMany({
      where: { userId, departamento: { tenantId } },
      select: { departamento: { select: { slug: true } } },
    })
    return rows.map((r) => r.departamento.slug)
  },
)
