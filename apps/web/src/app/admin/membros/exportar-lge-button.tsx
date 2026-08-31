'use client'

import { useTransition } from 'react'
import { exportarCadastroLgeCsv } from './actions'
import { toast } from '@torcida/ui/services/toast'

export function ExportarLgeButton() {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await exportarCadastroLgeCsv()
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = result.filename
          a.click()
          URL.revokeObjectURL(url)
          toast.success('Exportação LGE concluída.')
        })
      }
      className="app-touch-target rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
    >
      {pending ? 'Exportando…' : 'Exportar LGE (CSV)'}
    </button>
  )
}
