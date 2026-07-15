'use client'

import type { UnsavedChangeEntry } from './types'

type Props = {
  entries: UnsavedChangeEntry[]
  onConfirm: () => void
  onCancel: () => void
  onClose: () => void
}

export function UnsavedChangesDialog({ entries, onConfirm, onCancel, onClose }: Props) {
  const handleCancel = () => {
    onCancel()
    onClose()
  }
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={handleCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="unsaved-changes-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Alterações não salvas
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Há alterações em andamento. Se sair agora, elas serão descartadas.
        </p>

        <ul className="mt-4 max-h-60 space-y-3 overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{entry.title}</p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                {entry.changes.map((change) => (
                  <li key={`${entry.id}-${change}`}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Continuar editando
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Descartar e sair
          </button>
        </div>
      </div>
    </div>
  )
}
