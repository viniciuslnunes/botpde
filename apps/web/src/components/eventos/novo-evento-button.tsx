'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CriarEventoForm, type SedeOption } from '@/components/admin/evento-forms'
import { EventoFormDrawer } from '@/components/eventos/evento-form-drawer'
import { AppButton } from '@/components/ui/button'
import type { PartidaOption } from '@/lib/partidas'
import type { DonoOperacionalOption } from '@/lib/evento-dono'

export function NovoEventoButton({
  defaultTipo,
  sedes,
  partidas = [],
  projetos = [],
  donos = [],
  departamentoSlug,
  temAfiliacao = true,
  redirectTo = '/admin/eventos',
  label = 'Novo evento',
}: {
  defaultTipo?: string
  sedes: SedeOption[]
  partidas?: PartidaOption[]
  projetos?: Array<{ id: string; titulo: string; departamentoNome: string }>
  /** Departamentos + frentes para escolher o dono da operação (Agenda). */
  donos?: DonoOperacionalOption[]
  /** Hub thin: o evento já nasce do departamento desta tela. */
  departamentoSlug?: string
  temAfiliacao?: boolean
  redirectTo?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <AppButton variant="primary" icon={Plus} type="button" onClick={() => setOpen(true)}>
        {label}
      </AppButton>
      <EventoFormDrawer open={open} onClose={() => setOpen(false)} title={label}>
        <CriarEventoForm
          defaultTipo={defaultTipo ?? 'GERAL'}
          sedes={sedes}
          partidas={partidas}
          projetos={projetos}
          donos={donos}
          departamentoSlug={departamentoSlug}
          temAfiliacao={temAfiliacao}
          redirectTo={redirectTo}
          onCancel={() => setOpen(false)}
        />
      </EventoFormDrawer>
    </>
  )
}
