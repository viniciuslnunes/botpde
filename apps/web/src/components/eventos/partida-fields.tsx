'use client'

import { useState } from 'react'
import { FieldError, Input } from '@torcida/ui'
import { MANDO_JOGO_LABEL } from '@torcida/types'
import type { PartidaOption } from '@/lib/partidas'

function formatPartidaLabel(p: PartidaOption) {
  const data = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(p.dataHora))
  const mando = MANDO_JOGO_LABEL[p.mando] ?? p.mando
  const comp = p.competicao ? ` · ${p.competicao}` : ''
  return `${mando} vs ${p.adversario} — ${data}${comp}`
}

export function PartidaFields({
  partidas = [],
  defaultPartidaId,
  errors,
  temAfiliacao = true,
}: {
  partidas?: PartidaOption[]
  defaultPartidaId?: string | null
  errors?: string[]
  temAfiliacao?: boolean
}) {
  const [selected, setSelected] = useState(defaultPartidaId ?? '')

  if (!temAfiliacao) {
    return (
      <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
        Vincule um clube (afiliação) ao tenant para ligar partidas a eventos.
      </p>
    )
  }

  const isNova = selected === '__nova__'

  return (
    <div className="space-y-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
      <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Partida do clube (opcional)
      </label>
      <select
        name="partidaId"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
      >
        <option value="">Sem vínculo a jogo</option>
        {partidas.map((p) => (
          <option key={p.id} value={p.id}>
            {formatPartidaLabel(p)}
          </option>
        ))}
        <option value="__nova__">+ Cadastrar nova partida…</option>
      </select>
      {isNova && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] text-[rgb(var(--foreground-muted))]">
              Adversário
            </label>
            <Input name="partidaNovaAdversario" placeholder="Ex: Palmeiras" required />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[rgb(var(--foreground-muted))]">
              Mando
            </label>
            <select
              name="partidaNovaMando"
              defaultValue="CASA"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            >
              <option value="CASA">Casa</option>
              <option value="FORA">Fora</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[rgb(var(--foreground-muted))]">
              Competição
            </label>
            <Input name="partidaNovaCompeticao" placeholder="Ex: Brasileirão" />
          </div>
          <p className="sm:col-span-2 text-[11px] text-[rgb(var(--foreground-muted))]">
            Data/local do jogo usam os mesmos campos do evento (podem ser ajustados depois).
          </p>
        </div>
      )}
      <FieldError errors={errors} />
    </div>
  )
}
