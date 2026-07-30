'use client'

import {
  AccessUserPanel,
  type AccessDepartamentoOpt,
  type AccessRoleOpt,
  type AccessUsuario,
} from '@/components/admin/access-user-panel'
import { useGuardedRouter } from '@/lib/unsaved-changes'

export interface AccessUserPanelRouteProps {
  usuario: AccessUsuario
  roles: AccessRoleOpt[]
  departamentos: AccessDepartamentoOpt[]
  tipoSede: string
  /** Volta para a listagem preservando filtros, ordenação e página. */
  voltarHref: string
}

/**
 * Casca client do painel de acesso: o painel precisa de um `onClose` (função não
 * atravessa a fronteira RSC), e a volta é uma navegação para a listagem com o
 * estado dela intacto.
 */
export function AccessUserPanelRoute({
  usuario,
  roles,
  departamentos,
  tipoSede,
  voltarHref,
}: AccessUserPanelRouteProps) {
  const router = useGuardedRouter()

  return (
    <AccessUserPanel
      key={usuario.id}
      usuario={usuario}
      roles={roles}
      departamentos={departamentos}
      tipoSede={tipoSede}
      onClose={() => {
        void router.unsafe.replace(voltarHref, { scroll: false })
      }}
    />
  )
}
