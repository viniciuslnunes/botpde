'use client'

import { useState, useTransition } from 'react'
import { toast } from '@torcida/ui'
import { Check, X } from 'lucide-react'
import { decidirMemoriaFato } from '@/app/portal/memoria/actions'
import { AdminRowActions } from '@/components/admin/ui'

export type MemoriaFatoAdminItem = {
  id: string
  diaIso: string
  conteudo: string
  visibilidade: 'PUBLICO' | 'TENANT'
  autorNome: string
  criadoEmLabel: string
}

export function MemoriaFilaClient({ fatos }: { fatos: MemoriaFatoAdminItem[] }) {
  const [motivoPorId, setMotivoPorId] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function decidir(id: string, decidir: 'aprovar' | 'rejeitar') {
    const motivo = motivoPorId[id]?.trim()
    if (decidir === 'rejeitar' && !motivo) {
      toast.error('Diga o motivo da recusa.')
      return
    }
    setPendingId(id)
    start(async () => {
      const res = await decidirMemoriaFato({ id, decidir, motivo })
      setPendingId(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(decidir === 'aprovar' ? 'Fato na linha do tempo.' : 'Fato recusado.')
    })
  }

  return (
    <tbody>
      {fatos.map((f) => (
        <tr key={f.id} className="border-t border-[rgb(var(--border))]">
          <td className="whitespace-nowrap px-3 py-3 font-mono text-xs tabular-nums">{f.diaIso}</td>
          <td className="max-w-sm px-3 py-3">
            <p className="line-clamp-3 text-[rgb(var(--foreground))]">{f.conteudo}</p>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              {f.autorNome} · {f.criadoEmLabel} · {f.visibilidade === 'PUBLICO' ? 'Público' : 'Unidade'}
            </p>
          </td>
          <td className="px-3 py-3">
            <label className="sr-only" htmlFor={`motivo-${f.id}`}>
              Motivo da recusa
            </label>
            <input
              id={`motivo-${f.id}`}
              value={motivoPorId[f.id] ?? ''}
              onChange={(e) => setMotivoPorId((prev) => ({ ...prev, [f.id]: e.target.value }))}
              placeholder="Motivo se recusar"
              className="w-full min-w-[10rem] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1.5 text-sm"
            />
          </td>
          <td className="px-3 py-3 text-right">
            <AdminRowActions
              ariaLabel={`Decidir fato de ${f.autorNome}`}
              items={[
                {
                  id: 'aprovar',
                  label: pending && pendingId === f.id ? 'Salvando…' : 'Aprovar',
                  icon: Check,
                  tone: 'success',
                  disabled: pending,
                  onSelect: () => decidir(f.id, 'aprovar'),
                },
                {
                  id: 'rejeitar',
                  label: 'Recusar',
                  icon: X,
                  tone: 'danger',
                  disabled: pending,
                  onSelect: () => decidir(f.id, 'rejeitar'),
                },
              ]}
            />
          </td>
        </tr>
      ))}
    </tbody>
  )
}
