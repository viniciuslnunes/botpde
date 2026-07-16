'use client'

import { useTransition } from 'react'
import { exportarLancamentosCsv } from '@/app/admin/financeiro/actions'
import { toast } from '@torcida/ui/services/toast'

export function ExportarFinanceiroButton() {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await exportarLancamentosCsv()
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
          toast.success('Exportação concluída.')
        })
      }
      className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
    >
      {pending ? 'Exportando…' : 'Exportar CSV'}
    </button>
  )
}
