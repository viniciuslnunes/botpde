import { canViewRecurso, type TenantRelation } from '@torcida/types'

export type VisibilidadeCanal = 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO'

/**
 * Gate puro de listagem/detalhe de canal (oficial ou temático).
 *
 * - `PUBLICO` — vitrine: qualquer viewer no alcance comunidade (sócio ou torcedor).
 * - Demais — só sócio; aliados só quando `ALIADOS` (ou via `PUBLICO` acima).
 */
export function decidePodeVerCanal(opts: {
  relation: TenantRelation
  visibilidade: VisibilidadeCanal
  isSocio: boolean
}): boolean {
  const { relation, visibilidade, isSocio } = opts

  if (visibilidade === 'PUBLICO') {
    return canViewRecurso(relation, 'comunidade')
  }

  if (!isSocio) return false

  switch (visibilidade) {
    case 'TENANT':
      return relation === 'self'
    case 'HIERARQUIA':
      return relation === 'self' || relation === 'ancestor' || relation === 'descendant'
    case 'ALIADOS':
      return (
        relation === 'self' ||
        relation === 'ancestor' ||
        relation === 'descendant' ||
        relation === 'allied'
      )
    default:
      return false
  }
}

/** Tipo da unidade territorial ligada ao canal oficial (`Sede.tipo`). */
export type TipoUnidadeCanal = 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'

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
  /** Membro silenciou o canal no feed/notificações (`MembroConversa.silenciada`). */
  silenciada: boolean
  tenantNome: string
  /**
   * Localização da unidade (`Sede` via `canalConversaId`).
   * Null em canais temáticos ou oficiais ainda sem sede ligada.
   */
  tipoUnidade: TipoUnidadeCanal | null
  cidade: string | null
  estado: string | null
  lat: number | null
  lng: number | null
}

/** Card leve do aside "Canais sugeridos" — espelha `SugestaoAutorAside`. */
export interface SugestaoCanalAside {
  id: string
  tenantId: string
  nome: string | null
  avatarUrl: string | null
  membros: number
  canalOficial: boolean
  publica: boolean
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
