'use client'

import { useActionState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import {
  adicionarMembroAreaDepartamento,
  removerMembroAreaDepartamento,
  type ActionState,
} from '@/app/portal/departamentos/actions'
import { useActionStateToast } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import {
  DepartamentoOpcao,
  DepartamentoOpcaoLista,
  DepartamentoOpcaoPicker,
} from './departamento-opcao-picker'

export function DepartamentoAreaMembroSecao({
  areasDaPessoa,
  areasDisponiveis,
  podeGerir,
  departamentoId,
  slug,
  targetUserId,
  personLabel,
}: {
  areasDaPessoa: DepartamentoOpcao[]
  areasDisponiveis: DepartamentoOpcao[]
  podeGerir: boolean
  departamentoId: string
  slug: string
  targetUserId: string
  personLabel: string
}) {
  if (areasDaPessoa.length === 0 && (!podeGerir || areasDisponiveis.length === 0)) return null

  return (
    <div className="w-full min-w-0 border-t border-[rgb(var(--border))] pt-2">
      <DepartamentoOpcaoLista
        itens={areasDaPessoa}
        podeRemover={podeGerir}
        renderRemover={(area) => (
          <DepartamentoAreaRemoverBotao
            departamentoId={departamentoId}
            slug={slug}
            areaId={area.id}
            areaNome={area.nome}
            targetUserId={targetUserId}
            personLabel={personLabel}
          />
        )}
      />
      {podeGerir && areasDisponiveis.length > 0 ? (
        <DepartamentoAreaAdicionarPicker
          departamentoId={departamentoId}
          slug={slug}
          targetUserId={targetUserId}
          areasDisponiveis={areasDisponiveis}
        />
      ) : null}
    </div>
  )
}

export function DepartamentoAreaAdicionarPicker({
  departamentoId,
  slug,
  targetUserId,
  areasDisponiveis,
}: {
  departamentoId: string
  slug: string
  targetUserId: string
  areasDisponiveis: DepartamentoOpcao[]
}) {
  const [state, action, pending] = useActionState(adicionarMembroAreaDepartamento, {} as ActionState)
  const [, startSalvar] = useTransition()

  useActionStateToast(state, pending, 'Incluído na área')

  function escolher(areaId: string) {
    if (!areaId) return
    const fd = new FormData()
    fd.set('departamentoId', departamentoId)
    fd.set('slug', slug)
    fd.set('targetUserId', targetUserId)
    fd.set('areaId', areaId)
    startSalvar(() => {
      void action(fd)
    })
  }

  return (
    <DepartamentoOpcaoPicker
      opcoes={areasDisponiveis}
      value=""
      onChange={escolher}
      placeholder="Adicionar área…"
      disabled={pending}
      ariaLabel="Adicionar área"
      menuAriaLabel="Áreas disponíveis"
      iconeItem={Plus}
    />
  )
}

export function DepartamentoAreaRemoverBotao({
  departamentoId,
  slug,
  areaId,
  areaNome,
  targetUserId,
  personLabel,
}: {
  departamentoId: string
  slug: string
  areaId: string
  areaNome: string
  targetUserId: string
  personLabel: string
}) {
  const confirmAction = useConfirmAction()
  return (
    <button
      type="button"
      onClick={() =>
        void confirmAction({
          titulo: `Remover ${personLabel} de ${areaNome}?`,
          descricao: 'A pessoa continua no departamento; só sai desta área.',
          labelConfirmar: 'Remover',
          variante: 'destructive',
          cancelled: false,
          run: async () => {
            const fd = new FormData()
            fd.set('areaId', areaId)
            fd.set('departamentoId', departamentoId)
            fd.set('slug', slug)
            fd.set('targetUserId', targetUserId)
            return removerMembroAreaDepartamento({}, fd)
          },
          success: `Removido de ${areaNome}`,
        })
      }
      className="app-sem-piso-toque app-touch-line -mr-1 inline-flex shrink-0 items-center justify-center rounded-full p-0.5 leading-none text-[rgb(var(--foreground-muted))] hover:text-red-600"
      title="Remover da área"
      aria-label={`Remover de ${areaNome}`}
    >
      ×
    </button>
  )
}
