'use client'

import { createContext, useContext } from 'react'
import type { UnsavedChangesContextValue } from './types'

export const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

export function useUnsavedChangesContext(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext)
  if (!ctx) {
    throw new Error('useUnsavedChangesContext deve ser usado dentro de UnsavedChangesProvider')
  }
  return ctx
}

export function useOptionalUnsavedChangesContext(): UnsavedChangesContextValue | null {
  return useContext(UnsavedChangesContext)
}
