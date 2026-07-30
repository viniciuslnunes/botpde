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

/**
 * Campos locais gravados no snapshot da solicitação — após APROVADA a fonte
 * de verdade passa a ser a `Sede` vinculada (edições em /admin/sedes).
 */
export interface LocaisSolicitacao {
  nome: string
  tipo: 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string
  estado: string
  endereco: string | null
  cep: string | null
  lat: number | null
  lng: number | null
  fotoUrl: string | null
}

export interface SedeLiveParaSolicitacao {
  nome: string
  tipo: string
  cidade: string | null
  estado: string | null
  endereco: string | null
  cep: string | null
  lat: number | null
  lng: number | null
  fotoUrl: string | null
}

/**
 * Para APROVADA + `sedeId`, herda nome/endereço/coords/foto da Sede ao vivo.
 * PENDENTE/RECUSADA (ou sem sede) mantêm o snapshot do pedido.
 */
export function herdarDadosSedeNaSolicitacao<T extends LocaisSolicitacao>(
  solicitacao: T,
  status: StatusSolicitacaoUnidade,
  sede: SedeLiveParaSolicitacao | null | undefined,
): T {
  if (status !== 'APROVADA' || !sede) return solicitacao

  const tipo =
    sede.tipo === 'SUBSEDE' || sede.tipo === 'PONTO_ENCONTRO' ? sede.tipo : solicitacao.tipo

  return {
    ...solicitacao,
    nome: sede.nome,
    tipo,
    cidade: sede.cidade?.trim() ? sede.cidade : solicitacao.cidade,
    estado: sede.estado?.trim() ? sede.estado : solicitacao.estado,
    endereco: sede.endereco,
    cep: sede.cep,
    lat: sede.lat,
    lng: sede.lng,
    fotoUrl: sede.fotoUrl,
  }
}
