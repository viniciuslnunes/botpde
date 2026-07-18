'use client'

import { Download } from 'lucide-react'
import type { EmbarqueRow } from '@/components/eventos/lista-embarque'

export function ExportEmbarqueCsvButton({
  titulo,
  itens,
  filename,
}: {
  titulo: string
  itens: EmbarqueRow[]
  filename?: string
}) {
  function exportar() {
    const header = ['nome', 'email', 'status', 'checkin']
    const lines = itens.map((i) =>
      [
        i.nome,
        i.email,
        i.status,
        i.checkedInAt ? new Date(i.checkedInAt).toISOString() : '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [`# ${titulo}`, header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename ?? `embarque-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (itens.length === 0) return null

  return (
    <button
      type="button"
      onClick={exportar}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
    >
      <Download className="h-3.5 w-3.5" />
      Exportar CSV
    </button>
  )
}
