'use client'

import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { criarEvento, editarEvento, excluirEvento, type EventoState } from '@/app/admin/eventos/actions'
import { Trash2, CalendarPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FieldError, Input, Textarea, SubmitButton } from '@torcida/ui'
import { TIPO_EVENTO_LABEL } from '@torcida/types'
import { collapsePanel, springSnappy } from '@/lib/motion-presets'
import { submitRedirectAction } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm } from '@/lib/unsaved-changes'

const TIPOS = Object.keys(TIPO_EVENTO_LABEL) as Array<keyof typeof TIPO_EVENTO_LABEL>

/** Valor datetime-local no formato esperado pelo input */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function TipoSelect({
  defaultValue = 'GERAL',
  onChange,
}: {
  defaultValue?: string
  onChange?: (tipo: string) => void
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Tipo
      </label>
      <select
        name="tipo"
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
      >
        {TIPOS.map((t) => (
          <option key={t} value={t}>
            {TIPO_EVENTO_LABEL[t]}
          </option>
        ))}
      </select>
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
}: {
  defaultTipo?: string
  redirectTo?: string
  submitLabel?: string
  lockTipo?: boolean
}) {
  const [state, setState] = useState<EventoState>({})
  const [tipo, setTipo] = useState(defaultTipo)
  const { formRef } = useTrackedForm({ title: 'Novo evento' })

  // Padrão: amanhã às 12h
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
        <TipoSelect defaultValue={defaultTipo} onChange={setTipo} />
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
        <Input name="titulo" type="text" placeholder="Ex: Jogo Corinthians x Santos" required />
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

      <SubmitButton label={submitLabel} icon={<CalendarPlus className="h-4 w-4" />} />
    </form>
  )
}

/* ── Editar ─────────────────────────────────────────────────────────────────── */
type EventoData = {
  id: string
  titulo: string
  descricao: string | null
  data: Date
  local: string | null
  tipo?: string
  valorVaga?: number | { toNumber(): number } | null
}

export function EditarEventoForm({ evento }: { evento: EventoData }) {
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

      <TipoSelect defaultValue={evento.tipo ?? 'GERAL'} onChange={setTipo} />

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

      <SubmitButton label="Salvar alterações" icon={<CalendarPlus className="h-4 w-4" />} />
    </form>
  )
}

/* ── Excluir ─────────────────────────────────────────────────────────────────── */
export function ExcluirEventoButton({ eventoId }: { eventoId: string }) {
  const router = useRouter()
  const confirmAction = useConfirmAction()

  function handleExcluir() {
    void confirmAction({
      titulo: 'Excluir este evento?',
      descricao: 'Todos os RSVPs também serão removidos.',
      labelConfirmar: 'Excluir',
      variante: 'destructive',
      cancelled: 'Exclusão cancelada.',
      run: () => excluirEvento(eventoId),
      success: 'Evento excluído.',
    }).then((ok) => {
      if (ok) router.refresh()
    })
  }

  return (
    <button
      onClick={handleExcluir}
      className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Excluir
    </button>
  )
}
