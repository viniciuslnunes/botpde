'use client'

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'

interface DialogEntry {
  id: string
  component: ComponentType<{ onClose: () => void; [key: string]: unknown }>
  props: Record<string, unknown>
}

interface DialogContextValue {
  open: <P extends Record<string, unknown>>(
    component: ComponentType<P & { onClose: () => void }>,
    props?: Omit<P, 'onClose'>,
  ) => string
  close: (id: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

interface ConfirmOptions {
  titulo: string
  descricao?: string
  labelConfirmar?: string
  labelCancelar?: string
  variante?: 'default' | 'destructive'
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<DialogEntry[]>([])

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

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        const id = crypto.randomUUID()
        setDialogs((prev) => [
          ...prev,
          {
            id,
            component: ConfirmDialog as unknown as DialogEntry['component'],
            props: {
              ...options,
              onConfirm: () => {
                setDialogs((prev) => prev.filter((d) => d.id !== id))
                resolve(true)
              },
              onCancel: () => {
                setDialogs((prev) => prev.filter((d) => d.id !== id))
                resolve(false)
              },
            },
          },
        ])
      })
    },
    [],
  )

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

// Dialog de confirmação padrão da plataforma
interface ConfirmDialogProps {
  titulo: string
  descricao?: string
  labelConfirmar?: string
  labelCancelar?: string
  variante?: 'default' | 'destructive'
  onConfirm: () => void
  onCancel: () => void
  onClose: () => void
}

function ConfirmDialog({
  titulo,
  descricao,
  labelConfirmar = 'Confirmar',
  labelCancelar = 'Cancelar',
  variante = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{titulo}</h2>
        {descricao && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{descricao}</p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {labelCancelar}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              variante === 'destructive'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[var(--color-primary)] hover:opacity-90'
            }`}
          >
            {labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
