import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { getOrCreateComunidadeNacionalTenant } from '@/lib/comunidade-contexto'
import { getTenantFromHost } from '@/lib/tenant'

/**
 * Tenant do perfil social na tela.
 *
 * - Sócio / torcedor com vínculo APROVADO no host → tenant da TO (PerfilMembro vive lá).
 * - Torcedor global (só `PerfilTorcedor`, sem SaasMembro) → tenant sintético da
 *   Comunidade Nacional do clube — nunca o `TENANT_SLUG`/cookie de uma TO alheia.
 * - Fallback: vínculo SOCIO APROVADO do perfil visitado, depois host.
 */
export async function resolvePerfilTenantForUser(
  profileUserId: string,
  viewerId: string,
): Promise<Tenant | null> {
  const fromHost = await getTenantFromHost()

  if (fromHost) {
    const membroHost: { status: string; tipo: string } | null = await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: fromHost.id, userId: profileUserId } },
      select: { status: true, tipo: true },
    })
    // SOCIO e TORCEDOR da TO guardam PerfilMembro nesse tenant.
    if (membroHost?.status === 'APROVADO') return fromHost
  }

  const socio: { tenant: Tenant } | null = await db.saasMembro.findFirst({
    where: { userId: profileUserId, status: 'APROVADO', tipo: 'SOCIO' },
    orderBy: { criadoEm: 'desc' },
    select: { tenant: true },
  })
  if (socio?.tenant.ativo) return socio.tenant

  // Torcedor global: CN do clube do onboarding (não herdar Gaviões do deploy).
  const perfil: {
    onboardingConcluidoEm: Date | null
    afiliacaoId: string | null
  } | null = await db.perfilTorcedor.findUnique({
    where: { userId: profileUserId },
    select: { onboardingConcluidoEm: true, afiliacaoId: true },
  })
  if (perfil?.onboardingConcluidoEm && perfil.afiliacaoId) {
    const { id } = await getOrCreateComunidadeNacionalTenant(perfil.afiliacaoId)
    const sintetico: Tenant | null = await db.tenant.findUnique({ where: { id } })
    if (sintetico?.ativo) return sintetico
  }

  // Visitante sem onboarding do perfil: mantém host se houver; senão null.
  if (profileUserId !== viewerId && fromHost) return fromHost

  return fromHost
}
