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

  // Auditoria append-only — só leitura; Diretoria e Presidência (owner/vice/admin)
  AUDIT_VIEW: 'audit:view',

  // Financeiro (módulo em evolução — permissão já usado por departamento)
  FINANCE_VIEW: 'finance:view',
  FINANCE_MANAGE: 'finance:manage',

  // Patrimônio / inventário (módulo em evolução)
  PATRIMONY_VIEW: 'patrimony:view',
  PATRIMONY_MANAGE: 'patrimony:manage',

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

  // Canais institucionais e comunidades temáticas (M3 mensageria)
  CHANNELS_MANAGE: 'channels:manage',

  // Console global de leitura do Presidente — visão consolidada da torcida
  // inteira (Sede + subsedes/PDEs). Só Presidente e Vice; admin comum não tem.
  TORCIDA_GLOBAL_VIEW: 'torcida:global_view',
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
    label: 'Financeiro',
    base: PERMISSIONS.FINANCE_VIEW,
    items: [
      { key: PERMISSIONS.FINANCE_VIEW, label: 'Ver financeiro' },
      { key: PERMISSIONS.FINANCE_MANAGE, label: 'Gerenciar financeiro' },
    ],
  },
  {
    label: 'Patrimônio',
    base: PERMISSIONS.PATRIMONY_VIEW,
    items: [
      { key: PERMISSIONS.PATRIMONY_VIEW, label: 'Ver patrimônio' },
      { key: PERMISSIONS.PATRIMONY_MANAGE, label: 'Gerenciar patrimônio' },
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
      { key: PERMISSIONS.CHANNELS_MANAGE, label: 'Gerenciar canais e comunidades' },
      { key: PERMISSIONS.MESSAGES_MODERATE, label: 'Moderar mensagens denunciadas' },
    ],
  },
  {
    label: 'Alianças',
    base: null,
    items: [{ key: PERMISSIONS.ALLIANCES_MANAGE, label: 'Gerenciar alianças entre torcidas' }],
  },
  {
    label: 'Presidência',
    base: null,
    items: [{ key: PERMISSIONS.TORCIDA_GLOBAL_VIEW, label: 'Ver painel global da torcida' }],
  },
  {
    label: 'Outros',
    base: null,
    items: [
      { key: PERMISSIONS.SEDES_MANAGE, label: 'Gerenciar sedes' },
      { key: PERMISSIONS.ROLES_MANAGE, label: 'Gerenciar cargos' },
      { key: PERMISSIONS.REPORTS_VIEW, label: 'Ver relatórios' },
      { key: PERMISSIONS.AUDIT_VIEW, label: 'Ver registro de auditoria' },
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
 * Módulos de portal que um departamento pode abrir para seus membros.
 * O `key` é o slug estável gravado em `Departamento.moduloPortal`;
 * o `label` é o texto exibido nas UIs de admin.
 */
export const DEPARTAMENTO_MODULOS = /** @type {const} */ ([
  { key: 'eventos', label: 'Eventos' },
  { key: 'loja', label: 'Loja / Materiais' },
  { key: 'comunidade', label: 'Comunidade e comunicados' },
  { key: 'sedes', label: 'Sedes e subsedes' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'patrimonio', label: 'Patrimônio' },
  { key: 'membros', label: 'Membros' },
])

/**
 * Rota de destino no app para cada módulo de `DEPARTAMENTO_MODULOS`.
 * O hub de departamentos do portal NÃO reimplementa gestão — só direciona
 * para o módulo existente; `disponivel: false` = módulo ainda não lançado
 * (a UI mostra "Em breve" em vez de link).
 */
export const DEPARTAMENTO_MODULO_ROTA = /** @type {const} */ ({
  eventos: { href: '/portal/eventos', disponivel: true },
  loja: { href: '/portal/loja', disponivel: true },
  comunidade: { href: '/portal/comunidade', disponivel: true },
  sedes: { href: '/portal/sedes', disponivel: true },
  membros: { href: '/admin/membros', disponivel: true },
  financeiro: { href: null, disponivel: false },
  patrimonio: { href: null, disponivel: false },
})

/**
 * Rota admin correspondente ao módulo (atalho "Administrar" do hub).
 * null = sem área admin dedicada ainda.
 */
export const DEPARTAMENTO_MODULO_ADMIN_ROTA = /** @type {const} */ ({
  eventos: '/admin/eventos',
  loja: '/admin/loja',
  comunidade: '/admin/comunidade',
  sedes: '/admin/sedes',
  membros: '/admin/membros',
  financeiro: null,
  patrimonio: null,
})

/**
 * Normaliza o nome de um departamento para um slug ASCII kebab-case:
 * minúsculas, sem acentos, não-alfanumérico vira '-', hifens colapsados
 * e aparados. Pode retornar '' se o nome não tiver caracteres úteis.
 *
 * @param {string} nome
 * @returns {string}
 */
export function slugifyDepartamento(nome) {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Slugs dos 10 departamentos canônicos semeados por tenant (badge "padrão" na UI).
 * @type {readonly string[]}
 */
export const DEPARTAMENTOS_CANONICOS_SLUGS = Object.freeze([
  'diretoria',
  'financeiro',
  'social-e-eventos',
  'materiais-loja',
  'comunicacao',
  'patrimonio',
  'bateria',
  'caravanas',
  'feminino',
  'carnaval',
])

/**
 * @param {string} slug
 * @returns {boolean}
 */
export function isDepartamentoCanonico(slug) {
  return DEPARTAMENTOS_CANONICOS_SLUGS.includes(slug)
}

/**
 * Cargos reservados do sistema — não podem ser editados ou removidos.
 */
export const SYSTEM_ROLES = /** @type {const} */ ({
  OWNER: 'owner',
  ADMIN: 'admin',
  VICE: 'vice',
  MEMBER: 'member',
})

/**
 * Papel do perfil dentro do departamento vinculado.
 * @type {{ readonly MEMBRO: 'MEMBRO', readonly GESTOR: 'GESTOR' }}
 */
export const PAPEL_DEPARTAMENTO = /** @type {const} */ ({
  MEMBRO: 'MEMBRO',
  GESTOR: 'GESTOR',
})

/**
 * Regra de governança: uma torcida admite no máximo 2 vice-presidentes.
 */
export const MAX_VICE_PRESIDENTES = 2

/**
 * Permissões padrão por cargo do sistema.
 */
export const SYSTEM_ROLE_PERMISSIONS = {
  [SYSTEM_ROLES.OWNER]: ALL_PERMISSIONS,
  // Admin comum NÃO tem visão global da torcida — só Presidente (owner) e Vice.
  [SYSTEM_ROLES.ADMIN]: ALL_PERMISSIONS.filter(
    (p) => p !== PERMISSIONS.SETTINGS_MANAGE && p !== PERMISSIONS.TORCIDA_GLOBAL_VIEW,
  ),
  [SYSTEM_ROLES.VICE]: ALL_PERMISSIONS.filter(
    (p) => p !== PERMISSIONS.SETTINGS_MANAGE,
  ),
  [SYSTEM_ROLES.MEMBER]: [
    PERMISSIONS.COMMUNITY_POST,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.GROUPS_CREATE,
  ],
}

/**
 * Pacote ao vivo do departamento para um papel (membro ou gestor).
 *
 * @param {{ permissions?: string[], permissionsGestor?: string[] } | null | undefined} departamento
 * @param {string | null | undefined} papelNoDepartamento - MEMBRO | GESTOR
 * @returns {string[]}
 */
export function permissionsDoPacoteDepartamento(departamento, papelNoDepartamento) {
  if (!departamento) return []
  const base = [...(departamento.permissions ?? [])]
  if (papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR) {
    base.push(...(departamento.permissionsGestor ?? []))
  }
  return base
}

/**
 * Permissões concedidas por um Unique Role, com herança ao vivo do departamento.
 *
 * - Com departamento: pacote (membro/gestor) ∪ permissionsExtras
 * - Sem departamento (transversal): permissions (legado) ∪ permissionsExtras
 *
 * @param {{
 *   permissions?: string[],
 *   permissionsExtras?: string[],
 *   departamentoId?: string | null,
 *   papelNoDepartamento?: string | null,
 * }} role
 * @param {{ permissions?: string[], permissionsGestor?: string[] } | null | undefined} departamento
 * @returns {string[]}
 */
export function permissionsOfRole(role, departamento) {
  const result = new Set()

  if (role.departamentoId) {
    for (const p of permissionsDoPacoteDepartamento(departamento, role.papelNoDepartamento)) {
      result.add(p)
    }
  } else {
    for (const p of role.permissions ?? []) result.add(p)
  }

  for (const p of role.permissionsExtras ?? []) result.add(p)
  return Array.from(result)
}

/**
 * Nome canônico dos perfis gerados por departamento.
 * @param {string} nomeDepartamento
 * @param {'MEMBRO' | 'GESTOR'} papel
 */
export function nomePerfilDepartamento(nomeDepartamento, papel) {
  return papel === PAPEL_DEPARTAMENTO.GESTOR
    ? `Gestor · ${nomeDepartamento}`
    : `Membro · ${nomeDepartamento}`
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

/**
 * Governança: Vice-presidente só existe no tenant da Sede principal (tipo SEDE).
 *
 * @param {string} tipoSede - TipoSede ('SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO')
 * @returns {boolean}
 */
export function podeTerVice(tipoSede) {
  return tipoSede === 'SEDE'
}

/**
 * Rótulo do cargo máximo do tenant: 'Presidente' na Sede principal,
 * 'Liderança' em subsedes/PDEs.
 *
 * @param {string} tipoSede - TipoSede ('SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO')
 * @returns {string}
 */
export function rotuloCargoMaximo(tipoSede) {
  return tipoSede === 'SEDE' ? 'Presidente' : 'Liderança'
}

/**
 * Rótulo PT-BR de um cargo de sistema, contextualizado pelo tipo da Sede.
 * Cargos não mapeados retornam o próprio nome.
 *
 * @param {string} nome - nome interno do cargo de sistema ('owner', 'vice', ...)
 * @param {string} tipoSede - TipoSede ('SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO')
 * @returns {string}
 */
export function rotuloCargoSistema(nome, tipoSede) {
  switch (nome) {
    case SYSTEM_ROLES.OWNER:
      return rotuloCargoMaximo(tipoSede)
    case SYSTEM_ROLES.VICE:
      return 'Vice-presidente'
    case SYSTEM_ROLES.ADMIN:
      return 'Administrador'
    case SYSTEM_ROLES.MEMBER:
      return 'Membro'
    default:
      return nome
  }
}
