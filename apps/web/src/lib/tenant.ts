import { headers } from 'next/headers'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { env } from '@/lib/env'

/**
 * Resolve o tenant a partir do hostname da requisição.
 * Ex: pde-gavioes.torcida.app → slug "pde-gavioes"
 * Em desenvolvimento: usa variável TENANT_SLUG como fallback.
 */
export async function getTenantFromHost(): Promise<Tenant | null> {
  const headersList = await headers()
  const host = headersList.get('host') ?? ''

  // Extrai o slug do subdomínio
  const slug = extractSlugFromHost(host)

  if (!slug) return null

  return db.tenant.findUnique({
    where: { slug, ativo: true },
  })
}

function extractSlugFromHost(host: string): string | null {
  // Remove porta (desenvolvimento)
  const hostname = host.split(':')[0]

  // Localhost → usa sempre TENANT_SLUG
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return env.TENANT_SLUG ?? null
  }

  // Domínio próprio com subdomínio real: pde.torcida.app → "pde"
  // (ROOT_DOMAIN também pode ser lvh.me em dev, que resolve *.lvh.me pra
  // 127.0.0.1 sem precisar de DNS — permite testar subdomínio sem domínio próprio)
  const rootDomain = env.ROOT_DOMAIN
  const parts = hostname.split('.')

  if (rootDomain && hostname.endsWith(`.${rootDomain}`)) {
    // Subdomínio real do nosso domínio
    return parts[0]
  }

  // Qualquer outro domínio (Railway, Vercel preview, domínio próprio sem subdomínio)
  // → usa TENANT_SLUG como override explícito
  return env.TENANT_SLUG ?? null
}

/**
 * Retorna as permissões efetivas de um usuário em um tenant.
 * Usado nos layouts de /admin para verificar acesso.
 */
export async function getUserPermissionsInTenant(userId: string, tenantId: string) {
  const [userRoles, userPermissions] = await Promise.all([
    db.userRole.findMany({
      where: { userId, tenantId },
      include: { role: true },
    }),
    db.userPermission.findMany({
      where: { userId, tenantId },
    }),
  ])

  // Union de todas as permissões dos cargos
  const rolePermissions = userRoles.flatMap(
    (ur: { role: { permissions: string[] } }) => ur.role.permissions,
  )

  return {
    rolePermissions,
    overrides: userPermissions.map((up: { permission: string; granted: boolean }) => ({
      permission: up.permission,
      granted: up.granted,
    })),
    systemRole:
      userRoles.find((ur: { role: { isSystem: boolean; nome: string } }) => ur.role.isSystem)
        ?.role.nome ?? null,
  }
}
