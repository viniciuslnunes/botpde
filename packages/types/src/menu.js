import { PERMISSIONS, hasPermission } from './permissions.js'

/**
 * Árvore de menu do admin, protegida por permissão.
 * Cada item some da navegação (e deveria ser bloqueado na rota também)
 * se o usuário não tiver a permissão listada em `permissao`.
 * `permissao: null` = sempre visível para quem tem acesso à área admin.
 */
export const ADMIN_MENU = /** @type {const} */ ([
  { id: 'dashboard', label: 'Dashboard', href: '/admin', permissao: null, exact: true },
  // Console global de leitura do Presidente/Vice — além da permissão, o layout
  // só exibe o item quando o tenant é a Sede principal (tipo SEDE).
  { id: 'torcida', label: 'Visão da torcida', href: '/admin/torcida', permissao: PERMISSIONS.TORCIDA_GLOBAL_VIEW },
  { id: 'membros', label: 'Membros', href: '/admin/membros', permissao: PERMISSIONS.MEMBERS_VIEW },
  { id: 'socios', label: 'Sócios', href: '/admin/socios', permissao: PERMISSIONS.MEMBERS_VIEW },
  { id: 'eventos', label: 'Eventos', href: '/admin/eventos', permissao: PERMISSIONS.EVENTS_MANAGE },
  { id: 'sedes', label: 'Sedes', href: '/admin/sedes', permissao: PERMISSIONS.SEDES_MANAGE },
  { id: 'hierarquia', label: 'Hierarquia', href: '/admin/hierarquia', permissao: PERMISSIONS.SEDES_MANAGE },
  { id: 'loja', label: 'Loja', href: '/admin/loja', permissao: PERMISSIONS.STORE_MANAGE },
  { id: 'loja-pedidos', label: 'Pedidos (Loja)', href: '/admin/loja/pedidos', permissao: PERMISSIONS.STORE_VIEW_ORDERS },
  { id: 'comunidade', label: 'Comunidade', href: '/admin/comunidade', permissao: PERMISSIONS.COMMUNITY_MANAGE },
  { id: 'comunidade-moderacao', label: 'Moderação', href: '/admin/comunidade/moderacao', permissao: PERMISSIONS.COMMUNITY_MODERATE },
  { id: 'noticias', label: 'Notícias', href: '/admin/comunidade/noticias', permissao: PERMISSIONS.NEWS_CURATE },
  { id: 'aliancas', label: 'Alianças', href: '/admin/aliancas', permissao: PERMISSIONS.ALLIANCES_MANAGE },
  { id: 'acessos', label: 'Controle de acesso', href: '/admin/acessos', permissao: PERMISSIONS.ROLES_MANAGE },
  { id: 'configuracoes', label: 'Configurações', href: '/admin/configuracoes', permissao: PERMISSIONS.SETTINGS_MANAGE },
])

/**
 * Filtra a árvore de menu pelas permissões efetivas do usuário no tenant atual.
 * Usar sempre no servidor — nunca confiar em filtragem feita só no cliente,
 * já que o menu não é controle de acesso, só affordance visual.
 *
 * @param {readonly {id: string, label: string, href: string, permissao: string | null}[]} menu
 * @param {string[]} effectivePermissions
 */
export function filterMenuByPermissions(menu, effectivePermissions) {
  return menu.filter((item) => item.permissao === null || hasPermission(effectivePermissions, item.permissao))
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
  return ADMIN_MENU.some((item) => item.permissao !== null && hasPermission(effectivePermissions, item.permissao))
}
