'use client'

import { createContext, useCallback, useContext, useId, useEffect, useState } from 'react'
import { useLinkStatus } from 'next/link'

type ReportFn = (id: string, pending: boolean) => void

const NavPendingContext = createContext<ReportFn | null>(null)

export function NavPendingProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState(false)
  const activeIds = useState(() => new Set<string>())[0]

  const report = useCallback((id: string, isPending: boolean) => {
    if (isPending) {
      activeIds.add(id)
    } else {
      activeIds.delete(id)
    }
    setPending(activeIds.size > 0)
  }, [activeIds])

  return (
    <NavPendingContext value={report}>
      {pending && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-[rgb(var(--primary)_/_0.15)]"
          aria-hidden
        >
          <div className="h-full w-1/3 animate-[nav-progress_1s_ease-in-out_infinite] bg-[rgb(var(--primary))]" />
        </div>
      )}
      {children}
    </NavPendingContext>
  )
}

export function NavLinkStatusReporter() {
  const id = useId()
  const report = useContext(NavPendingContext)
  const { pending } = useLinkStatus()

  useEffect(() => {
    if (!report) return
    report(id, pending)
    return () => report(id, false)
  }, [id, pending, report])

  return null
}

/** Acopla a barra de progresso do topo a um `pending` arbitrário (ex.: Server
 * Action de troca de torcida) — mesma UX de carregamento do `next/link`. */
export function useReportNavPending(pending: boolean) {
  const id = useId()
  const report = useContext(NavPendingContext)

  useEffect(() => {
    if (!report) return
    report(id, pending)
    return () => report(id, false)
  }, [id, pending, report])
}
