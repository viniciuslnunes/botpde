'use client'

import { useActionState } from 'react'
import { solicitarCadastro, type CadastroState } from '@/app/portal/cadastro/actions'
import { UserCircle2, Phone, MapPin, Tv2, ChevronRight, Building2 } from 'lucide-react'
import { FieldError, Input, Select, SubmitButton, hexToRgb } from '@torcida/ui'

const TIPO_SEDE_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'Ponto de Encontro',
}

type Props = {
  nomeInicial?: string
  corPrimaria?: string
  jaCadastrado?: boolean
  sedes?: { id: string; nome: string; tipo: string }[]
}

export function CadastroForm({
  nomeInicial = '',
  corPrimaria = '#7c3aed',
  jaCadastrado,
  sedes = [],
}: Props) {
  const [state, action] = useActionState<CadastroState, FormData>(solicitarCadastro, {})

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
          <Input
            id="nome"
            name="nome"
            type="text"
            defaultValue={nomeInicial}
            placeholder="Seu nome completo"
            required
           
          />
          <FieldError errors={state.errors?.nome} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Idade */}
          <div>
            <label htmlFor="idade" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Idade
            </label>
            <Input
              id="idade"
              name="idade"
              type="number"
              min={10}
              max={120}
              placeholder="Ex: 25"
             
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
            <Input
              id="telefone"
              name="telefone"
              type="tel"
              placeholder="(11) 99999-9999"
             
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
          <Input
            id="cidade"
            name="cidade"
            type="text"
            placeholder="Ex: São Paulo, SP"
           
          />
          <FieldError errors={state.errors?.cidade} />
        </div>

        {/* Unidade — só aparece quando a torcida tem mais de uma sede/subsede/PDE */}
        {sedes.length > 1 && (
          <div>
            <label htmlFor="sedeId" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Sua unidade <span className="text-red-500">*</span>
              </span>
            </label>
            <Select id="sedeId" name="sedeId" required defaultValue="">
              <option value="" disabled>
                Selecione sua sede, subsede ou ponto de encontro
              </option>
              {sedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {TIPO_SEDE_LABEL[sede.tipo] ?? sede.tipo} — {sede.nome}
                </option>
              ))}
            </Select>
            <FieldError errors={state.errors?.sedeId} />
          </div>
        )}
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
        <Input
          id="discordTag"
          name="discordTag"
          type="text"
          placeholder="Ex: seuusuario"
         
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

      <div className="pt-2" style={{ '--color-primary': hexToRgb(corPrimaria) } as React.CSSProperties}>
        <SubmitButton
          label="Enviar solicitação"
          pendingLabel="Enviando..."
          icon={<ChevronRight className="h-4 w-4" />}
          iconPosition="trailing"
          fullWidth
        />
      </div>
    </form>
  )
}
