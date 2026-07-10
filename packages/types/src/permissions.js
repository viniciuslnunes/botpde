/**
 * Lista global de permissões da plataforma.
 * Imutável — novas permissões são adicionadas aqui e automaticamente
 * disponíveis para serem atribuídas a cargos.
 */
export const PERMISSIONS = /** @type {const} */ ({
  // Membros
  MEMBERS_VIEW: 'members:view',
  MEMBERS_APPROVE: 'members:approve',
  MEMBERS_REJECT: 'members:reject',
  MEMBERS_WARN: 'members:warn',
  MEMBERS_BLOCK: 'members:block',
  MEMBERS_IMPORT: 'members:import',

  // Loja
  STORE_VIEW_ORDERS: 'store:view_orders',
  STORE_MANAGE: 'store:manage',

  // Eventos
  EVENTS_CREATE: 'events:create',
  EVENTS_MANAGE: 'events:manage',

  // Sedes
  SEDES_MANAGE: 'sedes:manage',

  // Cargos (admin only)
  ROLES_MANAGE: 'roles:manage',

  // Configurações (owner only)
  SETTINGS_MANAGE: 'settings:manage',

  // Relatórios
  REPORTS_VIEW: 'reports:view',

  // Comunidade (mural de posts locais/não-oficiais)
  COMMUNITY_MANAGE: 'community:manage',

  // Comunicados oficiais — separado de COMMUNITY_MANAGE: nem todo post
  // comunitário é comunicado oficial, e publicar conteúdo institucional
  // exige um perfil autorizado à parte.
  ANNOUNCEMENTS_PUBLISH: 'announcements:publish',

  // Alianças entre torcidas (Presidente)
  ALLIANCES_MANAGE: 'alliances:manage',

  // Comunidade social
  COMMUNITY_POST: 'community:post',
  COMMUNITY_MODERATE: 'community:moderate',

  // Notícias curadas
  NEWS_CURATE: 'news:curate',

  // Salas de vídeo Meet
  MEETINGS_HOST: 'meetings:host',

  // Mensageria (DM 1×1 e grupos — ARCHITECTURE.md §6 item 27)
  MESSAGES_SEND: 'messages:send',
  GROUPS_CREATE: 'groups:create',
  MESSAGES_MODERATE: 'messages:moderate',
})

export const ALL_PERMISSIONS = Object.values(PERMISSIONS)

/**
 * Agrupamento de permissões por área, para exibição em UI (checkboxes de
 * cargo/perfil, permissões adicionais por usuário etc). Fonte única —
 * evita duplicar essa lista em cada componente que precisa exibi-la.
 */
export const PERMISSION_GROUPS = /** @type {const} */ ([
  {
    label: 'Membros',
    // Permissão base do grupo (equivalente ao "-PAG" de sistemas corporativos):
    // qualquer outra permissão do grupo exige poder VER membros primeiro.
    base: PERMISSIONS.MEMBERS_VIEW,
    items: [
      { key: PERMISSIONS.MEMBERS_VIEW, label: 'Ver membros' },
      { key: PERMISSIONS.MEMBERS_APPROVE, label: 'Aprovar membros' },
      { key: PERMISSIONS.MEMBERS_REJECT, label: 'Reprovar membros' },
      { key: PERMISSIONS.MEMBERS_WARN, label: 'Advertir membros' },
      { key: PERMISSIONS.MEMBERS_BLOCK, label: 'Bloquear membros' },
      { key: PERMISSIONS.MEMBERS_IMPORT, label: 'Importar base de associados' },
    ],
  },
  {
    label: 'Loja',
    base: PERMISSIONS.STORE_VIEW_ORDERS,
    items: [
      { key: PERMISSIONS.STORE_VIEW_ORDERS, label: 'Ver pedidos' },
      { key: PERMISSIONS.STORE_MANAGE, label: 'Gerenciar produtos' },
    ],
  },
  {
    label: 'Eventos',
    base: null,
    items: [
      { key: PERMISSIONS.EVENTS_CREATE, label: 'Criar eventos' },
      { key: PERMISSIONS.EVENTS_MANAGE, label: 'Gerenciar eventos' },
    ],
  },
  {
    label: 'Comunidade',
    base: null,
    items: [
      { key: PERMISSIONS.COMMUNITY_MANAGE, label: 'Gerenciar mural da comunidade' },
      { key: PERMISSIONS.ANNOUNCEMENTS_PUBLISH, label: 'Publicar comunicados oficiais' },
      { key: PERMISSIONS.COMMUNITY_POST, label: 'Publicar no feed como membro' },
      { key: PERMISSIONS.COMMUNITY_MODERATE, label: 'Moderar publicações e denúncias' },
      { key: PERMISSIONS.NEWS_CURATE, label: 'Curar notícias do time' },
      { key: PERMISSIONS.MEETINGS_HOST, label: 'Criar salas de vídeo' },
    ],
  },
  {
    label: 'Mensagens',
    base: null,
    items: [
      { key: PERMISSIONS.MESSAGES_SEND, label: 'Enviar mensagens diretas' },
      { key: PERMISSIONS.GROUPS_CREATE, label: 'Criar grupos de conversa' },
      { key: PERMISSIONS.MESSAGES_MODERATE, label: 'Moderar mensagens denunciadas' },
    ],
  },
  {
    label: 'Alianças',
    base: null,
    items: [{ key: PERMISSIONS.ALLIANCES_MANAGE, label: 'Gerenciar alianças entre torcidas' }],
  },
  {
    label: 'Outros',
    base: null,
    items: [
      { key: PERMISSIONS.SEDES_MANAGE, label: 'Gerenciar sedes' },
      { key: PERMISSIONS.ROLES_MANAGE, label: 'Gerenciar cargos' },
      { key: PERMISSIONS.REPORTS_VIEW, label: 'Ver relatórios' },
    ],
  },
])

/**
 * Aplica a cascata de dependência entre permissões do mesmo grupo:
 * - Marcar qualquer permissão de um grupo com `base` puxa a base junto
 *   (não faz sentido aprovar membros sem poder vê-los).
 * - Desmarcar a base derruba todas as irmãs do grupo.
 *
 * Recebe a seleção anterior e a nova (após o clique do usuário) e devolve a
 * seleção corrigida. Usar tanto na UI (feedback imediato) quanto no servidor
 * (garantia de consistência do dado gravado).
 *
 * @param {string[]} prevSelected - seleção antes da mudança
 * @param {string[]} nextSelected - seleção depois da mudança do usuário
 * @returns {string[]} seleção com a cascata aplicada
 */
export function applyPermissionCascade(prevSelected, nextSelected) {
  const prev = new Set(prevSelected)
  const result = new Set(nextSelected)

  for (const group of PERMISSION_GROUPS) {
    if (!group.base) continue
    const keys = group.items.map((item) => item.key)

    // Base foi desmarcada agora → remove todas as irmãs do grupo
    if (prev.has(group.base) && !result.has(group.base)) {
      for (const key of keys) result.delete(key)
      continue
    }

    // Alguma permissão não-base foi marcada agora → garante a base junto
    const addedNonBase = keys.some(
      (key) => key !== group.base && result.has(key) && !prev.has(key),
    )
    if (addedNonBase) result.add(group.base)
  }

  return Array.from(result)
}

/**
 * Cargos reservados do sistema — não podem ser editados ou removidos.
 */
export const SYSTEM_ROLES = /** @type {const} */ ({
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
})

/**
 * Permissões padrão por cargo do sistema.
 */
export const SYSTEM_ROLE_PERMISSIONS = {
  [SYSTEM_ROLES.OWNER]: ALL_PERMISSIONS,
  [SYSTEM_ROLES.ADMIN]: ALL_PERMISSIONS.filter(
    (p) => p !== PERMISSIONS.SETTINGS_MANAGE,
  ),
  [SYSTEM_ROLES.MEMBER]: [
    PERMISSIONS.COMMUNITY_POST,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.GROUPS_CREATE,
  ],
}

/**
 * Calcula permissões efetivas de um usuário.
 * Prioridade: overrides individuais > union de cargos
 *
 * @param {string[]} rolePermissions - permissões acumuladas de todos os cargos
 * @param {{ permission: string, granted: boolean }[]} overrides - permissões individuais
 * @returns {string[]} lista de permissões efetivas
 */
export function calculateEffectivePermissions(rolePermissions, overrides) {
  const base = new Set(rolePermissions)

  for (const override of overrides) {
    if (override.granted) {
      base.add(override.permission)
    } else {
      base.delete(override.permission)
    }
  }

  return Array.from(base)
}

/** Permissão coringa — usada pelo cargo de sistema 'owner', concede tudo. */
export const WILDCARD_PERMISSION = '*'

/**
 * Verifica se uma lista de permissões efetivas inclui uma permissão.
 * '*' nas permissões efetivas (cargo owner) sempre concede acesso.
 *
 * @param {string[]} effectivePermissions
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(effectivePermissions, permission) {
  return effectivePermissions.includes(WILDCARD_PERMISSION) || effectivePermissions.includes(permission)
}

/**
 * Verifica se um usuário pode gerenciar membros de um departamento específico.
 *
 * Regra: donos/admins do tenant (ROLES_MANAGE) sempre podem.
 * Caso contrário, só pode quem estiver listado como gestor DESTE departamento
 * (tabela DepartamentoGestor) — delegação pontual sem precisar virar admin geral.
 *
 * @param {string[]} effectivePermissions - permissões efetivas do usuário no tenant
 * @param {string[]} gestorDepartamentoIds - IDs dos departamentos em que o usuário é gestor
 * @param {string} departamentoId - departamento cujo gerenciamento está sendo verificado
 * @returns {boolean}
 */
export function canManageDepartamento(effectivePermissions, gestorDepartamentoIds, departamentoId) {
  if (hasPermission(effectivePermissions, PERMISSIONS.ROLES_MANAGE)) return true
  return gestorDepartamentoIds.includes(departamentoId)
}
