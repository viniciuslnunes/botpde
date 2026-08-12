'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  calculateEffectivePermissions,
  hasPermission,
  type PERMISSIONS,
  // Import direto do módulo — ver nota em services/theme.tsx.
} from '@torcida/types/permissions'

type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

interface PermissionContextValue {
  permissions: string[]
  can: (permission: Permission | string) => boolean
  isOwner: boolean
  isAdmin: boolean
}

const PermissionContext = createContext<PermissionContextValue>({
  permissions: [],
  can: () => false,
  isOwner: false,
  isAdmin: false,
})

interface PermissionProviderProps {
  children: ReactNode
  rolePermissions: string[]
  overrides: { permission: string; granted: boolean }[]
  systemRole?: string
}

export function PermissionProvider({
  children,
  rolePermissions,
  overrides,
  systemRole,
}: PermissionProviderProps) {
  const permissions = calculateEffectivePermissions(rolePermissions, overrides)
  const isOwner = systemRole === 'owner'
  const isAdmin = isOwner || systemRole === 'admin'

  function can(permission: Permission | string): boolean {
    if (isOwner) return true
    return hasPermission(permissions, permission)
  }

  return (
    <PermissionContext.Provider value={{ permissions, can, isOwner, isAdmin }}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermission(permission?: Permission | string) {
  const ctx = useContext(PermissionContext)
  if (permission !== undefined) {
    return ctx.can(permission)
  }
  return ctx
}

// Componente guard declarativo: só renderiza filhos se tiver a permissão
interface PermissionGateProps {
  permission: Permission | string
  children: ReactNode
  fallback?: ReactNode
}

export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const can = usePermission(permission)
  return can ? <>{children}</> : <>{fallback}</>
}
