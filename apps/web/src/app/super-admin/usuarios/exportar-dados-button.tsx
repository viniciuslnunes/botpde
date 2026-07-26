'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'

export function ExportarDadosButton({ userId, nome }: { userId: string; nome: string | null }) {
  const [pending, setPending] = useState(false)

  async function exportar() {
    if (!window.confirm(`Exportar dados de "${nome ?? 'este usuário'}"? A ação fica registrada em auditoria.`)) {
      return
    }
    setPending(true)
    try {
      const res = await fetch(`/api/super-admin/usuarios/${userId}/exportar`)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Erro ao exportar dados.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dados-usuario-${userId}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Dados exportados.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao exportar dados.')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={exportar}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Exportar dados (LGPD)
    </button>
  )
}
