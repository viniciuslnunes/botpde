'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CriarEventoForm, type SedeOption } from '@/components/admin/evento-forms'
import { EventoFormDrawer } from '@/components/eventos/evento-form-drawer'

export function NovoEventoButton({
  defaultTipo,
  sedes,
  redirectTo = '/admin/eventos',
}: {
  defaultTipo?: string
  sedes: SedeOption[]
  redirectTo?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Novo evento
      </button>
      <EventoFormDrawer open={open} onClose={() => setOpen(false)} title="Novo evento">
        <CriarEventoForm
          defaultTipo={defaultTipo ?? 'GERAL'}
          sedes={sedes}
          redirectTo={redirectTo}
          onCancel={() => setOpen(false)}
        />
      </EventoFormDrawer>
    </>
  )
}
