import type { TipoNotificacao } from '@torcida/db'
import {
  resolverMenuIdDeRota,
  resolverModuloDeRota,
  resolverTabHrefDeRota,
} from '@torcida/types'

/**
 * Mapa tipo → **rota que resolve a pendência** (a tab/página onde o gestor age).
 * Mantido espelhado com `rota` em POLITICA_POR_TIPO (notificacoes-routing).
 * Arquivo separado para evitar ciclo notificacoes ↔ notificacoes-routing.
 *
 * Por que rota e não id de menu: ao promover uma rota a tab de módulo, a
 * entrada some de ADMIN_MENU e um id fixo apontaria para o nada — o badge
 * sumiria em silêncio (aconteceu com estoque/fiado/estorno/pedidos na wave 1).
 * Resolvendo por rota, o badge sobe sozinho para a entrada do módulo.
 */
export const ROTA_POR_TIPO: Partial<Record<TipoNotificacao, string>> = {
  MEMBRO_SOLICITADO: '/admin/socios?status=solicitacoes',
  DENUNCIA_NOVA: '/admin/comunidade/moderacao',
  ALIANCA_PROPOSTA: '/admin/aliancas?tab=recebidas',
  ALIANCA_ACEITA: '/admin/aliancas?tab=ativas',
  ALIANCA_REJEITADA: '/admin/aliancas?tab=historico',
  ALIANCA_ENCERRADA: '/admin/aliancas?tab=historico',
  ALIANCA_CANCELADA: '/admin/aliancas?tab=historico',
  COBRANCA_VENCIDA: '/admin/financeiro/cobrancas?status=VENCIDA',
  PATRIMONIO_RESPONSAVEL_DEFINIDO: '/admin/patrimonio?tab=pendencias',
  EVENTO_RSVP: '/admin/eventos',
  EVENTO_DIA_GESTOR: '/admin/eventos',
  PEDIDO_RECEBIDO: '/admin/loja/pedidos',
  BRECHO_DENUNCIA: '/admin/loja/brecho',
  SOLICITACAO_UNIDADE_CRIADA: '/admin/afiliacoes',
  BAR_ESTOQUE_BAIXO: '/admin/bar/estoque',
  BAR_FIADO_VENCIDO: '/admin/bar/comandas',
  BAR_COMANDA_VENCIDA: '/admin/bar/comandas',
  BAR_TURNO_DIVERGENCIA: '/admin/bar/pdv',
  BAR_ESTORNO_ANOMALO: '/admin/bar/estornos',
  CANAL_RESTRITO_ATIVADO: '/admin/sedes',
  CANAL_REATIVACAO_SOLICITADA: '/admin/configuracoes',
  CANAL_REATIVACAO_RECUSADA: '/admin/sedes',
  CANAL_REATIVADO: '/admin/sedes',
  COMUNICADO_URGENTE: '/admin/comunidade/comunicados',
  FINANCEIRO_LANCAMENTO: '/admin/financeiro/lancamentos',
  DESIGN_ATUALIZADO: '/admin/design',
}

/** Menu do sidebar admin associado ao tipo, se houver badge operacional. */
export function menuIdParaTipo(tipo: TipoNotificacao): string | null {
  const rota = ROTA_POR_TIPO[tipo]
  return rota ? resolverMenuIdDeRota(rota) : null
}

export type InboxBadgeRow = {
  tipo: TipoNotificacao
  link: string | null
}

export type PortalSecaoDepartamento = 'areas' | 'projetos' | 'equipe' | 'pedidos' | 'fila'

export type PortalNavBadges = {
  departamentos: number
  eventos: number
  loja: number
  carteirinha: number
  sedes: number
  comunidade: number
  porSlug: Record<string, number>
  porSecao: Record<string, Partial<Record<PortalSecaoDepartamento, number>>>
}

export type InboxBadges = {
  menuBadges: Record<string, number>
  tabBadges: Record<string, number>
  portalNavBadges: PortalNavBadges
}

export function emptyPortalNavBadges(): PortalNavBadges {
  return {
    departamentos: 0,
    eventos: 0,
    loja: 0,
    carteirinha: 0,
    sedes: 0,
    comunidade: 0,
    porSlug: {},
    porSecao: {},
  }
}

export function emptyInboxBadges(): InboxBadges {
  return {
    menuBadges: {},
    tabBadges: {},
    portalNavBadges: emptyPortalNavBadges(),
  }
}

function increment(map: Record<string, number>, key: string, n = 1): void {
  if (n <= 0) return
  map[key] = (map[key] ?? 0) + n
}

function secaoDeTab(valor: string): PortalSecaoDepartamento | null {
  if (valor === 'areas') return 'areas'
  if (valor === 'projetos') return 'projetos'
  if (valor === 'equipe' || valor === 'gestao') return 'equipe'
  if (valor === 'pedidos') return 'pedidos'
  if (valor === 'fila') return 'fila'
  return null
}

const PARAMS_TAB_BADGE = ['status', 'tab'] as const

function pathnameDeHref(href: string): string {
  return href.split('?')[0]?.split('#')[0] ?? href
}

/**
 * Chave estável para overlay de tabs por query (`?status=` / `?tab=`).
 * Ignora paginação, busca e sort — senão o href da tab nunca casa com o link
 * gravado na notificação.
 */
export function chaveTabBadge(href: string): string {
  const path = pathnameDeHref(href)
  const query = (href.split('#')[0] ?? '').split('?')[1] ?? ''
  const params = new URLSearchParams(query)
  const relevantes: string[] = []
  for (const key of PARAMS_TAB_BADGE) {
    const valor = params.get(key)
    if (valor) relevantes.push(`${key}=${valor}`)
  }
  return relevantes.length > 0 ? `${path}?${relevantes.join('&')}` : path
}

/** Contagem live para uma tab de query-param (Sócios, Torcedores, Patrimônio…). */
export function lookupTabBadge(tabBadges: Record<string, number>, href: string): number {
  return tabBadges[chaveTabBadge(href)] ?? 0
}

function agregarPortalDepartamento(badges: PortalNavBadges, link: string | null): void {
  if (!link || !link.startsWith('/portal/departamentos')) return
  const [pathAndQuery, hashRaw] = link.split('#')
  const [path, query] = (pathAndQuery ?? '').split('?')
  const resto = (path ?? '').slice('/portal/departamentos'.length)
  const slug = resto.startsWith('/') ? resto.slice(1).split('/')[0] : ''

  badges.departamentos += 1
  if (!slug) return

  increment(badges.porSlug, slug)
  const tabParam = new URLSearchParams(query ?? '').get('tab') ?? ''
  const secao = secaoDeTab(tabParam) ?? secaoDeTab(hashRaw ?? '')
  if (!secao) return
  const atual = badges.porSecao[slug] ?? {}
  atual[secao] = (atual[secao] ?? 0) + 1
  badges.porSecao[slug] = atual
}

function agregarPortalNavGeral(badges: PortalNavBadges, row: InboxBadgeRow): void {
  agregarPortalDepartamento(badges, row.link)
  if (row.tipo.startsWith('COMUNICADO_')) badges.comunidade += 1
  const link = row.link ?? ''
  if (link.startsWith('/portal/eventos')) badges.eventos += 1
  else if (link.startsWith('/portal/loja')) badges.loja += 1
  else if (
    link.startsWith('/portal/carteirinha') ||
    row.tipo.startsWith('SOCIO_CARTEIRINHA')
  ) {
    badges.carteirinha += 1
  } else if (link.startsWith('/portal/sedes')) {
    // Recusa e canal restrito não são pendência de "Sedes" no portal.
    if (row.tipo === 'SOLICITACAO_UNIDADE_RECUSADA') return
    if (row.tipo.startsWith('CANAL_')) return
    badges.sedes += 1
  }
}

/**
 * Rota efetiva para badge admin: o `link` da notificação, se for caminho
 * `/admin…`; senão o fallback `ROTA_POR_TIPO`. Assim `MEMBRO_SOLICITADO` com
 * link em `/admin/torcedores` badgeia Torcedores, não Sócios.
 *
 * Custódia de acervo: o responsável vê no portal (bandeiras/patrimônio) e o
 * overlay admin precisa acender a tab certa. Demais links `/portal` não
 * caem no fallback admin — senão o devedor acende Financeiro.
 */
function rotaAdminEspelhadaDoPortal(path: string): string | null {
  if (path.startsWith('/portal/departamentos/bandeiras')) {
    return '/admin/bandeiras?tab=pendencias'
  }
  if (
    path.startsWith('/portal/departamentos/patrimonio') ||
    path.startsWith('/portal/patrimonio')
  ) {
    return '/admin/patrimonio?tab=pendencias'
  }
  return null
}

export function rotaEfetivaParaBadge(row: InboxBadgeRow): string | null {
  const link = row.link?.trim() ?? ''
  const path = link.split('#')[0] ?? ''
  if (path.startsWith('/admin')) return path
  if (path.startsWith('/portal')) {
    const espelho = rotaAdminEspelhadaDoPortal(path)
    if (espelho) return espelho
    // Urgente cai no feed, mas o overlay admin aponta para Comunicados.
    if (row.tipo === 'COMUNICADO_URGENTE') return ROTA_POR_TIPO[row.tipo] ?? null
    return null
  }
  return ROTA_POR_TIPO[row.tipo] ?? null
}

/**
 * Agrega não-lidas em badges de menu, tab de módulo e nav do portal.
 * Prefere o `link` gravado; cai em `ROTA_POR_TIPO` quando o link não é admin.
 */
export function agregarBadgesDeInbox(rows: InboxBadgeRow[]): InboxBadges {
  const badges = emptyInboxBadges()

  for (const row of rows) {
    agregarPortalNavGeral(badges.portalNavBadges, row)

    const rota = rotaEfetivaParaBadge(row)
    if (!rota) continue

    const menuId = resolverMenuIdDeRota(rota)
    if (menuId) increment(badges.menuBadges, menuId)

    const tabHref = resolverTabHrefDeRota(rota)
    if (tabHref) {
      const modulo = resolverModuloDeRota(rota)
      // PDV e afins têm entrada própria no menu: não pingar a tab raiz do módulo.
      if (!modulo || menuId === modulo.menuId) increment(badges.tabBadges, tabHref)
    }

    const chaveQuery = chaveTabBadge(rota)
    if (chaveQuery.includes('?')) increment(badges.tabBadges, chaveQuery)

    overlayTabHubEvento(rota, badges.tabBadges)
  }

  return badges
}

/**
 * Agrega contagens groupBy(tipo) em badges por id de menu (só entradas > 0).
 * Mantido para testes e callers que só têm o tipo — a navbar usa
 * `agregarBadgesDeInbox` (considera o link).
 */
export function agregarBadgesPorMenu(
  rows: Array<{ tipo: TipoNotificacao; _count: number | { tipo?: number } }>,
): Record<string, number> {
  const badges: Record<string, number> = {}
  for (const row of rows) {
    const menuId = menuIdParaTipo(row.tipo)
    if (!menuId) continue
    const n =
      typeof row._count === 'number'
        ? row._count
        : typeof row._count.tipo === 'number'
          ? row._count.tipo
          : 0
    if (n <= 0) continue
    badges[menuId] = (badges[menuId] ?? 0) + n
  }
  return badges
}

/** Subtrai contagens (mark-read otimista). Chaves que chegam a 0 saem do mapa. */
export function subtrairContagens(
  atual: Record<string, number>,
  delta: Record<string, number>,
): Record<string, number> {
  const next = { ...atual }
  for (const [key, n] of Object.entries(delta)) {
    if (n <= 0) continue
    const resto = (next[key] ?? 0) - n
    if (resto <= 0) delete next[key]
    else next[key] = resto
  }
  return next
}

export function subtrairPortalNavBadges(
  atual: PortalNavBadges,
  delta: PortalNavBadges,
): PortalNavBadges {
  const porSlug = subtrairContagens(atual.porSlug, delta.porSlug)
  const SECOES: PortalSecaoDepartamento[] = ['areas', 'projetos', 'equipe', 'pedidos', 'fila']
  const porSecao: PortalNavBadges['porSecao'] = { ...atual.porSecao }
  for (const [slug, secoes] of Object.entries(delta.porSecao)) {
    const atualSlug = { ...(porSecao[slug] ?? {}) }
    for (const secao of SECOES) {
      const n = secoes[secao] ?? 0
      if (n <= 0) continue
      const resto = (atualSlug[secao] ?? 0) - n
      if (resto <= 0) delete atualSlug[secao]
      else atualSlug[secao] = resto
    }
    if (Object.keys(atualSlug).length === 0) delete porSecao[slug]
    else porSecao[slug] = atualSlug
  }
  return {
    departamentos: Math.max(0, atual.departamentos - delta.departamentos),
    eventos: Math.max(0, atual.eventos - delta.eventos),
    loja: Math.max(0, atual.loja - delta.loja),
    carteirinha: Math.max(0, atual.carteirinha - delta.carteirinha),
    sedes: Math.max(0, atual.sedes - delta.sedes),
    comunidade: Math.max(0, atual.comunidade - delta.comunidade),
    porSlug,
    porSecao,
  }
}

/** Detalhe `/admin/bateria/:id` acende a tab Ensaios, não só o item do menu. */
function overlayTabHubEvento(rota: string, tabBadges: Record<string, number>): void {
  const path = pathnameDeHref(rota)
  if (/^\/admin\/bateria\/[^/]+$/.test(path)) {
    increment(tabBadges, '/admin/bateria?tab=ensaios')
  }
}
