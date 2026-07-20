/**
 * Máquina de estados da afiliação de unidade (governança hierárquica — Fase 2).
 * Lógica pura, sem banco: decide quem pode transitar e para qual status.
 * Ver docs/data/proposta-governanca-hierarquica.md §9.
 *
 * - PENDENTE: Vice pode RECOMENDAR (permanece PENDENTE — não finaliza).
 * - PENDENTE → ATIVA / RECUSADA: só owner (Presidente) ou super-admin —
 *   "peso final do Presidente" é lógica de workflow, não RBAC.
 * - ATIVA → ENCERRADA: owner ou super-admin, com motivo.
 */

export type StatusAfiliacaoUnidade = 'PENDENTE' | 'ATIVA' | 'RECUSADA' | 'ENCERRADA'

export type AcaoAfiliacao = 'recomendar' | 'aprovar' | 'recusar' | 'encerrar'

export interface AtorAfiliacao {
  /** Permissão efetiva AFFILIATION_MANAGE (owner + vice; admin comum não tem). */
  temAffiliationManage: boolean
  /** Cargo de sistema 'owner' no tenant da Sede-mãe (Presidente). */
  isOwner: boolean
  /** E-mail na lista de super-admins da plataforma. */
  isSuperAdmin: boolean
}

export type TransicaoAfiliacao =
  | { ok: true; status: StatusAfiliacaoUnidade }
  | { ok: false; erro: string }

/** Peso final: só Presidente (owner com AFFILIATION_MANAGE) ou super-admin decidem. */
export function podeDecidirAfiliacao(ator: AtorAfiliacao): boolean {
  return ator.isSuperAdmin || (ator.temAffiliationManage && ator.isOwner)
}

export function transicionarAfiliacao(
  status: StatusAfiliacaoUnidade,
  acao: AcaoAfiliacao,
  ator: AtorAfiliacao,
): TransicaoAfiliacao {
  switch (acao) {
    case 'recomendar': {
      if (!ator.isSuperAdmin && !ator.temAffiliationManage) {
        return { ok: false, erro: 'Sem permissão para recomendar afiliações.' }
      }
      if (status !== 'PENDENTE') {
        return { ok: false, erro: 'Só pedidos pendentes podem ser recomendados.' }
      }
      // Recomendação do Vice NÃO finaliza — o pedido permanece PENDENTE.
      return { ok: true, status: 'PENDENTE' }
    }
    case 'aprovar': {
      if (!podeDecidirAfiliacao(ator)) {
        return { ok: false, erro: 'Só o Presidente (owner) ou o suporte podem aprovar a afiliação.' }
      }
      if (status !== 'PENDENTE') {
        return { ok: false, erro: 'Só pedidos pendentes podem ser aprovados.' }
      }
      return { ok: true, status: 'ATIVA' }
    }
    case 'recusar': {
      if (!podeDecidirAfiliacao(ator)) {
        return { ok: false, erro: 'Só o Presidente (owner) ou o suporte podem recusar a afiliação.' }
      }
      if (status !== 'PENDENTE') {
        return { ok: false, erro: 'Só pedidos pendentes podem ser recusados.' }
      }
      return { ok: true, status: 'RECUSADA' }
    }
    case 'encerrar': {
      if (!podeDecidirAfiliacao(ator)) {
        return { ok: false, erro: 'Só o Presidente (owner) ou o suporte podem encerrar o vínculo.' }
      }
      if (status !== 'ATIVA') {
        return { ok: false, erro: 'Só vínculos ativos podem ser encerrados.' }
      }
      return { ok: true, status: 'ENCERRADA' }
    }
  }
}

export const STATUS_AFILIACAO_LABEL: Record<StatusAfiliacaoUnidade, string> = {
  PENDENTE: 'Pendente',
  ATIVA: 'Ativa',
  RECUSADA: 'Recusada',
  ENCERRADA: 'Encerrada',
}
