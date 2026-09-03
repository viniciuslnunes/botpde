'use client'

import { useId, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  criarEvento,
  editarEvento,
  excluirEvento,
  type EventoState,
} from '@/app/admin/eventos/actions'
import { CalendarPlus, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FieldError, Input, Textarea, SubmitButton } from '@torcida/ui'
import { TIPO_EVENTO_LABEL } from '@torcida/types'
import { collapsePanel, springSnappy } from '@/lib/motion-presets'
import { submitRedirectAction } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm } from '@/lib/unsaved-changes'
import { PartidaFields } from '@/components/eventos/partida-fields'
import { ImageUploadField } from '@/components/media/image-upload-field'
import { LocationPickerFields } from '@/components/media/location-picker-fields'
import type { PartidaOption } from '@/lib/partidas'
import { formatarDonoValor, type DonoOperacionalOption } from '@/lib/evento-dono'
import { AppButton } from '@/components/ui/button'

const TIPOS = Object.keys(TIPO_EVENTO_LABEL) as Array<keyof typeof TIPO_EVENTO_LABEL>

export type SedeOption = { id: string; nome: string; capacidade: number | null }

/** Projetos abertos do tenant — para vincular o evento (Agenda ↔ Projeto). */
export type ProjetoOption = {
  id: string
  titulo: string
  departamentoNome: string
}

function DonoSelect({
  donos,
  defaultValue,
  errors,
}: {
  donos: DonoOperacionalOption[]
  defaultValue?: string | null
  errors?: string[]
}) {
  if (donos.length === 0) return null
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Departamento responsável (opcional)
      </label>
      <select
        name="donoOperacional"
        defaultValue={defaultValue ?? ''}
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
      >
        <option value="">Evento da torcida (sem departamento)</option>
        {donos.map((d) => (
          <optgroup key={d.id} label={d.nome}>
            <option value={formatarDonoValor(d.id)}>{d.nome} — departamento inteiro</option>
            {d.areas.map((a) => (
              <option key={a.id} value={formatarDonoValor(d.id, a.id)}>
                {d.nome} · {a.nome}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
        Quem escala, monta e responde pela operação. Diferente do projeto, que é a
        prestação de contas.
      </p>
      <FieldError errors={errors} />
    </div>
  )
}

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
                ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
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

function EventoFotoELocalFields({
  formId,
  defaultFotoUrl,
  defaultLat,
  defaultLng,
  errorsFoto,
  errorsLat,
  errorsLng,
}: {
  formId: string
  defaultFotoUrl?: string | null
  defaultLat?: number | null
  defaultLng?: number | null
  errorsFoto?: string[]
  errorsLat?: string[]
  errorsLng?: string[]
}) {
  const [fotoUrl, setFotoUrl] = useState(defaultFotoUrl ?? '')

  return (
    <>
      <ImageUploadField
        name="fotoUrl"
        label="Foto de capa"
        value={fotoUrl}
        onChange={setFotoUrl}
        aspect={16 / 9}
        purpose="comunidade"
        buttonLabel="Enviar foto"
        fieldErrors={errorsFoto}
        hint="Ajuste o enquadramento antes do upload. Também pode usar Street View abaixo."
      />
      <LocationPickerFields
        formId={formId}
        defaultLat={defaultLat}
        defaultLng={defaultLng}
        errorsLat={errorsLat}
        errorsLng={errorsLng}
        enableStreetViewPhoto
        onStreetViewPhoto={setFotoUrl}
      />
    </>
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
        Se preenchido, a lotação conta só quem pagou — confirmar RSVP gera a cobrança.
      </p>
      <FieldError errors={errors} />
    </div>
  )
}

function CheckInExigePagamentoField({ defaultChecked }: { defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-xs text-[rgb(var(--foreground))]">
      <input
        type="checkbox"
        name="checkInExigePagamento"
        defaultChecked={defaultChecked}
        className="mt-0.5"
      />
      <span>
        <span className="font-medium">Exigir pagamento no check-in</span>
        <span className="mt-0.5 block text-[11px] text-[rgb(var(--foreground-muted))]">
          Bloqueia o QR/check-in se a vaga não estiver paga. O gestor pode liberar na porta.
        </span>
      </span>
    </label>
  )
}

function ProjetoSelect({
  projetos,
  defaultValue,
  errors,
}: {
  projetos: ProjetoOption[]
  defaultValue?: string | null
  errors?: string[]
}) {
  if (projetos.length === 0) return null
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Projeto (opcional)
      </label>
      <select
        name="projetoId"
        defaultValue={defaultValue ?? ''}
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
      >
        <option value="">Sem vínculo a projeto</option>
        {projetos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.titulo} · {p.departamentoNome}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
        Ex.: Festa das Crianças 2026 dentro do projeto homônimo do Social.
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
  projetos = [],
  donos = [],
  departamentoSlug,
  temAfiliacao = true,
  onCancel,
}: {
  defaultTipo?: string
  redirectTo?: string
  submitLabel?: string
  lockTipo?: boolean
  sedes?: SedeOption[]
  partidas?: PartidaOption[]
  projetos?: ProjetoOption[]
  /** Departamentos + frentes para escolher o dono da operação (Agenda). */
  donos?: DonoOperacionalOption[]
  /** Hub thin: a criação já nasce do departamento da tela, sem select. */
  departamentoSlug?: string
  temAfiliacao?: boolean
  onCancel?: () => void
}) {
  const [state, setState] = useState<EventoState>({})
  const [tipo, setTipo] = useState(defaultTipo)
  const formId = useId()
  const { formRef } = useTrackedForm({ title: 'Novo evento' })

  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  amanha.setHours(12, 0, 0, 0)

  return (
    <form
      id={formId}
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
      <EventoFotoELocalFields
        formId={formId}
        errorsFoto={state.errors?.fotoUrl}
        errorsLat={state.errors?.lat}
        errorsLng={state.errors?.lng}
      />
      <RecorrenciaField errors={state.errors?.recorrenciasSemanas} />
      {departamentoSlug && (
        <input type="hidden" name="departamentoSlug" value={departamentoSlug} />
      )}
      <DonoSelect donos={donos} errors={state.errors?.donoOperacional} />
      <ProjetoSelect projetos={projetos} errors={state.errors?.projetoId} />

      {(lockTipo ? defaultTipo === 'CARAVANA' : tipo === 'CARAVANA') && (
        <>
          <ValorVagaField errors={state.errors?.valorVaga} />
          <CheckInExigePagamentoField />
        </>
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
          <AppButton
            variant="none"
            icon={X}
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Cancelar
          </AppButton>
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
  projetoId?: string | null
  departamentoId?: string | null
  areaId?: string | null
  valorVaga?: number | { toNumber(): number } | null
  checkInExigePagamento?: boolean
}

export function EditarEventoForm({
  evento,
  sedes = [],
  partidas = [],
  projetos = [],
  donos = [],
  temAfiliacao = true,
  redirectTo,
}: {
  evento: EventoData
  sedes?: SedeOption[]
  partidas?: PartidaOption[]
  projetos?: ProjetoOption[]
  donos?: DonoOperacionalOption[]
  temAfiliacao?: boolean
  redirectTo?: string
}) {
  const [state, setState] = useState<EventoState>({})
  const [tipo, setTipo] = useState(evento.tipo ?? 'GERAL')
  const formId = useId()
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
      id={formId}
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
      <EventoFotoELocalFields
        formId={formId}
        defaultFotoUrl={evento.fotoUrl}
        defaultLat={evento.lat}
        defaultLng={evento.lng}
        errorsFoto={state.errors?.fotoUrl}
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

      <DonoSelect
        donos={donos}
        defaultValue={formatarDonoValor(evento.departamentoId, evento.areaId)}
        errors={state.errors?.donoOperacional}
      />
      <ProjetoSelect
        projetos={projetos}
        defaultValue={evento.projetoId}
        errors={state.errors?.projetoId}
      />

      {tipo === 'CARAVANA' && (
        <>
          <ValorVagaField defaultValue={valorDefault} errors={state.errors?.valorVaga} />
          <CheckInExigePagamentoField defaultChecked={Boolean(evento.checkInExigePagamento)} />
        </>
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
      <AppButton
        variant="none"
        icon={Trash2}
        type="button"
        onClick={() => handleExcluir('esta')}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        Excluir
      </AppButton>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AppButton
        variant="none"
        icon={Trash2}
        type="button"
        onClick={() => handleExcluir('esta')}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        Excluir esta
      </AppButton>
      <AppButton
        variant="none"
        icon={Trash2}
        type="button"
        onClick={() => handleExcluir('futuras')}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        Excluir série futura
      </AppButton>
    </div>
  )
}

