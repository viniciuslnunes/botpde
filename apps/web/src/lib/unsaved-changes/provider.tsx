'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { useDialog } from '@torcida/ui'
import { UnsavedChangesContext } from './context'
import { NavigationGuard } from './navigation-guard'
import type { UnsavedChangeEntry, UnsavedChangesContextValue } from './types'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'

/** Se o dialog não assentar (crash/HMR), não segura a navegação para sempre. */
const CONFIRM_TIMEOUT_MS = 6_000

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<UnsavedChangeEntry[]>([])
  const entriesRef = useRef(entries)
  const { open, close } = useDialog()
  const pendingConfirmRef = useRef<Promise<boolean> | null>(null)
  const settleRef = useRef<((value: boolean) => void) | null>(null)
  const dialogIdRef = useRef<string | null>(null)
  const suppressUpsertRef = useRef(false)
  const allowUnloadRef = useRef(false)
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)

  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  const upsert = useCallback((entry: UnsavedChangeEntry) => {
    // Após "Descartar e sair", a página antiga pode continuar montada no exit
    // do Motion e tentar re-registrar dirty — ignora até a rota assentar.
    if (suppressUpsertRef.current) return
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
      let timeoutId = 0
      const settle = (value: boolean) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        settleRef.current = null
        pendingConfirmRef.current = null
        if (dialogIdRef.current) {
          close(dialogIdRef.current)
          dialogIdRef.current = null
        }
        resolve(value)
      }
      settleRef.current = settle

      dialogIdRef.current = open(UnsavedChangesDialog, {
        entries: current,
        onConfirm: () => {
          suppressUpsertRef.current = true
          setEntries([])
          settle(true)
        },
        onCancel: () => {
          settle(false)
        },
      })

      timeoutId = window.setTimeout(() => {
        // Fail-open: não trava o admin se o modal não responder.
        suppressUpsertRef.current = true
        setEntries([])
        settle(true)
      }, CONFIRM_TIMEOUT_MS)
    })

    pendingConfirmRef.current = promise
    return promise
  }, [open, close])

  /** Síncrono: o próximo `beforeunload` não bloqueia (redirect pós-salvar). */
  const allowUnload = useCallback(() => {
    allowUnloadRef.current = true
    suppressUpsertRef.current = true
    setEntries((prev) => (prev.length === 0 ? prev : []))
  }, [])

  const isUnloadAllowed = useCallback(() => allowUnloadRef.current, [])

  // Só quando a rota de fato muda (navegação concluída): limpa órfãos.
  useEffect(() => {
    if (pathnameRef.current === pathname) return
    pathnameRef.current = pathname

    if (dialogIdRef.current) {
      close(dialogIdRef.current)
      dialogIdRef.current = null
    }
    if (settleRef.current) {
      settleRef.current(true)
    }
    pendingConfirmRef.current = null
    setEntries((prev) => (prev.length === 0 ? prev : []))
    // Libera novos formulários da próxima página.
    suppressUpsertRef.current = false
    allowUnloadRef.current = false
  }, [pathname, close])

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({
      entries,
      upsert,
      remove,
      isDirty: entries.length > 0,
      confirmDiscard,
      allowUnload,
      isUnloadAllowed,
    }),
    [entries, upsert, remove, confirmDiscard, allowUnload, isUnloadAllowed],
  )

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <NavigationGuard />
    </UnsavedChangesContext.Provider>
  )
}

export { useUnsavedChangesContext, useOptionalUnsavedChangesContext } from './context'
