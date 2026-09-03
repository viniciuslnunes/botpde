'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Check, RotateCcw, Trash2, UserMinus, UserPlus, X } from 'lucide-react'
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
import { AdminRowActions, type AdminRowActionItem } from '@/components/admin/ui'
import { BloquearMembroDialog } from './bloquear-membro-dialog'
import { ReprovarMembroDialog } from './reprovar-membro-dialog'
import { espelhoSomenteLeituraNoAdmin } from '@/lib/admin-membro-espelho'

interface MemberActionsProps {
  membroId: string
  status: 'PENDENTE' | 'APROVADO' | 'REPROVADO'
  /** Departamento pretendido no onboarding (sócio); exibido no diálogo de aprovação. */
  departamentoNome?: string | null
  /** Espelho na Sede (Caso B). */
  espelhado?: boolean
  /** Administração central — espelho analisado continua gerenciável. */
  isAdministracaoSede?: boolean
  /** Nome da unidade de origem (Caso B). */
  aprovadoNaUnidadeNome?: string | null
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
  isAdministracaoSede = false,
  aprovadoNaUnidadeNome,
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
  const router = useRouter()
  const [reprovarAberto, setReprovarAberto] = useState(false)
  const [bloquearAberto, setBloquearAberto] = useState(false)
  const depto = departamentoNome?.trim() || null
  const via = aprovadoNaUnidadeNome?.trim()
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

  async function handleAprovar(incluirDepartamento: boolean) {
    const comArea = incluirDepartamento && !!depto
    let destinoLista: 'aguardando' | 'ativos' | null = null
    const ok = await confirmAction({
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
      run: async () => {
        const r = await aprovarMembro(membroId, { incluirDepartamento })
        if (r && 'destinoLista' in r) destinoLista = r.destinoLista
        return r
      },
      success: comArea ? `Membro aprovado e incluído em ${depto}.` : 'Membro aprovado.',
      successDescription: isSocio
        ? 'Quem ainda não tem carteirinha aparece em Aguardando emissão; com carteirinha, em Ativos.'
        : undefined,
    })
    if (ok && destinoLista) {
      router.push(`/admin/socios?status=${destinoLista}`)
    }
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

  const itens: AdminRowActionItem[] = []

  if (podeEfetivarArea) {
    itens.push({
      id: 'efetivar-area',
      label: `Incluir em ${depto}`,
      icon: UserPlus,
      onSelect: () => void handleEfetivarArea(),
    })
  }

  const espelhoSoLeitura = espelhoSomenteLeituraNoAdmin(
    espelhado,
    status,
    isAdministracaoSede,
  )
  if (!espelhoSoLeitura) {
    if (status === 'PENDENTE' || status === 'REPROVADO') {
      itens.push({
        id: 'aprovar',
        label: 'Aprovar',
        icon: Check,
        tone: 'success',
        onSelect: () => void handleAprovar(true),
      })
      if (depto) {
        itens.push({
          id: 'sem-area',
          label: 'Aprovar sem área',
          icon: UserMinus,
          onSelect: () => void handleAprovar(false),
        })
      }
    }
    if (status === 'PENDENTE') {
      itens.push({
        id: 'reprovar',
        label: 'Reprovar',
        icon: X,
        tone: 'danger',
        onSelect: () => setReprovarAberto(true),
      })
    }
    if (status !== 'PENDENTE') {
      itens.push({
        id: 'reverter',
        label: 'Reverter para pendente',
        icon: RotateCcw,
        onSelect: () => void handleReverter(),
      })
    }
    if (podeBloquear && userId && status !== 'PENDENTE') {
      itens.push({
        id: 'bloqueio',
        label: bloqueado ? 'Desbloquear' : 'Bloquear',
        icon: Ban,
        tone: bloqueado ? 'muted' : 'danger',
        onSelect: () => void handleBloqueio(userId),
      })
    }
    if (podeApagar && (status === 'REPROVADO' || desligado)) {
      itens.push({
        id: 'apagar',
        label: 'Apagar',
        icon: Trash2,
        tone: 'danger',
        onSelect: () => void handleApagar(),
      })
    }
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

  const dialogoBloquear = userId ? (
    <BloquearMembroDialog
      key={bloquearAberto ? 'bloquear-aberto' : 'bloquear-fechado'}
      aberto={bloquearAberto}
      nomeMembro={nomeMembro}
      onFechar={() => setBloquearAberto(false)}
      bloquear={(motivo) => bloquearMembro(userId, motivo)}
    />
  ) : null

  return (
    <div className="flex flex-col items-end gap-1">
      {itens.length > 0 ? (
        <AdminRowActions
          ariaLabel={`Ações de ${nomeMembro?.trim() || 'cadastro'}`}
          items={itens}
        />
      ) : (
        <span className="text-xs text-[rgb(var(--foreground-muted))]">—</span>
      )}
      {dialogoReprovar}
      {dialogoBloquear}
    </div>
  )
}
