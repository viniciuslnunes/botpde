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
}
