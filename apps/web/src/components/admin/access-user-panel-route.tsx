'use client'

import {
  AccessUserPanel,
  type AccessDepartamentoOpt,
  type AccessRoleOpt,
  type AccessUsuario,
  type OwnerOcupadoPor,
} from '@/components/admin/access-user-panel'
import { useGuardedRouter } from '@/lib/unsaved-changes'

export interface AccessUserPanelRouteProps {
  usuario: AccessUsuario
  roles: AccessRoleOpt[]
  departamentos: AccessDepartamentoOpt[]
  tipoSede: string
  /** Volta para a listagem preservando filtros, ordenação e página. */
  voltarHref: string
  ownerOcupadoPor?: OwnerOcupadoPor | null
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
  ownerOcupadoPor = null,
}: AccessUserPanelRouteProps) {
  const router = useGuardedRouter()

  return (
    <AccessUserPanel
      key={usuario.id}
      usuario={usuario}
      roles={roles}
      departamentos={departamentos}
      tipoSede={tipoSede}
      ownerOcupadoPor={ownerOcupadoPor}
      onClose={() => {
        void router.unsafe.replace(voltarHref, { scroll: false })
      }}
    />
  )
}
