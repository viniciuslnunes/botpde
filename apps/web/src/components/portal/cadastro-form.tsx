'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { solicitarCadastro, type CadastroState } from '@/app/portal/cadastro/actions'
import { UserCircle2, Phone, MapPin, Tv2, ChevronRight, Loader2 } from 'lucide-react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Enviando...
        </>
      ) : (
        <>
          Enviar solicitação
          <ChevronRight className="h-4 w-4" />
        </>
      )}
    </button>
  )
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="mt-1 text-xs text-red-500">{errors[0]}</p>
}

type Props = {
  nomeInicial?: string
  corPrimaria?: string
  jaCadastrado?: boolean
}

export function CadastroForm({ nomeInicial = '', corPrimaria = '#7c3aed', jaCadastrado }: Props) {
  const [state, action] = useActionState<CadastroState, FormData>(solicitarCadastro, {})

  const inputClass =
    'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-2.5 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-transparent focus:ring-2 focus:ring-[rgb(var(--color-primary))] transition-all'

  return (
    <form action={action} className="space-y-6">
      {state.message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      {/* Tipo de cadastro */}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-[rgb(var(--foreground))]">
          Tipo de cadastro <span className="text-red-500">*</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            {
              value: 'TORCEDOR',
              title: 'Torcedor',
              desc: 'Faço parte da torcida e quero ter acesso à comunidade, eventos e novidades.',
            },
            {
              value: 'SOCIO',
              title: 'Sócio',
              desc: 'Quero contribuir mensalmente e ter acesso a benefícios exclusivos e carteirinha.',
            },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className="group flex cursor-pointer gap-3 rounded-xl border border-[rgb(var(--border))] p-4 transition-all has-[:checked]:border-[rgb(var(--color-primary))] has-[:checked]:bg-[rgb(var(--color-primary))]/5"
            >
              <input
                type="radio"
                name="tipo"
                value={opt.value}
                className="mt-1 accent-[rgb(var(--color-primary))]"
                required
              />
              <div>
                <p className="font-semibold text-[rgb(var(--foreground))]">{opt.title}</p>
                <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <FieldError errors={state.errors?.tipo} />
      </fieldset>

      {/* Dados pessoais */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <UserCircle2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          Dados pessoais
        </h3>

        {/* Nome */}
        <div>
          <label htmlFor="nome" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Nome completo <span className="text-red-500">*</span>
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            defaultValue={nomeInicial}
            placeholder="Seu nome completo"
            required
            className={inputClass}
          />
          <FieldError errors={state.errors?.nome} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Idade */}
          <div>
            <label htmlFor="idade" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Idade
            </label>
            <input
              id="idade"
              name="idade"
              type="number"
              min={10}
              max={120}
              placeholder="Ex: 25"
              className={inputClass}
            />
            <FieldError errors={state.errors?.idade} />
          </div>

          {/* Telefone */}
          <div>
            <label htmlFor="telefone" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Telefone / WhatsApp
              </span>
            </label>
            <input
              id="telefone"
              name="telefone"
              type="tel"
              placeholder="(11) 99999-9999"
              className={inputClass}
            />
            <FieldError errors={state.errors?.telefone} />
          </div>
        </div>

        {/* Cidade */}
        <div>
          <label htmlFor="cidade" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Cidade / Estado
            </span>
          </label>
          <input
            id="cidade"
            name="cidade"
            type="text"
            placeholder="Ex: São Paulo, SP"
            className={inputClass}
          />
          <FieldError errors={state.errors?.cidade} />
        </div>
      </div>

      {/* Discord */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <Tv2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          Discord <span className="ml-1 text-xs font-normal text-[rgb(var(--foreground-muted))]">(opcional)</span>
        </h3>
        <label htmlFor="discordTag" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Usuário no Discord
        </label>
        <input
          id="discordTag"
          name="discordTag"
          type="text"
          placeholder="Ex: seuusuario"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
          Informe seu usuário para vincular sua conta ao servidor da torcida.
        </p>
        <FieldError errors={state.errors?.discordTag} />
      </div>

      {/* Aviso re-envio */}
      {jaCadastrado && (
        <div className="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
          Seu cadastro anterior foi reprovado. Ao enviar novamente, a solicitação volta para análise.
        </div>
      )}

      <div className="pt-2" style={{ '--color-primary': corPrimaria } as React.CSSProperties}>
        <SubmitButton />
      </div>
    </form>
  )
}
