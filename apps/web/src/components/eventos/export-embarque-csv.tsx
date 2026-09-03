'use client'

import { Download } from 'lucide-react'
import type { EmbarqueRow } from '@/components/eventos/lista-embarque'
import { AppButton } from '@/components/ui/button'

export function ExportEmbarqueCsvButton({
  titulo,
  itens,
  filename,
  incluirPagamento = false,
  incluirTrechos = false,
}: {
  titulo: string
  itens: EmbarqueRow[]
  filename?: string
  incluirPagamento?: boolean
  /**
   * Acrescenta ida/volta. A planilha é o que a organização leva impressa para
   * a viagem — sem a volta, o documento não responde "quem ficou no estádio?",
   * que é metade da razão do controle existir.
   */
  incluirTrechos?: boolean
}) {
  function exportar() {
    const header = [
      'nome',
      'email',
      'status',
      ...(incluirPagamento ? ['pagamento'] : []),
      'checkin',
      ...(incluirTrechos ? ['ida', 'volta', 'fora_do_local'] : []),
    ]
    const lines = itens.map((i) => {
      const cols = [
        i.nome,
        i.email,
        i.status,
        ...(incluirPagamento ? [i.labelPagamento ?? ''] : []),
        i.checkedInAt ? new Date(i.checkedInAt).toISOString() : '',
        ...(incluirTrechos
          ? [
              i.embarcouIda ? 'sim' : 'nao',
              i.embarcouVolta ? 'sim' : 'nao',
              i.embarqueLonge ? 'sim' : '',
            ]
          : []),
      ]
      return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
    })
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
    <AppButton
      variant="none"
      icon={Download}
      type="button"
      onClick={exportar}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
    >
      Exportar CSV
    </AppButton>
  )
}
