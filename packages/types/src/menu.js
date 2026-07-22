import { PERMISSIONS, hasPermission } from './permissions.js'

/**
 * Seções do menu admin alinhadas aos módulos de departamento
 * (`DEPARTAMENTO_MODULOS`) + governança transversal.
 * `label: null` = sem cabeçalho (ex.: Dashboard).
 */
export const ADMIN_MENU_SECOES = /** @type {const} */ ([
  { id: 'geral', label: null },
  { id: 'pessoas', label: 'Pessoas', modulo: 'membros' },
  { id: 'operacao', label: 'Operação', modulo: 'eventos' },
  { id: 'loja', label: 'Loja', modulo: 'loja' },
  { id: 'bar', label: 'Bar', modulo: 'bar' },
  { id: 'comunidade', label: 'Comunidade', modulo: 'comunidade' },
  { id: 'financeiro', label: 'Financeiro', modulo: 'financeiro' },
  { id: 'patrimonio', label: 'Patrimônio', modulo: 'patrimonio' },
  { id: 'governanca', label: 'Governança', modulo: null },
])

/**
 * Árvore de menu do admin, protegida por permissão.
 * Cada item some da navegação (e deveria ser bloqueado na rota também)
 * se o usuário não tiver a permissão listada em `permissao`.
 * `permissao: null` = sempre visível para quem tem acesso à área admin.
 *
 * A visibilidade é **só por permissão efetiva** (cargo/depto/extras/overrides).
 * Departamento não filtra o menu por id — quem tem permissão adicional vê o item.
 */
export const ADMIN_MENU = /** @type {const} */ ([
  { id: 'dashboard', label: 'Dashboard', href: '/admin', permissao: null, exact: true, secao: 'geral' },
  // Console global de leitura do Presidente/Vice — além da permissão, o layout
  // só exibe o item quando o tenant é a Sede principal (tipo SEDE).
  {
    id: 'torcida',
    label: 'Visão da torcida',
    href: '/admin/torcida',
    permissao: PERMISSIONS.TORCIDA_GLOBAL_VIEW,
    secao: 'governanca',
  },
  // Aprovar sócios/membros sem members:view ainda precisa ver a fila de pendentes.
  {
    id: 'membros',
    label: 'Membros',
    href: '/admin/membros',
    permissao: [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.MEMBERS_APPROVE],
    secao: 'pessoas',
  },
  { id: 'socios', label: 'Sócios', href: '/admin/socios', permissao: PERMISSIONS.MEMBERS_VIEW, secao: 'pessoas' },
  {
    id: 'eventos',
    label: 'Agenda',
    href: '/admin/eventos',
    // Criar eventos (EVENTS_CREATE) é operação de portal/área; admin = gerir.
    permissao: PERMISSIONS.EVENTS_MANAGE,
    secao: 'operacao',
  },
  { id: 'sedes', label: 'Sedes', href: '/admin/sedes', permissao: PERMISSIONS.SEDES_MANAGE, secao: 'operacao' },
  // Mural organizacional — só quem gerencia cargos/acessos (não members:view genérico).
  {
    id: 'hierarquia',
    label: 'Hierarquia',
    href: '/admin/hierarquia',
    permissao: PERMISSIONS.ROLES_MANAGE,
    secao: 'governanca',
  },
  { id: 'loja', label: 'Catálogo', href: '/admin/loja', permissao: PERMISSIONS.STORE_MANAGE, secao: 'loja' },
  {
    id: 'loja-pedidos',
    label: 'Pedidos',
    href: '/admin/loja/pedidos',
    permissao: PERMISSIONS.STORE_VIEW_ORDERS,
    secao: 'loja',
  },
  {
    id: 'bar-pdv',
    label: 'PDV',
    href: '/admin/bar/pdv',
    permissao: [PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE],
    secao: 'bar',
  },
  {
    id: 'bar-produtos',
    label: 'Produtos',
    href: '/admin/bar/produtos',
    permissao: PERMISSIONS.BAR_MANAGE,
    secao: 'bar',
  },
  {
    id: 'bar-estoque',
    label: 'Estoque',
    href: '/admin/bar/estoque',
    permissao: PERMISSIONS.BAR_MANAGE,
    secao: 'bar',
  },
  {
    id: 'bar-vendas',
    label: 'Vendas',
    href: '/admin/bar/vendas',
    permissao: [PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE],
    secao: 'bar',
  },
  {
    id: 'comunidade',
    label: 'Visão geral',
    href: '/admin/comunidade',
    permissao: [PERMISSIONS.COMMUNITY_MANAGE, PERMISSIONS.ANNOUNCEMENTS_PUBLISH],
    secao: 'comunidade',
    exact: true,
  },
  {
    id: 'comunidade-comunicados',
    label: 'Comunicados',
    href: '/admin/comunidade/comunicados',
    permissao: PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
    secao: 'comunidade',
  },
  {
    id: 'comunidade-mural',
    label: 'Mural',
    href: '/admin/comunidade/mural',
    permissao: PERMISSIONS.COMMUNITY_MANAGE,
    secao: 'comunidade',
  },
  // Denúncias de post (community:moderate) e de mensagem (messages:moderate).
  {
    id: 'comunidade-moderacao',
    label: 'Moderação',
    href: '/admin/comunidade/moderacao',
    permissao: [PERMISSIONS.COMMUNITY_MODERATE, PERMISSIONS.MESSAGES_MODERATE],
    secao: 'comunidade',
  },
  {
    id: 'noticias',
    label: 'Notícias',
    href: '/admin/comunidade/noticias',
    permissao: PERMISSIONS.NEWS_CURATE,
    secao: 'comunidade',
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    href: '/admin/financeiro',
    // finance:view = portal; admin = operação do gestor.
    permissao: PERMISSIONS.FINANCE_MANAGE,
    secao: 'financeiro',
  },
  {
    id: 'planos-associacao',
    label: 'Planos de sócio',
    href: '/admin/planos-associacao',
    permissao: PERMISSIONS.FINANCE_MANAGE,
    secao: 'financeiro',
  },
  {
    id: 'cobrancas',
    label: 'Cobranças',
    href: '/admin/cobrancas',
    permissao: PERMISSIONS.FINANCE_MANAGE,
    secao: 'financeiro',
  },
  {
    id: 'patrimonio',
    label: 'Patrimônio',
    href: '/admin/patrimonio',
    permissao: PERMISSIONS.PATRIMONY_MANAGE,
    secao: 'patrimonio',
  },
  {
    id: 'aliancas',
    label: 'Alianças',
    href: '/admin/aliancas',
    permissao: PERMISSIONS.ALLIANCES_MANAGE,
    secao: 'governanca',
  },
  {
    id: 'acessos',
    label: 'Controle de acesso',
    href: '/admin/acessos',
    permissao: PERMISSIONS.ROLES_MANAGE,
    secao: 'governanca',
  },
  // Append-only: sem mutações na UI. Gate: Diretoria (+ owner/admin/vice via ALL_PERMISSIONS).
  {
    id: 'auditoria',
    label: 'Auditoria',
    href: '/admin/auditoria',
    permissao: PERMISSIONS.AUDIT_VIEW,
    secao: 'governanca',
  },
  {
    id: 'design',
    label: 'Design',
    href: '/admin/design',
    permissao: PERMISSIONS.SETTINGS_MANAGE,
    secao: 'governanca',
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    href: '/admin/configuracoes',
    permissao: PERMISSIONS.SETTINGS_MANAGE,
    secao: 'governanca',
  },
])

/**
 * Filtra a árvore de menu pelas permissões efetivas do usuário no tenant atual.
 * Usar sempre no servidor — nunca confiar em filtragem feita só no cliente,
 * já que o menu não é controle de acesso, só affordance visual.
 *
 * `permissao` pode ser string ou array (OR — ex.: eventos aceita CREATE ou MANAGE).
 *
 * @param {readonly {id: string, label: string, href: string, permissao: string | readonly string[] | null, secao?: string}[]} menu
 * @param {string[]} effectivePermissions
 */
export function filterMenuByPermissions(menu, effectivePermissions) {
  return menu.filter((item) => {
    if (item.permissao === null) return true
    if (Array.isArray(item.permissao)) {
      return item.permissao.some((p) => hasPermission(effectivePermissions, p))
    }
    return hasPermission(effectivePermissions, item.permissao)
  })
}

/**
 * Agrupa itens já filtrados nas seções de `ADMIN_MENU_SECOES`, omitindo seções vazias.
 *
 * @param {readonly {id: string, label: string, href: string, secao?: string, exact?: boolean}[]} items
 * @returns {{ id: string, label: string | null, items: typeof items }[]}
 */
export function groupAdminMenuBySecao(items) {
  /** @type {Map<string, typeof items>} */
  const bySecao = new Map()
  for (const item of items) {
    const secaoId = item.secao ?? 'geral'
    const list = bySecao.get(secaoId)
    if (list) list.push(item)
    else bySecao.set(secaoId, [item])
  }

  /** @type {{ id: string, label: string | null, items: typeof items }[]} */
  const groups = []
  for (const secao of ADMIN_MENU_SECOES) {
    const secaoItems = bySecao.get(secao.id)
    if (!secaoItems || secaoItems.length === 0) continue
    groups.push({ id: secao.id, label: secao.label, items: secaoItems })
  }

  // Itens com secao desconhecida (legado) — append no fim
  for (const [secaoId, secaoItems] of bySecao) {
    if (ADMIN_MENU_SECOES.some((s) => s.id === secaoId)) continue
    groups.push({ id: secaoId, label: null, items: secaoItems })
  }

  return groups
}

/**
 * Um usuário tem acesso à área /admin se tiver ao menos uma permissão
 * que apareça em algum item do menu (além do dashboard, que é sempre visível).
 * Substitui a checagem antiga hard-coded em `role.nome in ['owner', 'admin']`,
 * que ignorava perfis customizados criados via /admin/configuracoes.
 *
 * @param {string[]} effectivePermissions
 */
export function hasAdminAreaAccess(effectivePermissions) {
  return ADMIN_MENU.some((item) => {
    if (item.permissao === null) return false
    if (Array.isArray(item.permissao)) {
      return item.permissao.some((p) => hasPermission(effectivePermissions, p))
    }
    return hasPermission(effectivePermissions, item.permissao)
  })
}
