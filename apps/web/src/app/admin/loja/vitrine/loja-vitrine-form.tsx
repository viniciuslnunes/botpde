'use client'

import { useActionState, useId, useState } from 'react'
import { salvarVitrineLoja, type VitrineState } from '../actions'
import { ImageUploadField } from '@/components/media/image-upload-field'
import { LOJA_CAPA_ASPECT } from '@/lib/image-crop'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { useTrackedForm } from '@/lib/unsaved-changes'
import { useActionStateToast } from '@/lib/toast-action'
import { FieldError } from '@torcida/ui'

const initial: VitrineState = {}

export function LojaVitrineForm({
  bannerUrl,
  usarDestaqueComoCapa,
  tenantId,
}: {
  bannerUrl: string | null
  usarDestaqueComoCapa: boolean
  tenantId: string
}) {
  const [state, action, pending] = useActionState(salvarVitrineLoja, initial)
  const [url, setUrl] = useState(bannerUrl ?? '')
  const formId = useId()
  const { formRef, markPristine, isDirty, changes } = useTrackedForm({
    id: `loja-vitrine-${tenantId}`,
    title: 'Vitrine da loja',
    labels: {
      bannerUrl: 'Capa',
      usarDestaqueComoCapa: 'Usar destaque como capa',
    },
  })

  useActionStateToast(state, pending, 'Vitrine atualizada.', {
    onSuccess: () => markPristine(),
  })

  return (
    <form
      id={formId}
      ref={formRef}
      action={action}
      data-persist-bar-root=""
      className="space-y-6"
    >
      <input type="hidden" name="bannerUrl" value={url} />

      <ImageUploadField
        name="bannerUrlPreview"
        label="Capa da loja"
        value={url}
        onChange={(next) => {
          setUrl(next)
          // Notifica o tracker de formulário (hidden controlado pelo React).
          queueMicrotask(() => {
            formRef.current?.dispatchEvent(new Event('input', { bubbles: true }))
          })
        }}
        aspect={LOJA_CAPA_ASPECT}
        purpose="loja"
        tenantId={tenantId}
        fieldErrors={state.fieldErrors?.bannerUrl}
        hint="Mesma proporção dos cards da vitrine (16:9). Sem capa, o portal usa o produto em destaque — se a opção abaixo estiver ligada."
        cropTitle="Ajustar capa da vitrine"
        preview={
          url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Prévia da capa"
              className="aspect-[16/9] w-full rounded-xl object-cover"
            />
          ) : (
            <div className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-sm text-[rgb(var(--foreground-muted))]">
              Sem capa
            </div>
          )
        }
      />
      <FieldError errors={state.fieldErrors?.bannerUrl} />

      {url ? (
        <button
          type="button"
          className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          onClick={() => {
            setUrl('')
            queueMicrotask(() => {
              formRef.current?.dispatchEvent(new Event('input', { bubbles: true }))
            })
          }}
        >
          Remover capa
        </button>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
        <input
          type="checkbox"
          name="usarDestaqueComoCapa"
          value="true"
          defaultChecked={usarDestaqueComoCapa}
          className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
            Usar produto em destaque como capa
          </span>
          <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
            Se não houver imagem de capa, o hero do catálogo mostra a foto do primeiro produto
            marcado como destaque.
          </span>
        </span>
      </label>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <StickyPersistBar
        locked={pending || isDirty}
        dirtyLabel={
          isDirty ? (changes.length === 1 ? changes[0] : `${changes.length} campos alterados`) : undefined
        }
        hint="A capa aparece no hero do catálogo desta unidade."
      >
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="rounded-xl bg-[rgb(var(--primary))] px-5 py-2 text-sm font-medium text-[rgb(var(--color-primary-on))] hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Salvar vitrine'}
        </button>
      </StickyPersistBar>
    </form>
  )
}
