'use client'

import type { UnsavedChangeEntry } from './types'
import { AlertTriangle } from 'lucide-react'

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
      className="torcida-dialog-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onClick={handleCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-desc"
        className="torcida-dialog-panel flex w-full max-w-md flex-col rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-[0_1px_2px_rgb(0_0_0_/_0.04),0_24px_48px_-20px_rgb(0_0_0_/_0.35)] sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/12 text-red-600 dark:text-red-400"
            aria-hidden
          >
            <AlertTriangle className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id="unsaved-changes-title"
              className="text-base font-semibold tracking-tight text-[rgb(var(--foreground))] sm:text-lg"
            >
              Alterações não salvas
            </h2>
            <p
              id="unsaved-changes-desc"
              className="mt-1.5 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]"
            >
              Há alterações em andamento. Se sair agora, elas serão descartadas.
            </p>
          </div>
        </div>

        <ul className="mt-4 max-h-60 space-y-2.5 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2.5"
            >
              <p className="text-sm font-medium text-[rgb(var(--foreground))]">{entry.title}</p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                {entry.changes.map((change) => (
                  <li key={`${entry.id}-${change}`}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] sm:py-2"
          >
            Continuar editando
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 sm:py-2"
          >
            Descartar e sair
          </button>
        </div>
      </div>
    </div>
  )
}
