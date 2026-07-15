'use client'

import { useEffect } from 'react'
import { useUnsavedChangesContext } from './context'

type Options = {
  id: string
  title: string
  isDirty: boolean
  changes: string[]
}

/**
 * Registra um editor client-heavy no registry de alterações não salvas.
 * Remove a entry no unmount ou quando `isDirty` / `changes` ficam vazios.
 */
export function useUnsavedChanges({ id, title, isDirty, changes }: Options): void {
  const { upsert, remove } = useUnsavedChangesContext()
  const changesKey = changes.join('\u0001')

  useEffect(() => {
    if (!isDirty || changes.length === 0) {
      remove(id)
      return
    }
    upsert({ id, title, changes: changesKey.split('\u0001') })
    // changesKey estabiliza a dependência quando o array é recriado com o mesmo conteúdo
    // eslint-disable-next-line react-hooks/exhaustive-deps -- changes via changesKey
  }, [id, title, isDirty, changesKey, upsert, remove])

  useEffect(() => {
    return () => remove(id)
  }, [id, remove])
}
