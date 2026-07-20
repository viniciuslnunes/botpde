/**
 * Máquina de estados da SOLICITAÇÃO de unidade (afiliação de subsede/PDE à
 * torcida). Lógica pura, sem banco. Ver docs/data/proposta-governanca-hierarquica.md.
 *
 * Nasce PENDENTE (onboarding "Solicitar cadastro de unidade"). Só o Presidente
 * (owner) da torcida-alvo ou o super-admin DECIDEM — "peso final do Presidente"
 * é workflow, não RBAC. Aprovar cria a Sede (SUBSEDE/PDE) sob a torcida.
 */

export type StatusSolicitacaoUnidade = 'PENDENTE' | 'APROVADA' | 'RECUSADA'

export type AcaoSolicitacao = 'aprovar' | 'recusar'

export interface AtorSolicitacao {
  /** Permissão efetiva AFFILIATION_MANAGE (owner + vice; admin comum não tem). */
  temAffiliationManage: boolean
  /** Cargo de sistema 'owner' no tenant da torcida-alvo (Presidente). */
  isOwner: boolean
  /** E-mail na lista de super-admins da plataforma. */
  isSuperAdmin: boolean
}

export type TransicaoSolicitacao =
  | { ok: true; status: StatusSolicitacaoUnidade }
  | { ok: false; erro: string }

/** Peso final: só Presidente (owner com AFFILIATION_MANAGE) ou super-admin decidem. */
export function podeDecidirSolicitacao(ator: AtorSolicitacao): boolean {
  return ator.isSuperAdmin || (ator.temAffiliationManage && ator.isOwner)
}

export function transicionarSolicitacao(
  status: StatusSolicitacaoUnidade,
  acao: AcaoSolicitacao,
  ator: AtorSolicitacao,
): TransicaoSolicitacao {
  if (!podeDecidirSolicitacao(ator)) {
    return {
      ok: false,
      erro: 'Só o Presidente (owner) da torcida ou o super-admin podem decidir a solicitação.',
    }
  }
  if (status !== 'PENDENTE') {
    return { ok: false, erro: 'Só solicitações pendentes podem ser decididas.' }
  }
  return { ok: true, status: acao === 'aprovar' ? 'APROVADA' : 'RECUSADA' }
}

export const STATUS_SOLICITACAO_LABEL: Record<StatusSolicitacaoUnidade, string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  RECUSADA: 'Recusada',
}
