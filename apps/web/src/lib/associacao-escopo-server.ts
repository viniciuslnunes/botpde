import 'server-only'
import { cache } from 'react'
import { db, type Tenant } from '@torcida/db'
import { formatNomeTorcida } from '@torcida/types'
import { getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import { escolherTenantCarteirinha } from '@/lib/associacao-escopo'

export const resolverTenantCarteirinhaId = cache(async function resolverTenantCarteirinhaId(
  tenantAtualId: string,
  userId: string,
): Promise<string> {
  const raizId = await resolverTenantRaizId(tenantAtualId)
  const worktree = await getTorcidaLineageTenantIds(raizId)

  type SocioLite = { tenantId: string; espelhado: boolean }
  const socios: SocioLite[] = await db.saasMembro.findMany({
    where: {
      userId,
      tenantId: { in: worktree },
      tipo: 'SOCIO',
      status: 'APROVADO',
      desligadoEm: null,
    },
    select: { tenantId: true, espelhado: true },
  })

  return escolherTenantCarteirinha({
    tenantAtualId,
    raizId,
    sociosAprovados: socios,
  })
})

/** Troca o tenant do host pelo da carteirinha quando o sócio vive na Sede/irmã. */
export async function carregarTenantCarteirinha(
  tenantAtual: Tenant,
  userId: string,
): Promise<Tenant> {
  const id = await resolverTenantCarteirinhaId(tenantAtual.id, userId)
  if (id === tenantAtual.id) return tenantAtual

  const outro: Tenant | null = await db.tenant.findUnique({
    where: { id, ativo: true },
  })
  if (!outro) return tenantAtual
  return { ...outro, nome: formatNomeTorcida(outro.nome) }
}
