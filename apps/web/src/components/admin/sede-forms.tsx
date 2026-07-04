'use client'

import { useActionState, useTransition } from 'react'
import {
  criarSede,
  editarSede,
  alterarStatusSede,
  type SedeState,
} from '@/app/admin/sedes/actions'
import { Loader2, MapPin, Power, PowerOff } from 'lucide-react'
import { FieldError, Input, Select, Textarea, SubmitButton } from '@torcida/ui'

type SedeOption = { id: string; nome: string; tipo: string }

type SedeData = {
  id: string
  nome: string
  tipo: string
  sedeId: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  capacidade: number | null
  responsavel: string | null
  telefone: string | null
  horarios: string | null
  descricao: string | null
  ativa: boolean
}

function SedeFormFields({
  state,
  sedes,
  defaults,
}: {
  state: SedeState
  sedes: SedeOption[]
  defaults?: Partial<SedeData>
}) {
  return (
    <>
      {state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      {/* Tipo + Nome */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Tipo <span className="text-red-500">*</span>
          </label>
          <Select name="tipo" defaultValue={defaults?.tipo ?? 'PONTO_ENCONTRO'}>
            <option value="SEDE">Sede</option>
            <option value="SUBSEDE">Subsede</option>
            <option value="PONTO_ENCONTRO">Ponto de Encontro</option>
          </Select>
          <FieldError errors={state.errors?.tipo} />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Nome <span className="text-red-500">*</span>
          </label>
          <Input
            name="nome"
            type="text"
            defaultValue={defaults?.nome ?? ''}
            placeholder="Ex: PDE — Pinheiros"
            required
          />
          <FieldError errors={state.errors?.nome} />
        </div>
      </div>

      {/* Sede pai */}
      {sedes.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Pertence à sede
          </label>
          <Select name="sedeId" defaultValue={defaults?.sedeId ?? ''}>
            <option value="">— Independente (sede principal) —</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                [{s.tipo === 'SEDE' ? 'Sede' : s.tipo === 'SUBSEDE' ? 'Subsede' : 'PE'}] {s.nome}
              </option>
            ))}
          </Select>
          <FieldError errors={state.errors?.sedeId} />
        </div>
      )}

      {/* Localização */}
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <MapPin className="h-3.5 w-3.5" />
          Localização
        </h3>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Endereço
          </label>
          <Input
            name="endereco"
            type="text"
            defaultValue={defaults?.endereco ?? ''}
            placeholder="Rua, número, complemento"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              CEP
            </label>
            <Input name="cep" type="text" defaultValue={defaults?.cep ?? ''} placeholder="00000-000" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Cidade
            </label>
            <Input name="cidade" type="text" defaultValue={defaults?.cidade ?? ''} placeholder="São Paulo" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Estado
            </label>
            <Input name="estado" type="text" defaultValue={defaults?.estado ?? ''} placeholder="SP" maxLength={2} />
          </div>
        </div>
      </div>

      {/* Informações operacionais */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Informações operacionais
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Responsável
            </label>
            <Input
              name="responsavel"
              type="text"
              defaultValue={defaults?.responsavel ?? ''}
              placeholder="Nome do responsável"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Telefone
            </label>
            <Input
              name="telefone"
              type="tel"
              defaultValue={defaults?.telefone ?? ''}
              placeholder="(11) 99999-9999"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Capacidade (pessoas)
            </label>
            <Input
              name="capacidade"
              type="number"
              min={1}
              defaultValue={defaults?.capacidade?.toString() ?? ''}
              placeholder="Ex: 500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Horários de funcionamento
            </label>
            <Input
              name="horarios"
              type="text"
              defaultValue={defaults?.horarios ?? ''}
              placeholder="Ex: Seg–Sex 10h–18h"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Descrição / Observações
          </label>
          <Textarea
            name="descricao"
            rows={3}
            defaultValue={defaults?.descricao ?? ''}
            placeholder="Informações adicionais, regras, como chegar..."
            className="resize-none"
          />
        </div>
      </div>
    </>
  )
}

/* ── Criar ────────────────────────────────────────────────────────────────── */
export function CriarSedeForm({ sedes }: { sedes: SedeOption[] }) {
  const [state, action] = useActionState<SedeState, FormData>(criarSede, {})

  return (
    <form action={action} className="space-y-5">
      <SedeFormFields state={state} sedes={sedes} />
      <SubmitButton label="Criar sede" />
    </form>
  )
}

/* ── Editar ───────────────────────────────────────────────────────────────── */
export function EditarSedeForm({ sede, sedes }: { sede: SedeData; sedes: SedeOption[] }) {
  const boundAction = editarSede.bind(null, sede.id)
  const [state, action] = useActionState<SedeState, FormData>(boundAction, {})

  return (
    <form action={action} className="space-y-5">
      <SedeFormFields state={state} sedes={sedes.filter((s) => s.id !== sede.id)} defaults={sede} />
      <SubmitButton label="Salvar alterações" />
    </form>
  )
}

/* ── Toggle status ─────────────────────────────────────────────────────────── */
export function ToggleSedeButton({ sedeId, ativa }: { sedeId: string; ativa: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await alterarStatusSede(sedeId, !ativa)
        })
      }
      disabled={pending}
      className={[
        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        ativa
          ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950'
          : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950',
      ].join(' ')}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : ativa ? (
        <PowerOff className="h-3.5 w-3.5" />
      ) : (
        <Power className="h-3.5 w-3.5" />
      )}
      {ativa ? 'Desativar' : 'Ativar'}
    </button>
  )
}
