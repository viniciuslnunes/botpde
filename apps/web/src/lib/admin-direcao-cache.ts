import 'server-only'

import { revalidateTag } from 'next/cache'

/** TTL dos aggregados do posto de comando admin (Onda 5 / Semana 3). */
export const ADMIN_DIRECAO_TTL = 45

export function tagAdminDirecao(tenantId: string): string {
  return `admin-direcao:${tenantId}`
}

/** Invalida counts/inbox cacheados após mutação reativa. */
export function invalidateAdminDirecao(tenantId: string): void {
  revalidateTag(tagAdminDirecao(tenantId), 'max')
}
