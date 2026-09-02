'use client'

import { useState, useTransition } from 'react'
import { MapPin, Save } from 'lucide-react'
import { reatribuirSedeMembro } from '@/app/admin/membros/actions'
import { runPersistAction } from '@/lib/toast-action'
import { AppButton } from '@/components/ui/button'

type SedeOption = { id: string; nome: string; tipo: string }

const TIPO_CURTO: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PE',
}

export function AdminMembroSedeForm({
  membroId,
  sedeIdAtual,
  sedes,
  canEdit,
  espelhado,
  aprovadoNaUnidadeNome,
}: {
  membroId: string
  sedeIdAtual: string | null
  sedes: SedeOption[]
  canEdit: boolean
  espelhado?: boolean
  aprovadoNaUnidadeNome?: string | null
}) {
  const [sedeId, setSedeId] = useState(sedeIdAtual ?? '')
  const [pending, startTransition] = useTransition()
  const dirty = (sedeId || null) !== (sedeIdAtual ?? null)

  if (espelhado || !canEdit) {
    const atual = sedes.find((s) => s.id === sedeIdAtual)
    const via = aprovadoNaUnidadeNome?.trim()
    return (
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <MapPin className="h-4 w-4" />
          Unidade territorial
        </h2>
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          {atual
            ? `[${TIPO_CURTO[atual.tipo] ?? atual.tipo}] ${atual.nome}`
            : 'Sem unidade vinculada'}
        </p>
        {espelhado && (
          <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
            {via
              ? `Registro espelhado — aprovado via ${via}. Altere na unidade de origem.`
              : 'Registro espelhado — altere na unidade de origem.'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
        <MapPin className="h-4 w-4" />
        Unidade territorial
      </h2>
      <p className="mb-3 text-xs text-[rgb(var(--foreground-muted))]">
        Define em qual sede/subsede/PDE o membro conta para KPIs, eventos locais e o mapa
        operacional.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Unidade
          <select
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          >
            <option value="">Sem unidade</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                [{TIPO_CURTO[s.tipo] ?? s.tipo}] {s.nome}
              </option>
            ))}
          </select>
        </label>
        <AppButton
          variant="primary"
          icon={Save}
          loading={pending}
          type="button"
          disabled={!dirty}
          onClick={() =>
            startTransition(async () => {
              await runPersistAction(
                () => reatribuirSedeMembro(membroId, sedeId || null),
                { success: 'Unidade atualizada.' },
              )
            })
          }
          className="rounded-xl px-4 py-2 text-sm"
        >
          Salvar unidade
        </AppButton>
      </div>
    </div>
  )
}
