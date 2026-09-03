'use client'

import { useState, useTransition, type FormEvent } from 'react'
import {
  BANDEIRA_PECAS_MAX,
  CATEGORIA_PATRIMONIO_LABEL,
  STATUS_PATRIMONIO_LABEL,
  patrimonioEhPecaUnica,
} from '@torcida/types'
import {
  criarPatrimonioItem,
  editarPatrimonioItem,
  type PatrimonioState,
} from '@/app/admin/patrimonio/actions'
import { ImageUploadField } from '@/components/media/image-upload-field'
import { useConfirmAction } from '@/lib/confirm-action'
import { toastFromAction } from '@/lib/toast-action'
import { useTrackedForm } from '@/lib/unsaved-changes'
import { AppButton } from '@/components/ui/button'
import { X } from 'lucide-react'

const CATEGORIAS = Object.keys(CATEGORIA_PATRIMONIO_LABEL)
const STATUS = Object.keys(STATUS_PATRIMONIO_LABEL)

const FIELD =
  'mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]'

const PATRIMONIO_FORM_LABELS: Record<string, string> = {
  nome: 'Nome',
  categoria: 'Categoria',
  status: 'Status',
  quantidade: 'Quantidade',
  pecas: 'Peças',
  localizacao: 'Localização',
  valorEstimado: 'Valor estimado',
  observacao: 'Observação',
  responsavelId: 'Responsável',
  fotoUrl: 'Foto',
}

export type PatrimonioFormInitial = {
  id?: string
  nome: string
  categoria: string
  status: string
  quantidade: number
  localizacao: string | null
  valorEstimado: number | null
  observacao: string | null
  fotoUrl: string | null
  responsavelId: string | null
  vistoria?: {
    larguraM: number
    alturaM: number
    comMastro: boolean
    orgao: string | null
    protocolo: string | null
    validade: string | null
    observacao: string | null
  } | null
}

export type ResponsavelOption = { id: string; nome: string | null; email: string }

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.[0]) return null
  return <span className="mt-1 block text-xs text-red-600">{messages[0]}</span>
}

export function PatrimonioItemForm({
  initial,
  candidatos,
  tenantId,
  onCancel,
  onSaved,
  categoriaTravada,
}: {
  initial?: PatrimonioFormInitial
  candidatos: ResponsavelOption[]
  tenantId: string
  onCancel?: () => void
  onSaved?: () => void
  /** Categoria imposta pelo RBAC (`flags:manage` só escreve em BANDEIRA). */
  categoriaTravada?: string | null
}) {
  const isEdit = Boolean(initial?.id)
  const [categoriaEscolhida, setCategoriaEscolhida] = useState(
    categoriaTravada ?? initial?.categoria ?? 'OUTROS',
  )
  const categoriaAtual = categoriaTravada ?? categoriaEscolhida
  const pecaUnica = patrimonioEhPecaUnica(categoriaAtual)
  const [fotoUrl, setFotoUrl] = useState(initial?.fotoUrl ?? '')
  const [state, setState] = useState<PatrimonioState>({})
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()
  const { formRef, markPristine, isDirty, changes } = useTrackedForm({
    id: initial?.id ? `patrimonio-item-${initial.id}` : 'patrimonio-item-novo',
    title: isEdit ? `Editar ${initial?.nome ?? 'item'}` : 'Novo item',
    labels: PATRIMONIO_FORM_LABELS,
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const nome = String(fd.get('nome') ?? initial?.nome ?? 'item').trim() || 'item'

    startTransition(async () => {
      const persist = async () => {
        const result = isEdit
          ? await editarPatrimonioItem({}, fd)
          : await criarPatrimonioItem({}, fd)
        setState(result)
        return result
      }

      if (isEdit) {
        const ok = await confirmAction({
          titulo: `Salvar alterações em “${nome}”?`,
          descricao: changes.length
            ? `Vai gravar: ${changes.join(', ')}.`
            : 'Confirme para gravar as alterações neste item.',
          labelConfirmar: 'Salvar',
          cancelled: 'Alteração cancelada.',
          run: persist,
          success: 'Item atualizado.',
        })
        if (ok) {
          markPristine()
          onSaved?.()
        }
        return
      }

      const result = await persist()
      if (result.errors && !result.ok) return
      const ok = toastFromAction(result, { success: 'Item cadastrado.' })
      if (ok && result.ok) {
        markPristine()
        onSaved?.()
      }
    })
  }

  const dirtyLabel =
    isDirty && changes.length > 0
      ? changes.length === 1
        ? changes[0]
        : `${changes.length} campos alterados`
      : undefined

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      data-persist-bar-root=""
      className="space-y-4"
    >
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}

      <div className="grid items-start gap-5 @3xl/modal:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <ImageUploadField
          name="fotoUrl"
          label="Foto do item"
          value={fotoUrl}
          onChange={(url) => {
            setFotoUrl(url)
            requestAnimationFrame(() => {
              formRef.current?.dispatchEvent(new Event('input', { bubbles: true }))
            })
          }}
          aspect={4 / 3}
          purpose="patrimonio"
          tenantId={tenantId}
          unsavedLabel="Foto"
          cropTitle="Enquadrar foto do item"
          hint="A foto é o que diferencia bandeiras e instrumentos parecidos. Enquadre o item inteiro."
          fieldErrors={state.errors?.fotoUrl}
          className="[&_[role=button]]:min-h-[10rem] [&_[role=button]]:py-5 @3xl/modal:[&_[role=button]]:min-h-[14rem]"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
            Nome
            <input
              name="nome"
              required
              maxLength={120}
              defaultValue={initial?.nome}
              data-unsaved-label="Nome"
              placeholder="Ex.: Surdo 22&quot; — bateria"
              className={FIELD}
            />
            <FieldError messages={state.errors?.nome} />
          </label>

          {categoriaTravada ? (
            <div className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Categoria
              <input type="hidden" name="categoria" value={categoriaTravada} />
              <p className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))]">
                {CATEGORIA_PATRIMONIO_LABEL[categoriaTravada] ?? categoriaTravada}
              </p>
              <FieldError messages={state.errors?.categoria} />
            </div>
          ) : (
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Categoria
              <select
                name="categoria"
                required
                defaultValue={categoriaAtual}
                data-unsaved-label="Categoria"
                className={FIELD}
                onChange={(e) => setCategoriaEscolhida(e.target.value)}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_PATRIMONIO_LABEL[c]}
                  </option>
                ))}
              </select>
              <FieldError messages={state.errors?.categoria} />
            </label>
          )}

          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Status
            <select
              name="status"
              required
              defaultValue={initial?.status ?? 'DISPONIVEL'}
              data-unsaved-label="Status"
              className={FIELD}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_PATRIMONIO_LABEL[s]}
                </option>
              ))}
            </select>
            <FieldError messages={state.errors?.status} />
          </label>

          {pecaUnica && isEdit ? (
            <input type="hidden" name="quantidade" value={1} />
          ) : (
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              {pecaUnica ? 'Peças' : 'Quantidade'}
              <input
                name="quantidade"
                type="number"
                min={1}
                max={pecaUnica ? BANDEIRA_PECAS_MAX : undefined}
                required
                defaultValue={initial?.quantidade ?? 1}
                data-unsaved-label={pecaUnica ? 'Peças' : 'Quantidade'}
                className={FIELD}
              />
              {pecaUnica ? (
                <span className="mt-1 block text-[11px] font-normal text-[rgb(var(--foreground-muted))]">
                  Cada peça vira um card no acervo — depois você coloca a foto de cada uma.
                </span>
              ) : null}
              <FieldError messages={state.errors?.quantidade} />
            </label>
          )}

          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Valor estimado (R$, opcional)
            <input
              name="valorEstimado"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initial?.valorEstimado ?? ''}
              data-unsaved-label="Valor estimado"
              className={FIELD}
            />
            <FieldError messages={state.errors?.valorEstimado} />
          </label>

          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Localização
            <input
              name="localizacao"
              maxLength={200}
              defaultValue={initial?.localizacao ?? ''}
              data-unsaved-label="Localização"
              placeholder="Ex.: Sede — depósito / sala da bateria"
              className={FIELD}
            />
            <FieldError messages={state.errors?.localizacao} />
          </label>

          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Responsável
            <select
              name="responsavelId"
              defaultValue={initial?.responsavelId ?? ''}
              data-unsaved-label="Responsável"
              className={FIELD}
            >
              <option value="">Sem responsável</option>
              {candidatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome ?? c.email}
                </option>
              ))}
            </select>
            <FieldError messages={state.errors?.responsavelId} />
          </label>

          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
            Observação
            <textarea
              name="observacao"
              rows={2}
              maxLength={500}
              defaultValue={initial?.observacao ?? ''}
              data-unsaved-label="Observação"
              className={FIELD}
            />
            <FieldError messages={state.errors?.observacao} />
          </label>
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] pt-3">
        {dirtyLabel ? (
          <p className="mr-auto text-xs font-medium text-[rgb(var(--foreground))]">{dirtyLabel}</p>
        ) : (
          <p className="mr-auto text-xs text-[rgb(var(--foreground-muted))]">
            {isEdit ? 'Altere a foto ou os dados e salve.' : 'Preencha e cadastre o item.'}
          </p>
        )}
        {onCancel ? (
          <AppButton
            variant="none"
            icon={X}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Cancelar
          </AppButton>
        ) : null}
        <button
          type="submit"
          disabled={pending || (isEdit && !isDirty)}
          className="app-action rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-primary-on disabled:opacity-50"
        >
          {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Cadastrar'}
        </button>
      </div>
    </form>
  )
}
