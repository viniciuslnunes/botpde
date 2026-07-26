'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { criarTenantInicial, atribuirOwnerAction, type SetupState } from './actions'
import { Loader2, ShieldCheck } from 'lucide-react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? 'Criando...' : 'Criar torcida'}
    </button>
  )
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[0]}</p>
}

const inputClass =
  'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))] transition-all'

export function AtribuirOwnerButton({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const [state, action, pending] = useActionState<SetupState, FormData>(atribuirOwnerAction, {})

  useEffect(() => {
    if (state.tenantId && state.tenantSlug) {
      router.push(`/super-admin/setup/sucesso?tenant=${state.tenantId}&slug=${state.tenantSlug}`)
    }
  }, [state.tenantId, state.tenantSlug, router])

  return (
    <form action={action}>
      <input type="hidden" name="tenantId" value={tenantId} />
      {state.message && !state.tenantId && (
        <p className="mb-1 text-xs text-red-600 dark:text-red-400">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-primary))] px-3 py-0.5 text-xs font-medium text-[rgb(var(--color-primary-fg))] transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
        {pending ? 'Atribuindo...' : 'Tornar-me owner'}
      </button>
    </form>
  )
}

export function SetupForm() {
  const [state, action] = useActionState<SetupState, FormData>(criarTenantInicial, {})

  return (
    <form action={action} className="space-y-4">
      {state.message && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Nome */}
        <div className="sm:col-span-2">
          <label htmlFor="nome" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Nome da torcida <span className="text-red-500">*</span>
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            placeholder="Ex: Gaviões da Fiel PDE"
            required
            className={inputClass}
          />
          <FieldError errors={state.errors?.nome} />
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="slug" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Slug (identificador) <span className="text-red-500">*</span>
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            placeholder="Ex: pde"
            required
            pattern="[a-z0-9-]+"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
            Letras minúsculas, números e hífens. Será usado na URL.
          </p>
          <FieldError errors={state.errors?.slug} />
        </div>

        {/* Cor primária */}
        <div>
          <label
            htmlFor="corPrimaria"
            className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
          >
            Cor primária
          </label>
          <div className="flex gap-2">
            <input
              id="corPrimaria"
              name="corPrimaria"
              type="color"
              defaultValue="#7c3aed"
              className="h-10 w-14 cursor-pointer rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1"
            />
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className="flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-xs text-[rgb(var(--foreground-muted))]"
              placeholder="#7c3aed"
              aria-hidden
            />
          </div>
          <FieldError errors={state.errors?.corPrimaria} />
        </div>
      </div>

      <div className="pt-2">
        <SubmitButton />
      </div>
    </form>
  )
}
