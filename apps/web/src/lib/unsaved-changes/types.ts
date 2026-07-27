export type UnsavedChangeEntry = {
  id: string
  title: string
  changes: string[]
}

export type UnsavedChangesContextValue = {
  entries: UnsavedChangeEntry[]
  upsert: (entry: UnsavedChangeEntry) => void
  remove: (id: string) => void
  isDirty: boolean
  confirmDiscard: () => Promise<boolean>
  /**
   * Libera o próximo hard-navigation (`beforeunload` / `location.assign`)
   * de forma síncrona — use após salvar com sucesso, antes de redirecionar.
   */
  allowUnload: () => void
  /** Leitura síncrona do flag setado por `allowUnload` (para o NavigationGuard). */
  isUnloadAllowed: () => boolean
}
