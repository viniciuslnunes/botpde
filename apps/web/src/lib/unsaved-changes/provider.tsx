'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useDialog } from '@torcida/ui'
import { UnsavedChangesContext } from './context'
import { NavigationGuard } from './navigation-guard'
import type { UnsavedChangeEntry, UnsavedChangesContextValue } from './types'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<UnsavedChangeEntry[]>([])
  const entriesRef = useRef(entries)
  const { open } = useDialog()
  const pendingConfirmRef = useRef<Promise<boolean> | null>(null)

  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  const upsert = useCallback((entry: UnsavedChangeEntry) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id)
      if (entry.changes.length === 0) {
        if (idx === -1) return prev
        return prev.filter((e) => e.id !== entry.id)
      }
      if (idx === -1) return [...prev, entry]
      const next = [...prev]
      next[idx] = entry
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setEntries((prev) => {
      if (!prev.some((e) => e.id === id)) return prev
      return prev.filter((e) => e.id !== id)
    })
  }, [])

  const confirmDiscard = useCallback((): Promise<boolean> => {
    const current = entriesRef.current
    if (current.length === 0) return Promise.resolve(true)

    if (pendingConfirmRef.current) return pendingConfirmRef.current

    const promise = new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (value: boolean) => {
        if (settled) return
        settled = true
        pendingConfirmRef.current = null
        resolve(value)
      }

      open(UnsavedChangesDialog, {
        entries: current,
        onConfirm: () => {
          setEntries([])
          settle(true)
        },
        onCancel: () => {
          settle(false)
        },
      })
    })

    pendingConfirmRef.current = promise
    return promise
  }, [open])

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({
      entries,
      upsert,
      remove,
      isDirty: entries.length > 0,
      confirmDiscard,
    }),
    [entries, upsert, remove, confirmDiscard],
  )

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <NavigationGuard />
    </UnsavedChangesContext.Provider>
  )
}

export { useUnsavedChangesContext, useOptionalUnsavedChangesContext } from './context'
