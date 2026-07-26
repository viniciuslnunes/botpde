'use client'

import { Check, X, RotateCcw } from 'lucide-react'
import { aprovarMembro, reprovarMembro, reverterMembro } from '@/app/admin/membros/actions'
import { useConfirmAction } from '@/lib/confirm-action'

interface MemberActionsProps {
  membroId: string
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO'
  /** Departamento pretendido no onboarding (sócio); exibido no diálogo de aprovação. */
  departamentoNome?: string | null
  /** Espelho na Sede — só leitura; ações ficam na unidade de origem. */
  espelhado?: boolean
  /** Nome da unidade que aprovou o sócio original. */
  aprovadoNaUnidadeNome?: string | null
}

export function MemberActions({
  membroId,
  status,
  departamentoNome,
  espelhado,
  aprovadoNaUnidadeNome,
}: MemberActionsProps) {
  const confirmAction = useConfirmAction()
  const depto = departamentoNome?.trim() || null

  if (espelhado) {
    const via = aprovadoNaUnidadeNome?.trim()
    return (
      <span className="text-xs text-[rgb(var(--foreground-muted))]">
        {via ? `Aprovado via ${via}` : 'Espelho da Sede'}
      </span>
    )
  }

  async function handleAprovar(incluirDepartamento: boolean) {
    const comArea = incluirDepartamento && !!depto
    await confirmAction({
      titulo: comArea ? `Aprovar e incluir em ${depto}?` : 'Aprovar este membro?',
      descricao: comArea
        ? `A pessoa entra na torcida e na equipe de ${depto}. A preferência veio do onboarding.`
        : depto
          ? `A pessoa entra na torcida sem entrar na equipe de ${depto}. Você pode incluir depois em Departamentos.`
          : 'A pessoa passa a ter acesso conforme o status de sócio/torcedor aprovado.',
      labelConfirmar: comArea ? 'Aprovar e incluir' : 'Aprovar',
      variante: 'success',
      cancelled: 'Aprovação cancelada.',
      run: () => aprovarMembro(membroId, { incluirDepartamento }),
      success: comArea ? `Membro aprovado e incluído em ${depto}.` : 'Membro aprovado.',
    })
  }

  async function handleReprovar() {
    await confirmAction({
      titulo: 'Reprovar este membro?',
      descricao: 'A solicitação será marcada como reprovada.',
      labelConfirmar: 'Reprovar',
      variante: 'destructive',
      cancelled: 'Reprovação cancelada.',
      run: () => reprovarMembro(membroId),
      success: 'Membro reprovado.',
    })
  }

  async function handleReverter() {
    await confirmAction({
      titulo: 'Reverter para pendente?',
      descricao: depto
        ? `O membro volta à fila. Membership de área (ex.: ${depto}) é removida.`
        : 'O membro volta à fila de solicitação. Membership de área, se houver, é removida.',
      labelConfirmar: 'Reverter',
      cancelled: 'Reversão cancelada.',
      run: () => reverterMembro(membroId),
      success: 'Membro movido para pendente.',
    })
  }

  if (status === 'PENDENTE') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        <button
          onClick={() => void handleAprovar(true)}
          aria-label="Aprovar"
          className="btn-success app-action flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-[filter] sm:px-3"
        >
          <Check className="h-3.5 w-3.5" />
          <span className="max-sm:sr-only">Aprovar</span>
        </button>
        {depto && (
          <button
            type="button"
            onClick={() => void handleAprovar(false)}
            className="app-action hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] sm:inline-flex"
            title={`Aprovar sem incluir em ${depto}`}
          >
            Sem área
          </button>
        )}
        <button
          onClick={() => void handleReprovar()}
          aria-label="Reprovar"
          className="btn-danger-soft app-action flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3"
        >
          <X className="h-3.5 w-3.5" />
          <span className="max-sm:sr-only">Reprovar</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
      <button
        onClick={() => void handleReverter()}
        aria-label="Reverter para pendente"
        className="app-action flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] sm:px-3"
        title="Mover de volta para pendente"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        <span className="max-sm:sr-only">Reverter</span>
      </button>
      {status === 'REPROVADO' && (
        <>
          <button
            onClick={() => void handleAprovar(true)}
            aria-label="Aprovar"
            className="btn-success app-action flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-[filter] sm:px-3"
          >
            <Check className="h-3.5 w-3.5" />
            <span className="max-sm:sr-only">Aprovar</span>
          </button>
          {depto && (
            <button
              type="button"
              onClick={() => void handleAprovar(false)}
              className="app-action hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] sm:inline-flex"
              title={`Aprovar sem incluir em ${depto}`}
            >
              Sem área
            </button>
          )}
        </>
      )}
    </div>
  )
}
