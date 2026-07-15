import type { PostSocialItem } from './feed'
import type { ProximoEventoItem } from './eventos'

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
  tenantNome: string
}

export interface UnidadeBuscaItem {
  tenantId: string
  nome: string
  logoUrl: string | null
  tipo: string
  cidade: string | null
}

export interface ComunicadoInstitucionalItem {
  id: string
  titulo: string
  corpo: string
  prioridade: 'NORMAL' | 'IMPORTANTE' | 'URGENTE'
  fixado: boolean
  publicadoEm: Date
}

export interface PerfilInstitucional {
  tenantId: string
  nome: string
  logoUrl: string | null
  corPrimaria: string
  tipo: string
  cidade: string | null
  canalOficialId: string
  souMembroCanal: boolean
  podePublicar: boolean
  comunicados: ComunicadoInstitucionalItem[]
  postsInstitucionais: PostSocialItem[]
  postsCanal: PostSocialItem[]
  proximosEventos: ProximoEventoItem[]
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
