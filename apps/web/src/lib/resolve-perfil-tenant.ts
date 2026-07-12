import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'

/**
 * Tenant do perfil social na tela. Em produção (Railway/apex) o host pode não
 * trazer subdomínio; o cookie pode faltar ou apontar para outra torcida.
 * Para o próprio perfil, faz fallback ao vínculo APROVADO do usuário.
 */
export async function resolvePerfilTenantForUser(
  profileUserId: string,
  viewerId: string,
): Promise<Tenant | null> {
  const fromHost = await getTenantFromHost()

  if (fromHost) {
    if (profileUserId !== viewerId) return fromHost

    const membro: { status: string } | null = await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: fromHost.id, userId: profileUserId } },
      select: { status: true },
    })
    if (membro?.status === 'APROVADO') return fromHost
  }

  if (profileUserId === viewerId) {
    const vinculo: { tenant: Tenant } | null = await db.saasMembro.findFirst({
      where: { userId: profileUserId, status: 'APROVADO' },
      orderBy: { criadoEm: 'desc' },
      select: { tenant: true },
    })
    if (vinculo?.tenant.ativo) return vinculo.tenant
  }

  return fromHost
}
