'use client'

import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  criarEvento,
  editarEvento,
  excluirEvento,
  type EventoState,
} from '@/app/admin/eventos/actions'
import { Trash2, CalendarPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FieldError, Input, Textarea, SubmitButton } from '@torcida/ui'
import { TIPO_EVENTO_LABEL } from '@torcida/types'
import { collapsePanel, springSnappy } from '@/lib/motion-presets'
import { submitRedirectAction } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm } from '@/lib/unsaved-changes'
import { PartidaFields } from '@/components/eventos/partida-fields'
import type { PartidaOption } from '@/lib/partidas'

const TIPOS = Object.keys(TIPO_EVENTO_LABEL) as Array<keyof typeof TIPO_EVENTO_LABEL>

export type SedeOption = { id: string; nome: string; capacidade: number | null }

/** Valor datetime-local no formato esperado pelo input */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function TipoSelect({
  value = 'GERAL',
  onChange,
}: {
  value?: string
  onChange?: (tipo: string) => void
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Tipo
      </label>
      <div className="grid grid-cols-3 gap-2">
        {TIPOS.map((t) => (
          <label
            key={t}
            className={[
              'cursor-pointer rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors',
              value === t
                ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]'
                : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            <input
              type="radio"
              name="tipo"
              value={t}
              className="sr-only"
              checked={value === t}
              onChange={() => onChange?.(t)}
            />
            {TIPO_EVENTO_LABEL[t]}
          </label>
        ))}
      </div>
    </div>
  )
}

function SedeSelect({
  sedes,
  defaultValue,
  errors,
}: {
  sedes: SedeOption[]
  defaultValue?: string | null
  errors?: string[]
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Escopo territorial
      </label>
      <select
        name="sedeId"
        defaultValue={defaultValue ?? 'global'}
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
      >
        <option value="global">Toda a torcida (global)</option>
        {sedes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
            {s.capacidade != null ? ` · lotação ${s.capacidade}` : ''}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
        Global aparece para todos; unidade só para quem está vinculado àquela sede.
      </p>
      <FieldError errors={errors} />
    </div>
  )
}

function CapacidadeField({
  defaultValue,
  errors,
}: {
  defaultValue?: number | null
  errors?: string[]
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Capacidade (opcional)
      </label>
      <Input
        name="capacidade"
        type="number"
        min="1"
        step="1"
        placeholder="Usa a lotação da sede se vazio"
        defaultValue={defaultValue != null && defaultValue > 0 ? String(defaultValue) : ''}
      />
      <FieldError errors={errors} />
    </div>
  )
}

function RecorrenciaField({ errors }: { errors?: string[] }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Repetir semanalmente
      </label>
      <select
        name="recorrenciasSemanas"
        defaultValue="0"
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
      >
        <option value="0">Só esta data</option>
        <option value="3">+ 3 semanas (4 no total)</option>
        <option value="7">+ 7 semanas (8 no total)</option>
        <option value="11">+ 11 semanas (12 no total)</option>
      </select>
      <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
        Útil para ensaios — cria ocorrências no mesmo horário.
      </p>
      <FieldError errors={errors} />
    </div>
  )
}

function GeoFields({
  defaultLat,
  defaultLng,
  errorsLat,
  errorsLng,
}: {
  defaultLat?: number | null
  defaultLng?: number | null
  errorsLat?: string[]
  errorsLng?: string[]
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Latitude (opcional)
        </label>
        <Input
          name="lat"
          type="number"
          step="any"
          placeholder="-23.545"
          defaultValue={defaultLat != null ? String(defaultLat) : ''}
        />
        <FieldError errors={errorsLat} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Longitude (opcional)
        </label>
        <Input
          name="lng"
          type="number"
          step="any"
          placeholder="-46.474"
          defaultValue={defaultLng != null ? String(defaultLng) : ''}
        />
        <FieldError errors={errorsLng} />
      </div>
    </div>
  )
}

function ValorVagaField({
  defaultValue,
  errors,
}: {
  defaultValue?: number | null
  errors?: string[]
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Valor da vaga (R$)
      </label>
      <Input
        name="valorVaga"
        type="number"
        min="0.01"
        step="0.01"
        placeholder="Opcional — caravana paga"
        defaultValue={defaultValue != null && defaultValue > 0 ? String(defaultValue) : ''}
      />
      <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
        Se preenchido, quem confirmar presença pode gerar cobrança avulsa da vaga.
      </p>
      <FieldError errors={errors} />
    </div>
  )
}

/* ── Criar ─────────────────────────────────────────────────────────────────── */
export function CriarEventoForm({
  defaultTipo = 'GERAL',
  redirectTo,
  submitLabel = 'Criar evento',
  lockTipo = false,
  sedes = [],
  partidas = [],
  temAfiliacao = true,
  onCancel,
}: {
  defaultTipo?: string
  redirectTo?: string
  submitLabel?: string
  lockTipo?: boolean
  sedes?: SedeOption[]
  partidas?: PartidaOption[]
  temAfiliacao?: boolean
  onCancel?: () => void
}) {
  const [state, setState] = useState<EventoState>({})
  const [tipo, setTipo] = useState(defaultTipo)
  const { formRef } = useTrackedForm({ title: 'Novo evento' })

  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  amanha.setHours(12, 0, 0, 0)

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await submitRedirectAction(() => criarEvento({}, fd), setState, {
          success: 'Evento criado.',
        })
      }}
      className="space-y-4"
    >
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      {lockTipo ? (
        <input type="hidden" name="tipo" value={defaultTipo} />
      ) : (
        <TipoSelect value={tipo} onChange={setTipo} />
      )}

      <AnimatePresence>
        {state.message && (
          <m.div
            key="erro"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="overflow-hidden rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          >
            {state.message}
          </m.div>
        )}
      </AnimatePresence>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Título <span className="text-red-500">*</span>
        </label>
        <Input name="titulo" type="text" placeholder="Ex: Concentração na sede" required />
        <FieldError errors={state.errors?.titulo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Data e hora <span className="text-red-500">*</span>
          </label>
          <Input
            name="data"
            type="datetime-local"
            defaultValue={toDatetimeLocal(amanha)}
            required
          />
          <FieldError errors={state.errors?.data} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Local
          </label>
          <Input name="local" type="text" placeholder="Ex: Neo Química Arena" />
          <FieldError errors={state.errors?.local} />
        </div>
      </div>

      <SedeSelect sedes={sedes} errors={state.errors?.sedeId} />
      <CapacidadeField errors={state.errors?.capacidade} />
      <PartidaFields
        partidas={partidas}
        temAfiliacao={temAfiliacao}
        errors={state.errors?.partidaId}
      />
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Foto de capa (URL)
        </label>
        <Input name="fotoUrl" type="url" placeholder="https://…" />
        <FieldError errors={state.errors?.fotoUrl} />
      </div>
      <RecorrenciaField errors={state.errors?.recorrenciasSemanas} />
      <GeoFields errorsLat={state.errors?.lat} errorsLng={state.errors?.lng} />

      {(lockTipo ? defaultTipo === 'CARAVANA' : tipo === 'CARAVANA') && (
        <ValorVagaField errors={state.errors?.valorVaga} />
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Descrição
        </label>
        <Textarea
          name="descricao"
          rows={3}
          placeholder="Detalhes, ponto de encontro, informações adicionais..."
          className="resize-none"
        />
        <FieldError errors={state.errors?.descricao} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton label={submitLabel} icon={<CalendarPlus className="h-4 w-4" />} />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

/* ── Editar ─────────────────────────────────────────────────────────────────── */
type EventoData = {
  id: string
  titulo: string
  descricao: string | null
  fotoUrl?: string | null
  data: Date
  local: string | null
  tipo?: string
  sedeId?: string | null
  capacidade?: number | null
  lat?: number | null
  lng?: number | null
  serieId?: string | null
  partidaId?: string | null
  valorVaga?: number | { toNumber(): number } | null
}

export function EditarEventoForm({
  evento,
  sedes = [],
  partidas = [],
  temAfiliacao = true,
  redirectTo,
}: {
  evento: EventoData
  sedes?: SedeOption[]
  partidas?: PartidaOption[]
  temAfiliacao?: boolean
  redirectTo?: string
}) {
  const [state, setState] = useState<EventoState>({})
  const [tipo, setTipo] = useState(evento.tipo ?? 'GERAL')
  const { formRef } = useTrackedForm({
    id: `editar-evento-${evento.id}`,
    title: 'Editar evento',
  })
  const valorDefault =
    evento.valorVaga == null
      ? null
      : typeof evento.valorVaga === 'number'
        ? evento.valorVaga
        : evento.valorVaga.toNumber()

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await submitRedirectAction(() => editarEvento(evento.id, {}, fd), setState, {
          success: 'Evento atualizado.',
        })
      }}
      className="space-y-4"
    >
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <AnimatePresence>
        {state.message && (
          <m.div
            key="erro"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="overflow-hidden rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          >
            {state.message}
          </m.div>
        )}
      </AnimatePresence>

      <TipoSelect value={tipo} onChange={setTipo} />

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Título <span className="text-red-500">*</span>
        </label>
        <Input name="titulo" type="text" defaultValue={evento.titulo} required />
        <FieldError errors={state.errors?.titulo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Data e hora <span className="text-red-500">*</span>
          </label>
          <Input
            name="data"
            type="datetime-local"
            defaultValue={toDatetimeLocal(new Date(evento.data))}
            required
          />
          <FieldError errors={state.errors?.data} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Local
          </label>
          <Input name="local" type="text" defaultValue={evento.local ?? ''} />
          <FieldError errors={state.errors?.local} />
        </div>
      </div>

      <SedeSelect sedes={sedes} defaultValue={evento.sedeId} errors={state.errors?.sedeId} />
      <CapacidadeField defaultValue={evento.capacidade} errors={state.errors?.capacidade} />
      <PartidaFields
        partidas={partidas}
        defaultPartidaId={evento.partidaId}
        temAfiliacao={temAfiliacao}
        errors={state.errors?.partidaId}
      />
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Foto de capa (URL)
        </label>
        <Input name="fotoUrl" type="url" defaultValue={evento.fotoUrl ?? ''} placeholder="https://…" />
        <FieldError errors={state.errors?.fotoUrl} />
      </div>
      <GeoFields
        defaultLat={evento.lat}
        defaultLng={evento.lng}
        errorsLat={state.errors?.lat}
        errorsLng={state.errors?.lng}
      />

      {evento.serieId && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Escopo da série
          </label>
          <select
            name="escopoSerie"
            defaultValue="esta"
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          >
            <option value="esta">Só esta ocorrência</option>
            <option value="futuras">Esta e as próximas da série</option>
          </select>
        </div>
      )}

      {tipo === 'CARAVANA' && (
        <ValorVagaField defaultValue={valorDefault} errors={state.errors?.valorVaga} />
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Descrição
        </label>
        <Textarea
          name="descricao"
          rows={3}
          defaultValue={evento.descricao ?? ''}
          className="resize-none"
        />
        <FieldError errors={state.errors?.descricao} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton label="Salvar alterações" icon={<CalendarPlus className="h-4 w-4" />} />
        <ExcluirEventoButton eventoId={evento.id} serieId={evento.serieId} />
      </div>
    </form>
  )
}

/* ── Excluir ─────────────────────────────────────────────────────────────────── */
export function ExcluirEventoButton({
  eventoId,
  serieId,
}: {
  eventoId: string
  serieId?: string | null
}) {
  const router = useRouter()
  const confirmAction = useConfirmAction()

  function handleExcluir(escopo: 'esta' | 'futuras') {
    const ehSerie = escopo === 'futuras'
    void confirmAction({
      titulo: ehSerie ? 'Excluir esta e as próximas?' : 'Excluir este evento?',
      descricao: ehSerie
        ? 'Remove esta ocorrência e todas as futuras da mesma série.'
        : 'Todos os RSVPs desta ocorrência também serão removidos.',
      labelConfirmar: 'Excluir',
      variante: 'destructive',
      cancelled: 'Exclusão cancelada.',
      run: () => excluirEvento(eventoId, escopo),
      success: ehSerie ? 'Ocorrências excluídas.' : 'Evento excluído.',
    }).then((ok) => {
      if (ok) router.push('/admin/eventos')
    })
  }

  if (!serieId) {
    return (
      <button
        type="button"
        onClick={() => handleExcluir('esta')}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Excluir
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => handleExcluir('esta')}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Excluir esta
      </button>
      <button
        type="button"
        onClick={() => handleExcluir('futuras')}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Excluir série futura
      </button>
    </div>
  )
}

