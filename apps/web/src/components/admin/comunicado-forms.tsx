'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  criarComunicado,
  atualizarComunicado,
  alternarFixadoComunicado,
  excluirComunicado,
  type ComunicadoState,
} from '@/app/admin/comunidade/actions'
import { Pin, PinOff, Pencil, Trash2, Megaphone, X } from 'lucide-react'
import { FieldError, Input, Select, Textarea, SubmitButton, Badge } from '@torcida/ui'
import { runPersistAction, useActionStateToast } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { useTrackedForm, useUnsavedChangesContext } from '@/lib/unsaved-changes'

type Prioridade = 'NORMAL' | 'IMPORTANTE' | 'URGENTE'

const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  NORMAL: 'Normal',
  IMPORTANTE: 'Importante',
  URGENTE: 'Urgente',
}

const PRIORIDADE_VARIANT: Record<Prioridade, 'neutral' | 'warning' | 'danger'> = {
  NORMAL: 'neutral',
  IMPORTANTE: 'warning',
  URGENTE: 'danger',
}

function ComunicadoFields({ state, initial }: { state: ComunicadoState; initial?: Comunicado }) {
  return (
    <>
      {state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Título <span className="text-red-500">*</span>
        </label>
        <Input
          name="titulo"
          type="text"
          defaultValue={initial?.titulo ?? ''}
          required
          placeholder="Ex: Alteração no ponto de encontro do próximo jogo"
          maxLength={150}
        />
        <FieldError errors={state.errors?.titulo} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Prioridade
        </label>
        <Select name="prioridade" defaultValue={initial?.prioridade ?? 'NORMAL'}>
          <option value="NORMAL">Normal</option>
          <option value="IMPORTANTE">Importante</option>
          <option value="URGENTE">Urgente</option>
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Conteúdo <span className="text-red-500">*</span>
        </label>
        <Textarea
          name="corpo"
          defaultValue={initial?.corpo ?? ''}
          required
          maxLength={4000}
          rows={4}
          placeholder="Comunicado oficial para toda a torcida"
        />
        <FieldError errors={state.errors?.corpo} />
      </div>
    </>
  )
}

/* ── Criar ─────────────────────────────────────────────────────────────────── */
export function CriarComunicadoForm() {
  const [state, action, pending] = useActionState<ComunicadoState, FormData>(criarComunicado, {})
  const [key, setKey] = useState(0)
  const { formRef, markPristine } = useTrackedForm({
    id: `criar-comunicado-${key}`,
    title: 'Novo comunicado',
  })
  useActionStateToast(state, pending, 'Comunicado publicado.', {
    onSuccess: () => {
      markPristine()
      setKey((k) => k + 1)
    },
  })

  return (
    <form key={key} ref={formRef} action={action} className="space-y-4">
      <ComunicadoFields state={state} />
      <SubmitButton label="Publicar comunicado" icon={<Megaphone className="h-4 w-4" />} />
    </form>
  )
}

/* ── Editar ────────────────────────────────────────────────────────────────── */
export interface Comunicado {
  id: string
  titulo: string
  corpo: string
  prioridade: Prioridade
  fixado: boolean
  publicadoEm: Date | string
}

function EditarComunicadoForm({
  comunicado,
  onCancel,
}: {
  comunicado: Comunicado
  onCancel: () => void
}) {
  const boundAction = atualizarComunicado.bind(null, comunicado.id)
  const [state, action, pending] = useActionState<ComunicadoState, FormData>(boundAction, {})
  const { formRef, markPristine } = useTrackedForm({
    id: `editar-comunicado-${comunicado.id}`,
    title: 'Editar comunicado',
  })
  const { confirmDiscard } = useUnsavedChangesContext()
  useActionStateToast(state, pending, 'Comunicado atualizado.', {
    onSuccess: () => {
      markPristine()
      onCancel()
    },
  })

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <ComunicadoFields state={state} initial={comunicado} />
      <div className="flex gap-2">
        <SubmitButton label="Salvar" icon={<Megaphone className="h-4 w-4" />} />
        <button
          type="button"
          onClick={() => {
            void confirmDiscard().then((ok) => {
              if (ok) onCancel()
            })
          }}
          className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-3.5 w-3.5" /> Cancelar
        </button>
      </div>
    </form>
  )
}

/* ── Lista ─────────────────────────────────────────────────────────────────── */
function formatarData(data: Date | string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(data),
  )
}

export function ComunicadosManager({ comunicados }: { comunicados: Comunicado[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()

  const fixados = comunicados.filter((c) => c.fixado)
  const outros = comunicados.filter((c) => !c.fixado)
  const ordenados = [...fixados, ...outros]

  if (ordenados.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
        Nenhum comunicado oficial publicado ainda.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {ordenados.map((comunicado) =>
        editandoId === comunicado.id ? (
          <div
            key={comunicado.id}
            className="rounded-xl border border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--surface))] p-4"
          >
            <EditarComunicadoForm comunicado={comunicado} onCancel={() => setEditandoId(null)} />
          </div>
        ) : (
          <div
            key={comunicado.id}
            className={[
              'rounded-xl border p-4',
              comunicado.fixado
                ? 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.04)]'
                : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {comunicado.fixado && (
                    <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                      <Pin className="h-3 w-3" /> Fixado
                    </span>
                  )}
                  <Badge variant={PRIORIDADE_VARIANT[comunicado.prioridade]}>
                    {PRIORIDADE_LABEL[comunicado.prioridade]}
                  </Badge>
                  <h3 className="font-semibold text-[rgb(var(--foreground))]">{comunicado.titulo}</h3>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[rgb(var(--foreground-muted))]">
                  {comunicado.corpo}
                </p>
                <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                  {formatarData(comunicado.publicadoEm)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await runPersistAction(() => alternarFixadoComunicado(comunicado.id), {
                        success: comunicado.fixado
                          ? 'Comunicado desafixado.'
                          : 'Comunicado fixado no topo.',
                      })
                    })
                  }
                  disabled={pending}
                  title={comunicado.fixado ? 'Desafixar' : 'Fixar no topo'}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  {comunicado.fixado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setEditandoId(comunicado.id)}
                  disabled={pending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    void confirmAction({
                      titulo: 'Excluir este comunicado?',
                      descricao: 'O comunicado será removido permanentemente.',
                      labelConfirmar: 'Excluir',
                      variante: 'destructive',
                      cancelled: 'Exclusão cancelada.',
                      run: () => excluirComunicado(comunicado.id),
                      success: 'Comunicado excluído.',
                    })
                  }}
                  disabled={pending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  )
}
