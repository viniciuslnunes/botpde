import {
  calculateEffectivePermissions,
  hasAdminAreaAccess,
} from '@torcida/types'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import {
  listarVinculosAprovadosDoUsuario,
  type TorcidaOpcao,
} from '@/lib/tenant-context'

/**
 * Vínculos APROVADO/SOCIO em que o usuário tem área admin (`hasAdminAreaAccess`).
 * Usado no switcher "Torcida ativa" do admin — não altera
 * `listarVinculosAprovadosDoUsuario` (seletor de contexto de sócio).
 */
export async function listarVinculosAdminDoUsuario(userId: string): Promise<TorcidaOpcao[]> {
  const vinculos = await listarVinculosAprovadosDoUsuario(userId)
  if (vinculos.length === 0) return []

  const comAcesso: TorcidaOpcao[] = []
  for (const v of vinculos) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, v.id)
    const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
    if (hasAdminAreaAccess(efetivas)) comAcesso.push(v)
  }
  return comAcesso
}
