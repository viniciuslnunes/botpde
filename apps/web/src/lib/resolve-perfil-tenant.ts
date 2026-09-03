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

  /**
   * Vínculos SOCIO da pessoa, do mais novo para o mais antigo.
   *
   * Era um `findFirst` sem filtro de tenant: elegia a associação **mais
   * recente** da plataforma inteira como casa do perfil. Numa worktree isso
   * faz um portal de unidade ganhar da Sede só por ter nascido depois — foi
   * assim que um vínculo fabricado numa subsede (ver
   * `limparVinculoHerdadoDaPromocao` em `lib/lideranca.ts`) passou a rotular o
   * perfil com o nome da unidade, e a renderizar o `PerfilMembro` vazio de lá:
   * "Perfil privado", "Novato", 0 publicações (medido em HML, 2026-09-03).
   *
   * `tenant: { ativo: true }` entra na query em vez de checar depois: com o
   * teste do lado de fora, um vínculo recente em torcida inativa descartava
   * **todos** os outros e derrubava o perfil no host.
   */
  const socios: Array<{ tenantId: string; tenant: Tenant }> = await db.saasMembro.findMany({
    where: {
      userId: profileUserId,
      status: 'APROVADO',
      tipo: 'SOCIO',
      tenant: { ativo: true },
    },
    orderBy: { criadoEm: 'desc' },
    select: { tenantId: true, tenant: true },
  })

  if (socios.length === 1) return socios[0].tenant
  if (socios.length > 1) {
    // Desempate por conteúdo, não por data: a casa do perfil é o tenant onde o
    // `PerfilMembro` existe de verdade — é ele que a tela vai ler. Sem nenhum,
    // cai na recência de antes.
    const comPerfil: Array<{ tenantId: string }> = await db.perfilMembro.findMany({
      where: { userId: profileUserId, tenantId: { in: socios.map((s) => s.tenantId) } },
      select: { tenantId: true },
    })
    const tenantsComPerfil = new Set(comPerfil.map((p) => p.tenantId))
    const escolhido = socios.find((s) => tenantsComPerfil.has(s.tenantId)) ?? socios[0]
    return escolhido.tenant
  }

  // Torcedor global: CN do clube (não herdar Gaviões do host/cookie).
  // `afiliacaoId` basta — exigir onboarding concluído fazia o visitante cair
  // no tenant de quem está logado e o perfil saía rotulado como a TO alheia.
  const perfil: { afiliacaoId: string | null } | null = await db.perfilTorcedor.findUnique({
    where: { userId: profileUserId },
    select: { afiliacaoId: true },
  })
  if (perfil?.afiliacaoId) {
    const { id } = await getOrCreateComunidadeNacionalTenant(perfil.afiliacaoId)
    const sintetico: Tenant | null = await db.tenant.findUnique({ where: { id } })
    if (sintetico?.ativo) return sintetico
  }

  // Sem clube e sem ficha: visitante herda o host; o próprio perfil, o cookie.
  if (profileUserId !== viewerId && fromHost) return fromHost

  return fromHost
}
