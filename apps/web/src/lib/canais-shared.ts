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
  /**
   * Canal interno de departamento ou área (`Departamento`/`DepartamentoArea`
   * → `canalConversaId`). Não é temático da Comunidade — roster via cargo.
   */
  ehCanalDepartamento: boolean
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
  /** Logo do tenant dono — navbar em canal de departamento usa a unidade, não o avatar da frente. */
  tenantLogoUrl: string | null
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
  ehCanalDepartamento?: boolean
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

/** Preview de posts Públicos de uma torcida (gate de rivalidade no loader). */
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

/** Badge da listagem: Oficial / Departamento / Temático. */
export function labelCategoriaCanal(canal: {
  canalOficial: boolean
  ehCanalDepartamento?: boolean
}): 'Oficial' | 'Departamento' | 'Temático' {
  if (canal.canalOficial) return 'Oficial'
  if (canal.ehCanalDepartamento) return 'Departamento'
  return 'Temático'
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

/**
 * Autor sócio APROVADO no tenant do post "Só torcida" — exclude TORCEDOR
 * (seed legado e regressões de gate) do mural do canal oficial.
 */
export type AutorSocioFeedInterno = {
  membros: {
    some: {
      tenantId: string
      tipo: 'SOCIO'
      status: 'APROVADO'
    }
  }
}

/**
 * `where.OR` do mural de um canal.
 *
 * - Sempre: posts com `conversaId` (sem filtrar `tenantId` do post — Caso B /
 *   canal emprestado publica com o tenant do viewer).
 * - Com `viewerTenantIdForFeedInterno` (só canal **oficial**): também posts
 *   "Só torcida" do feed aberto (`TENANT` + sem conversa) daquele tenant,
 *   **só de sócio APROVADO** — torcedor não publica no mural da torcida.
 *
 * Quem monta o `findMany` precisa **AND** este OR com o de `buildCursorWhere`
 * — os dois usam a chave `OR` e um espalhamento no mesmo nível apaga o cursor.
 */
export function orPostsDoMuralCanal(
  conversaId: string,
  viewerTenantIdForFeedInterno: string | null,
): Array<{
  conversaId: string | null
  tenantId?: string
  tipo?: 'MEMBRO'
  visibilidade?: 'TENANT'
  autor?: AutorSocioFeedInterno
}> {
  const ramos: Array<{
    conversaId: string | null
    tenantId?: string
    tipo?: 'MEMBRO'
    visibilidade?: 'TENANT'
    autor?: AutorSocioFeedInterno
  }> = [{ conversaId }]
  if (viewerTenantIdForFeedInterno) {
    ramos.push({
      conversaId: null,
      tenantId: viewerTenantIdForFeedInterno,
      tipo: 'MEMBRO',
      visibilidade: 'TENANT',
      autor: {
        membros: {
          some: {
            tenantId: viewerTenantIdForFeedInterno,
            tipo: 'SOCIO',
            status: 'APROVADO',
          },
        },
      },
    })
  }
  return ramos
}

/**
 * Decide se o mural oficial mistura posts "Só torcida" (`TENANT` sem
 * `conversaId`) — e de *qual* tenant.
 *
 * - Canal da Sede: sim, do tenant do viewer.
 * - Unidade Caso B (tenant próprio, distinto da mãe / sem canal `SEDE` neste
 *   tenant): sim, do tenant da unidade.
 * - Unidade Caso A (PDE/subsede no tenant da mãe): **não**. Misturar aqui
 *   despeja o feed da organizada inteira no mural de Londrina, Prudente, etc.
 */
export function decidirFeedInternoDoMural(opts: {
  canalOficial: boolean
  canalId: string
  oficialSedeId: string | null
  vinculoTenantId: string | null
  viewerTenantId: string
}): { incluir: boolean; feedInternoTenantId: string | null } {
  if (!opts.canalOficial) return { incluir: false, feedInternoTenantId: null }
  if (opts.oficialSedeId === opts.canalId) {
    return { incluir: true, feedInternoTenantId: opts.viewerTenantId }
  }
  if (opts.vinculoTenantId && opts.vinculoTenantId !== opts.viewerTenantId) {
    return { incluir: true, feedInternoTenantId: opts.vinculoTenantId }
  }
  if (opts.vinculoTenantId === opts.viewerTenantId && !opts.oficialSedeId) {
    return { incluir: true, feedInternoTenantId: opts.vinculoTenantId }
  }
  return { incluir: false, feedInternoTenantId: null }
}

export function canalOficialTemPortalProprio(opts: {
  /** Tipo da `Sede` dona do canal (`SEDE` / `SUBSEDE` / `PONTO_ENCONTRO`). */
  tipoSede: string | null
  /** Tenant da unidade dona. */
  tenantIdUnidade: string | null
  /** Tenant raiz da worktree (`resolverTenantRaizId`). */
  tenantIdRaiz: string | null
}): boolean {
  if (!opts.tenantIdUnidade) return false
  if (opts.tipoSede === 'SEDE') return true
  // Caso B: unidade com tenant próprio ≠ Sede raiz.
  if (opts.tenantIdRaiz && opts.tenantIdUnidade !== opts.tenantIdRaiz) return true
  // Caso A: PDE/subsede no tenant da mãe.
  return false
}

/**
 * Oficial com portal próprio (slug ≠ atual) → troca sessão.
 * Temático, mesmo tenant ou Caso A (slug null) → soft / cosmético.
 */
export function deveTrocarTenantAoAbrirCanal(opts: {
  canalOficial: boolean
  slugAlvo: string | null
  slugAtual: string | null
}): boolean {
  if (!opts.canalOficial) return false
  if (!opts.slugAlvo) return false
  return opts.slugAlvo !== opts.slugAtual
}
