'use client'

import {
  useEffect,
  useRef,
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'
import { useTrackedForm } from './use-tracked-form'

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  title: string
  id?: string
  labels?: Record<string, string>
  enabled?: boolean
  children: ReactNode
  /** Chamado após o action/onSubmit — use para marcar pristine em sucesso. */
  onTrackedSubmit?: (event: FormEvent<HTMLFormElement>, markPristine: () => void) => void | Promise<void>
  formRef?: Ref<HTMLFormElement | null>
}

function assignRef(ref: Ref<HTMLFormElement | null> | undefined, node: HTMLFormElement | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(node)
  else ref.current = node
}

/**
 * `<form>` que registra automaticamente alterações não salvas.
 */
export function TrackedForm({
  title,
  id,
  labels,
  enabled = true,
  children,
  onTrackedSubmit,
  formRef: externalRef,
  action,
  ...rest
}: Props) {
  const { formRef, markPristine } = useTrackedForm({ id, title, labels, enabled })
  const markPristineRef = useRef(markPristine)

  useEffect(() => {
    markPristineRef.current = markPristine
  }, [markPristine])

  useEffect(() => {
    assignRef(externalRef, formRef.current)
  })

  return (
    <form
      {...rest}
      ref={(node) => {
        formRef.current = node
        assignRef(externalRef, node)
      }}
      action={action}
      onSubmit={
        onTrackedSubmit
          ? (event) => {
              void onTrackedSubmit(event, () => markPristineRef.current())
            }
          : undefined
      }
    >
      {children}
    </form>
  )
}
