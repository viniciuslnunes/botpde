'use client'

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { useUnsavedChangesContext } from './context'
import { diffFormChanges, serializeFormValues } from './form-snapshot'
import { useUnsavedChanges } from './use-unsaved-changes'
import { useLatestRef } from '@/lib/use-latest-ref'

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

function sameChangeList(a: string[], b: string[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
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

  // Inline `labels={{…}}` nos call sites cria objeto novo a cada render.
  // Se entrar nas deps do effect, com `enabled:false` vira loop:
  // effect → setChanges([]) → re-render → labels novo → effect… (menu admin morto).
  const labelsRef = useLatestRef(labels)

  const setChangesIfChanged = useCallback((next: string[]) => {
    setChanges((prev) => (sameChangeList(prev, next) ? prev : next))
  }, [])

  const captureBaseline = useCallback(() => {
    const form = formRef.current
    if (!form) return
    baselineRef.current = serializeFormValues(form)
    setChangesIfChanged([])
  }, [setChangesIfChanged])

  const recompute = useCallback(() => {
    const form = formRef.current
    if (!form || !enabled) {
      setChangesIfChanged([])
      return
    }
    if (!baselineRef.current) {
      baselineRef.current = serializeFormValues(form)
      setChangesIfChanged([])
      return
    }
    setChangesIfChanged(diffFormChanges(form, baselineRef.current, labelsRef.current))
  }, [enabled, setChangesIfChanged, labelsRef])

  const markPristine = useCallback(() => {
    captureBaseline()
    remove(id)
  }, [captureBaseline, id, remove])

  useEffect(() => {
    const form = formRef.current
    if (!form || !enabled) {
      remove(id)
      setChangesIfChanged([])
      return
    }

    // Baseline após paint (valores default já aplicados).
    const raf = requestAnimationFrame(() => {
      if (!baselineRef.current) captureBaseline()
      else recompute()
    })

    const onAny = () => recompute()
    const onBaselinePatch = (e: Event) => {
      const detail = (e as CustomEvent<Record<string, string>>).detail
      if (!detail || !baselineRef.current) return
      for (const [key, value] of Object.entries(detail)) {
        baselineRef.current.set(key, [value])
      }
      recompute()
    }
    form.addEventListener('input', onAny)
    form.addEventListener('change', onAny)
    form.addEventListener('torcida:baseline-patch', onBaselinePatch)

    return () => {
      cancelAnimationFrame(raf)
      form.removeEventListener('input', onAny)
      form.removeEventListener('change', onAny)
      form.removeEventListener('torcida:baseline-patch', onBaselinePatch)
    }
  }, [enabled, id, remove, captureBaseline, recompute, setChangesIfChanged])

  useUnsavedChanges({
    id,
    title,
    isDirty: enabled && changes.length > 0,
    changes: enabled ? changes : [],
  })

  return { formRef, markPristine, isDirty: changes.length > 0, changes }
}
