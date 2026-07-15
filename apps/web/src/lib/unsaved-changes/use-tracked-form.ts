'use client'

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { useUnsavedChangesContext } from './context'
import { diffFormChanges, serializeFormValues } from './form-snapshot'
import { useUnsavedChanges } from './use-unsaved-changes'

type Options = {
  id?: string
  title: string
  /** Mapa name → rótulo amigável. */
  labels?: Record<string, string>
  /** Se false, não registra (form oculto/desmontado logicamente). */
  enabled?: boolean
}

type TrackedFormApi = {
  formRef: RefObject<HTMLFormElement | null>
  markPristine: () => void
  isDirty: boolean
  changes: string[]
}

/**
 * Observa um `<form>` nativo e registra alterações vs. snapshot inicial.
 */
export function useTrackedForm({
  id: idProp,
  title,
  labels,
  enabled = true,
}: Options): TrackedFormApi {
  const reactId = useId()
  const id = idProp ?? `tracked-form-${reactId}`
  const formRef = useRef<HTMLFormElement | null>(null)
  const baselineRef = useRef<Map<string, string[]> | null>(null)
  const [changes, setChanges] = useState<string[]>([])
  const { remove } = useUnsavedChangesContext()

  const captureBaseline = useCallback(() => {
    const form = formRef.current
    if (!form) return
    baselineRef.current = serializeFormValues(form)
    setChanges([])
  }, [])

  const recompute = useCallback(() => {
    const form = formRef.current
    if (!form || !enabled) {
      setChanges([])
      return
    }
    if (!baselineRef.current) {
      baselineRef.current = serializeFormValues(form)
      setChanges([])
      return
    }
    setChanges(diffFormChanges(form, baselineRef.current, labels))
  }, [enabled, labels])

  const markPristine = useCallback(() => {
    captureBaseline()
    remove(id)
  }, [captureBaseline, id, remove])

  useEffect(() => {
    const form = formRef.current
    if (!form || !enabled) {
      remove(id)
      setChanges([])
      return
    }

    // Baseline após paint (valores default já aplicados).
    const raf = requestAnimationFrame(() => {
      if (!baselineRef.current) captureBaseline()
      else recompute()
    })

    const onAny = () => recompute()
    form.addEventListener('input', onAny)
    form.addEventListener('change', onAny)

    return () => {
      cancelAnimationFrame(raf)
      form.removeEventListener('input', onAny)
      form.removeEventListener('change', onAny)
    }
  }, [enabled, id, remove, captureBaseline, recompute])

  useUnsavedChanges({
    id,
    title,
    isDirty: enabled && changes.length > 0,
    changes: enabled ? changes : [],
  })

  return { formRef, markPristine, isDirty: changes.length > 0, changes }
}
