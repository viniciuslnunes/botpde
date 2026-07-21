export type VisibilidadeCanal = 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO'

export interface CanalItem {
  id: string
  tenantId: string
  nome: string | null
  descricao: string | null
  avatarUrl: string | null
  institucional: boolean
  canalOficial: boolean
  visibilidadeCanal: VisibilidadeCanal
  somenteAdminPublica: boolean
  publica: boolean
  membros: number
  souMembro: boolean
  souAdmin: boolean
  /** Pedido de entrada enviado e ainda não decidido (canal fechado, `publica: false`). */
  pedidoPendente: boolean
  tenantNome: string
}

export interface MembroCanalItem {
  userId: string
  nome: string | null
  avatarUrl: string | null
  papel: 'ADMIN' | 'MEMBRO'
}

export interface PedidoCanalItem {
  userId: string
  nome: string | null
  avatarUrl: string | null
  /** Quando o pedido foi enviado (`MembroConversa.entrouEm` no status PENDENTE). */
  pedidoEm: string
}

/** Membro aprovado do tenant elegível para adicionar direto a um canal fechado. */
export interface CandidatoMembroCanalItem {
  userId: string
  nome: string | null
}

export interface UnidadeBuscaItem {
  tenantId: string
  nome: string
  logoUrl: string | null
  tipo: string
  cidade: string | null
}

export function isConversaGrupoLike(tipo: string): boolean {
  return tipo === 'GRUPO' || tipo === 'CANAL'
}

export function linkUnidadeComunidade(tenantId: string): string {
  return `/portal/comunidade/unidade/${tenantId}`
}

/** Preview de posts Públicos de uma torcida (sem gate de aliança). */
export function linkTorcidaComunidadePublica(tenantId: string): string {
  return `/portal/comunidade/torcida/${tenantId}`
}

export function linkCanalComunidade(conversaId: string): string {
  return `/portal/comunidade/canais/${conversaId}`
}

export function labelTipoUnidade(tipo: string): string {
  switch (tipo) {
    case 'SEDE':
      return 'Sede'
    case 'SUBSEDE':
      return 'Subsede'
    case 'PONTO_ENCONTRO':
      return 'PDE'
    default:
      return 'Unidade'
  }
}

export function labelVisibilidadeCanal(v: VisibilidadeCanal): string {
  switch (v) {
    case 'TENANT':
      return 'Só esta torcida'
    case 'HIERARQUIA':
      return 'Hierarquia (sede/subsede/PDE)'
    case 'ALIADOS':
      return 'Hierarquia + aliados'
    case 'PUBLICO':
      return 'Comunidade aberta'
    default:
      return v
  }
}
