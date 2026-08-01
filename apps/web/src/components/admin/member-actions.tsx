'use client'

import { useState } from 'react'
import { Ban, Check, X, RotateCcw, Trash2, UserPlus } from 'lucide-react'
import {
  apagarMembroDefinitivo,
  aprovarMembro,
  bloquearMembro,
  desbloquearMembro,
  efetivarAreaPretendida,
  reprovarMembro,
  reverterMembro,
} from '@/app/admin/membros/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { BloquearMembroDialog } from './bloquear-membro-dialog'
import { ReprovarMembroDialog } from './reprovar-membro-dialog'

interface MemberActionsProps {
  membroId: string
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO'
  /** Departamento pretendido no onboarding (sócio); exibido no diálogo de aprovação. */
  departamentoNome?: string | null
  /** Espelho na Sede — PENDENTE pode ser decidido pela Sede (exceção R1); demais só leitura. */
  espelhado?: boolean
  /** Nome da unidade de origem (Caso B). */
  aprovadoNaUnidadeNome?: string | null
  aprovadoPorNome?: string | null
  aprovadoEmLabel?: string | null
  /** Contexto do diálogo de reprovação (quando quem chama tem o cadastro em mãos). */
  nomeMembro?: string | null
  isSocio?: boolean
  /** Etapas obrigatórias já detectadas como incompletas; vêm pré-marcadas. */
  pontosIncompletos?: string[]
  /**
   * Sócio APROVADO cuja área pretendida **neste nível** ainda não entrou em
   * vigor — o outro nível venceu o first-wins da fila e só efetivou a dele.
   * `undefined` = a tela não calculou; não mostra a ação.
   */
  areaPendenteEfetivacao?: boolean
  /** `members:block`. Sem ela as ações de bloqueio não aparecem. */
  podeBloquear?: boolean
  /** Usuário por trás do cadastro — o bloqueio é sobre ele, não sobre a ficha. */
  userId?: string | null
  /** Já bloqueado neste tenant (ou herdado da Sede). */
  bloqueado?: boolean
  /** `members:purge` — só Presidente e super-admin. Hard delete do cadastro. */
  podeApagar?: boolean
  /** Desligado: junto com REPROVADO, é o que habilita apagar de vez. */
  desligado?: boolean
}

export function MemberActions({
  membroId,
  status,
  departamentoNome,
  espelhado,
  aprovadoNaUnidadeNome,
  aprovadoPorNome,
  aprovadoEmLabel,
  nomeMembro,
  isSocio,
  pontosIncompletos,
  areaPendenteEfetivacao,
  podeBloquear = false,
  userId,
  bloqueado = false,
  podeApagar = false,
  desligado = false,
}: MemberActionsProps) {
  const confirmAction = useConfirmAction()
  const [reprovarAberto, setReprovarAberto] = useState(false)
  const [bloquearAberto, setBloquearAberto] = useState(false)
  const depto = departamentoNome?.trim() || null
  const via = aprovadoNaUnidadeNome?.trim()
  const quem = aprovadoPorNome?.trim()
  const quando = aprovadoEmLabel?.trim()
  // O vínculo é first-wins nos dois níveis, a área não: quem não decidiu
  // efetiva a sua aqui. Ver `efetivarAreaPretendida`.
  const podeEfetivarArea = status === 'APROVADO' && areaPendenteEfetivacao === true && !!depto

  async function handleEfetivarArea() {
    await confirmAction({
      titulo: `Incluir em ${depto}?`,
      descricao: `A pessoa entra na equipe de ${depto} deste nível. O vínculo de sócio já está aprovado — a área é decidida por cada nível da hierarquia separadamente.`,
      labelConfirmar: 'Incluir na área',
      variante: 'success',
      cancelled: 'Inclusão cancelada.',
      run: () => efetivarAreaPretendida(membroId),
      success: `Incluído em ${depto}.`,
    })
  }

  const botaoEfetivarArea = podeEfetivarArea ? (
    <button
      type="button"
      onClick={() => void handleEfetivarArea()}
      className="app-action flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] sm:px-3"
      title={`Colocar em vigor a área pretendida (${depto}) neste nível`}
    >
      <UserPlus className="h-3.5 w-3.5" />
      Incluir em {depto}
    </button>
  ) : null

  // Espelho já decidido: só leitura do cadastro + rastro de quem analisou. A
  // área deste nível continua sendo decisão local — não é mutação do espelho.
  if (espelhado && status !== 'PENDENTE') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs text-[rgb(var(--foreground-muted))]">
          {quem
            ? `Analisada por ${quem}${quando ? ` em ${quando}` : ''}`
            : via
              ? `Aprovado via ${via}`
              : 'Espelho da Sede'}
        </span>
        {botaoEfetivarArea}
      </div>
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
          : espelhado && via
            ? `Solicitação via ${via}. Quem decidir primeiro (Sede ou unidade) encerra a análise nos dois lados.`
            : 'A pessoa passa a ter acesso conforme o status de sócio/torcedor aprovado.',
      labelConfirmar: comArea ? 'Aprovar e incluir' : 'Aprovar',
      variante: 'success',
      cancelled: 'Aprovação cancelada.',
      run: () => aprovarMembro(membroId, { incluirDepartamento }),
      success: comArea ? `Membro aprovado e incluído em ${depto}.` : 'Membro aprovado.',
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

  const dialogoReprovar = (
    <ReprovarMembroDialog
      key={reprovarAberto ? 'reprovar-aberto' : 'reprovar-fechado'}
      aberto={reprovarAberto}
      nomeMembro={nomeMembro}
      isSocio={isSocio}
      pontosSugeridos={pontosIncompletos}
      avisoEspelho={
        espelhado && via
          ? `Solicitação via ${via}. A reprovação encerra a análise na Sede e na unidade.`
          : null
      }
      podeBloquear={podeBloquear}
      onFechar={() => setReprovarAberto(false)}
      reprovar={(input) => reprovarMembro(membroId, input)}
    />
  )

  async function handleBloqueio(alvoUserId: string) {
    if (!bloqueado) {
      setBloquearAberto(true)
      return
    }
    await confirmAction({
      titulo: 'Remover o bloqueio?',
      descricao: 'A pessoa volta a poder enviar solicitações para esta unidade.',
      labelConfirmar: 'Desbloquear',
      cancelled: 'Bloqueio mantido.',
      run: () => desbloquearMembro(alvoUserId),
      success: 'Bloqueio removido.',
    })
  }

  // Bloqueio é sobre o usuário e sobrevive ao cadastro: fica disponível fora da
  // fila (reprovado/desligado), nunca sobre quem está em análise — para isso o
  // caminho é reprovar com bloqueio, numa decisão só.
  const acaoBloqueio =
    podeBloquear && userId && status !== 'PENDENTE' ? (
      <button
        onClick={() => void handleBloqueio(userId)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
      >
        <Ban className="h-3.5 w-3.5" />
        {bloqueado ? 'Desbloquear' : 'Bloquear'}
      </button>
    ) : null

  async function handleApagar() {
    await confirmAction({
      titulo: 'Apagar este cadastro de vez?',
      descricao:
        'O cadastro e a carteirinha somem da torcida e das unidades. O registro de auditoria e um bloqueio, se houver, permanecem. Não dá para desfazer.',
      labelConfirmar: 'Apagar',
      variante: 'destructive',
      cancelled: 'Cadastro mantido.',
      run: () => apagarMembroDefinitivo(membroId),
      success: 'Cadastro apagado.',
    })
  }

  // Hard delete só depois de reprovado/desligado — o servidor repete a regra.
  const acaoApagar =
    podeApagar && (status === 'REPROVADO' || desligado) ? (
      <button
        onClick={() => void handleApagar()}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--color-danger))] transition-colors hover:underline"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Apagar
      </button>
    ) : null

  const dialogoBloquear = userId ? (
    <BloquearMembroDialog
      key={bloquearAberto ? 'bloquear-aberto' : 'bloquear-fechado'}
      aberto={bloquearAberto}
      nomeMembro={nomeMembro}
      onFechar={() => setBloquearAberto(false)}
      bloquear={(motivo) => bloquearMembro(userId, motivo)}
    />
  ) : null

  if (status === 'PENDENTE') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        {espelhado && via && (
          <span className="mr-auto text-xs text-[rgb(var(--foreground-muted))] sm:mr-2">
            Via {via}
          </span>
        )}
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
          type="button"
          onClick={() => setReprovarAberto(true)}
          aria-label="Reprovar"
          className="btn-danger-soft app-action flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3"
        >
          <X className="h-3.5 w-3.5" />
          <span className="max-sm:sr-only">Reprovar</span>
        </button>
        {dialogoReprovar}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
      {botaoEfetivarArea}
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
      {acaoBloqueio}
      {acaoApagar}
      {dialogoBloquear}
    </div>
  )
}
