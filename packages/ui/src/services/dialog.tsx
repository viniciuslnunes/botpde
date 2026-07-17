'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react'

interface DialogEntry {
  id: string
  component: ComponentType<{ onClose: () => void; [key: string]: unknown }>
  props: Record<string, unknown>
}

export type ConfirmVariant = 'default' | 'destructive' | 'success'

/** Por que o modal fechou sem confirmar. */
export type ConfirmDismissReason = 'cancel' | 'dismiss'

export interface ConfirmOptions {
  titulo: string
  descricao?: string
  labelConfirmar?: string
  labelCancelar?: string
  variante?: ConfirmVariant
  /**
   * Roda ao confirmar; o modal fica em loading até resolver.
   * `false` (ou throw) mantém o modal aberto.
   */
  execute?: () => Promise<boolean | void>
  /** Escape / clique no backdrop / botão Cancelar. */
  onDismiss?: (reason: ConfirmDismissReason) => void
}

interface DialogContextValue {
  open: <P extends Record<string, unknown>>(
    component: ComponentType<P & { onClose: () => void }>,
    props?: Omit<P, 'onClose'>,
  ) => string
  close: (id: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<DialogEntry[]>([])
  const pendingConfirmRef = useRef<Promise<boolean> | null>(null)

  const open = useCallback(
    <P extends Record<string, unknown>>(
      component: ComponentType<P & { onClose: () => void }>,
      props?: Omit<P, 'onClose'>,
    ): string => {
      const id = crypto.randomUUID()
      setDialogs((prev) => [
        ...prev,
        {
          id,
          component: component as DialogEntry['component'],
          props: props ?? {},
        },
      ])
      return id
    },
    [],
  )

  const close = useCallback((id: string) => {
    setDialogs((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    if (pendingConfirmRef.current) return pendingConfirmRef.current

    const promise = new Promise<boolean>((resolve) => {
      const id = crypto.randomUUID()
      const settle = (value: boolean) => {
        pendingConfirmRef.current = null
        setDialogs((prev) => prev.filter((d) => d.id !== id))
        resolve(value)
      }
      setDialogs((prev) => [
        ...prev,
        {
          id,
          component: ConfirmDialog as unknown as DialogEntry['component'],
          props: {
            ...options,
            onConfirm: () => settle(true),
            onCancel: (reason: ConfirmDismissReason) => {
              options.onDismiss?.(reason)
              settle(false)
            },
          },
        },
      ])
    })

    pendingConfirmRef.current = promise
    return promise
  }, [])

  return (
    <DialogContext.Provider value={{ open, close, confirm }}>
      {children}
      {dialogs.map(({ id, component: Component, props }) => (
        <Component key={id} {...props} onClose={() => close(id)} />
      ))}
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog deve ser usado dentro de DialogProvider')
  return ctx
}

interface ConfirmDialogProps extends ConfirmOptions {
  onConfirm: () => void
  onCancel: (reason: ConfirmDismissReason) => void
  onClose: () => void
}

const VARIANT_UI: Record<
  ConfirmVariant,
  {
    icon: typeof Info
    iconWrap: string
    confirmBtn: string
  }
> = {
  default: {
    icon: Info,
    iconWrap: 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]',
    confirmBtn:
      'bg-[rgb(var(--primary))] text-white hover:opacity-90 focus-visible:outline-[rgb(var(--primary))]',
  },
  destructive: {
    icon: AlertTriangle,
    iconWrap: 'bg-red-500/12 text-red-600 dark:text-red-400',
    confirmBtn: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
  },
  success: {
    icon: CheckCircle2,
    iconWrap: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
    confirmBtn:
      'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600',
  },
}

function ConfirmDialog({
  titulo,
  descricao,
  labelConfirmar = 'Confirmar',
  labelCancelar = 'Cancelar',
  variante = 'default',
  execute,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [busy, setBusy] = useState(false)
  const ui = VARIANT_UI[variante]
  const Icon = ui.icon
  const focusCancelFirst = variante === 'destructive'

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const target = focusCancelFirst ? cancelRef.current : confirmRef.current
    target?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [focusCancelFirst])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel('dismiss')
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  async function handleConfirm() {
    if (busy) return
    if (!execute) {
      onConfirm()
      return
    }
    setBusy(true)
    try {
      const result = await execute()
      if (result === false) {
        setBusy(false)
        return
      }
      onConfirm()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div
      className="torcida-dialog-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel('dismiss')
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descricao ? descId : undefined}
        aria-busy={busy}
        tabIndex={-1}
        className="torcida-dialog-panel flex w-full max-w-md flex-col rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-[0_1px_2px_rgb(0_0_0_/_0.04),0_24px_48px_-20px_rgb(0_0_0_/_0.35)] outline-none sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ui.iconWrap}`}
            aria-hidden
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id={titleId}
              className="text-balance text-base font-semibold tracking-tight text-[rgb(var(--foreground))] sm:text-lg"
            >
              {titulo}
            </h2>
            {descricao ? (
              <p
                id={descId}
                className="mt-1.5 whitespace-pre-line text-pretty text-sm leading-relaxed text-[rgb(var(--foreground-muted))]"
              >
                {descricao}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={() => onCancel('cancel')}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:cursor-not-allowed disabled:opacity-50 sm:py-2"
          >
            {labelCancelar}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-70 sm:py-2 ${ui.confirmBtn}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? 'Aguarde…' : labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
