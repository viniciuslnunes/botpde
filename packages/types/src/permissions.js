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
  /** Desligamento estatutário (LGE) — distinto de bloqueio. */
  MEMBERS_DISMISS: 'members:dismiss',
  MEMBERS_EXPORT_LGE: 'members:export_lge',
  /**
   * Apagar de vez o cadastro (hard delete), depois de reprovado/desligado.
   * Só Presidente (owner) e super-admin — ver `SYSTEM_ROLE_PERMISSIONS`, que
   * exclui esta permissão dos pacotes de admin e vice.
   */
  MEMBERS_PURGE: 'members:purge',

  // Loja
  STORE_VIEW_ORDERS: 'store:view_orders',
  STORE_MANAGE: 'store:manage',

  // Bar (PDV da sede/subsede)
  BAR_OPERATE: 'bar:operate',
  BAR_MANAGE: 'bar:manage',

  // Eventos
  /** Leitura da Agenda admin — sem criar/editar. */
  EVENTS_VIEW: 'events:view',
  EVENTS_CREATE: 'events:create',
  EVENTS_MANAGE: 'events:manage',

  // Sedes
  /** Leitura da Estrutura / unidades — sem editar ou promover. */
  SEDES_VIEW: 'sedes:view',
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
  /** Leitura do módulo Comunidade admin — sem moderar/publicar. */
  COMMUNITY_VIEW: 'community:view',
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
  // Posts PUBLICO de quem tem esta perm ganham alcanceNacional (feed nacional
  // do clube, bypassa follow). No composer vira a opção única "Público".
  COMMUNITY_POST_NACIONAL: 'community:post_nacional',

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

  // Decidir afiliação/promoção de unidades (subsede/PDE → portal próprio).
  // Só Presidente (owner) e Vice; admin comum não tem.
  AFFILIATION_MANAGE: 'affiliation:manage',
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
      { key: PERMISSIONS.MEMBERS_DISMISS, label: 'Desligar associado (estatutário)' },
      { key: PERMISSIONS.MEMBERS_PURGE, label: 'Apagar cadastro definitivamente' },
      { key: PERMISSIONS.MEMBERS_EXPORT_LGE, label: 'Exportar cadastro LGE (CSV)' },
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
    label: 'Bar',
    base: PERMISSIONS.BAR_OPERATE,
    items: [
      { key: PERMISSIONS.BAR_OPERATE, label: 'Operar PDV / registrar vendas' },
      { key: PERMISSIONS.BAR_MANAGE, label: 'Gerenciar catálogo, estoque e vendas' },
    ],
  },
  {
    label: 'Eventos',
    base: PERMISSIONS.EVENTS_VIEW,
    items: [
      { key: PERMISSIONS.EVENTS_VIEW, label: 'Ver agenda / eventos' },
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
    // Sem base: community:post é transversal (vários colaboradores) e não
    // deve puxar community:view (que abre o módulo admin). View é oversight
    // explícito (Diretoria) ou vem junto das perms de operação no pacote.
    base: null,
    items: [
      { key: PERMISSIONS.COMMUNITY_VIEW, label: 'Ver comunidade (admin, leitura)' },
      { key: PERMISSIONS.COMMUNITY_MANAGE, label: 'Gerenciar mural da comunidade' },
      { key: PERMISSIONS.ANNOUNCEMENTS_PUBLISH, label: 'Publicar comunicados oficiais' },
      { key: PERMISSIONS.COMMUNITY_POST, label: 'Publicar no feed como membro' },
      { key: PERMISSIONS.COMMUNITY_POST_NACIONAL, label: 'Publicar para torcedores do clube (nacional)' },
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
    items: [
      { key: PERMISSIONS.TORCIDA_GLOBAL_VIEW, label: 'Ver painel global da torcida' },
      { key: PERMISSIONS.AFFILIATION_MANAGE, label: 'Decidir afiliação de unidades' },
    ],
  },
  {
    label: 'Sedes / Estrutura',
    base: PERMISSIONS.SEDES_VIEW,
    items: [
      { key: PERMISSIONS.SEDES_VIEW, label: 'Ver estrutura / unidades' },
      { key: PERMISSIONS.SEDES_MANAGE, label: 'Gerenciar sedes' },
    ],
  },
  {
    label: 'Outros',
    base: null,
    items: [
      { key: PERMISSIONS.ROLES_MANAGE, label: 'Gerenciar cargos' },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: 'Gerenciar configurações' },
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
/** Ops de comunidade admin que puxam `community:view` (sem afetar `community:post`). */
const COMMUNITY_OPS_COM_VIEW = [
  PERMISSIONS.COMMUNITY_MANAGE,
  PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
  PERMISSIONS.COMMUNITY_MODERATE,
  PERMISSIONS.NEWS_CURATE,
]

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

  // Comunidade: manage/publish/moderate/curate herdam view; post não.
  // Remover view derruba as ops admin (mesmo padrão dos grupos com base).
  if (prev.has(PERMISSIONS.COMMUNITY_VIEW) && !result.has(PERMISSIONS.COMMUNITY_VIEW)) {
    for (const k of COMMUNITY_OPS_COM_VIEW) result.delete(k)
  }
  if (COMMUNITY_OPS_COM_VIEW.some((k) => result.has(k))) {
    result.add(PERMISSIONS.COMMUNITY_VIEW)
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
  { key: 'bar', label: 'Bar' },
  { key: 'comunidade', label: 'Comunidade e comunicados' },
  { key: 'sedes', label: 'Sedes e subsedes' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'patrimonio', label: 'Patrimônio' },
  { key: 'caravanas', label: 'Caravanas' },
  { key: 'bateria', label: 'Bateria' },
  { key: 'membros', label: 'Membros' },
])

/**
 * Rota de destino no **portal** para cada módulo de `DEPARTAMENTO_MODULOS`.
 * Nunca aponta para `/admin` — membros operam no portal; gestores usam
 * `DEPARTAMENTO_MODULO_ADMIN_ROTA` via atalho "Operação".
 * `disponivel: false` = experiência ainda só na home da área (`/portal/departamentos/[slug]`).
 */
export const DEPARTAMENTO_MODULO_ROTA = /** @type {const} */ ({
  eventos: { href: '/portal/eventos', disponivel: true },
  loja: { href: '/portal/loja', disponivel: true },
  bar: { href: '/portal/bar', disponivel: true },
  comunidade: { href: '/portal/comunidade', disponivel: true },
  sedes: { href: '/portal/sedes', disponivel: true },
  // Diretoria / pessoas: home da área no portal (sem fila admin para membros)
  membros: { href: null, disponivel: false },
  financeiro: { href: '/portal/financeiro', disponivel: true },
  patrimonio: { href: '/portal/patrimonio', disponivel: true },
  caravanas: { href: '/portal/eventos?tipo=CARAVANA', disponivel: true },
  bateria: { href: '/portal/eventos?tipo=ENSAIO', disponivel: true },
})

/**
 * Rota admin correspondente ao módulo (atalho "Operação" do hub — só gestores).
 * null = sem área admin dedicada ainda.
 */
export const DEPARTAMENTO_MODULO_ADMIN_ROTA = /** @type {const} */ ({
  eventos: '/admin/eventos',
  loja: '/admin/loja',
  bar: '/admin/bar',
  comunidade: '/admin/comunidade',
  sedes: '/admin/sedes',
  membros: '/admin/torcedores',
  financeiro: '/admin/financeiro',
  patrimonio: '/admin/patrimonio',
  caravanas: '/admin/eventos?tipo=CARAVANA',
  bateria: '/admin/eventos?tipo=ENSAIO',
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
  // Admin comum NÃO tem visão global da torcida nem decide afiliação —
  // só Presidente (owner) e Vice.
  // `MEMBERS_PURGE` é hard delete do cadastro: fica só com o Presidente
  // (owner) e o super-admin. Sem excluí-la aqui, admin e vice a herdariam de
  // graça — `ALL_PERMISSIONS` é a base dos dois pacotes.
  [SYSTEM_ROLES.ADMIN]: ALL_PERMISSIONS.filter(
    (p) =>
      p !== PERMISSIONS.SETTINGS_MANAGE &&
      p !== PERMISSIONS.TORCIDA_GLOBAL_VIEW &&
      p !== PERMISSIONS.AFFILIATION_MANAGE &&
      p !== PERMISSIONS.MEMBERS_PURGE,
  ),
  [SYSTEM_ROLES.VICE]: ALL_PERMISSIONS.filter(
    (p) => p !== PERMISSIONS.SETTINGS_MANAGE && p !== PERMISSIONS.MEMBERS_PURGE,
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
 * - Cargo de sistema (`owner` / `admin` / `vice` / `member`): pacote =
 *   `SYSTEM_ROLE_PERMISSIONS[nome]`. Não lê o array gravado no `Role`
 *   (Achado 1 — a próxima permissão nova passa a valer sem
 *   `db:repair-system-roles`; o repair vira higiene de UI/bootstrap).
 * - Com departamento (perfil de área): pacote (membro/gestor) ∪ permissionsExtras
 * - Sem departamento (transversal custom): permissions (legado) ∪ permissionsExtras
 *
 * @param {{
 *   nome?: string | null,
 *   permissions?: string[],
 *   permissionsExtras?: string[],
 *   departamentoId?: string | null,
 *   papelNoDepartamento?: string | null,
 * }} role
 * @param {{ permissions?: string[], permissionsGestor?: string[] } | null | undefined} departamento
 * @returns {string[]}
 */
export function permissionsOfRole(role, departamento) {
  const pacoteSistema =
    role.nome != null
      ? /** @type {Record<string, string[] | undefined>} */ (SYSTEM_ROLE_PERMISSIONS)[role.nome]
      : undefined
  if (pacoteSistema) {
    return [...pacoteSistema]
  }

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
 * Regra de delegação: **ninguém concede o que não tem**.
 *
 * Devolve as permissões de `desejadas` que estão fora do conjunto efetivo do
 * ator — vazio quando a delegação é legítima. Serve tanto para conceder
 * permissão avulsa (override) quanto para atribuir um cargo inteiro (basta
 * passar o pacote do cargo como `desejadas`).
 *
 * Sem isso, `roles:manage` equivale a owner na prática: quem administra cargos
 * fabrica um cargo com qualquer permissão do catálogo, veste, e escala. Isso
 * derruba uma fronteira que o próprio código desenha — `SYSTEM_ROLE_PERMISSIONS`
 * tira `settings:manage` de `admin` e `vice` de propósito. Ver
 * `docs/ops/auditoria-funcional-2026-07.md` §Achado 6.
 *
 * O ator com `'*'` (owner) delega tudo. Super-admin não passa por aqui — ele
 * opera fora do RBAC por tenant.
 *
 * @param {string[]} atorEfetivas - conjunto efetivo de quem está delegando
 * @param {string[]} desejadas - permissões que a operação quer conceder
 * @returns {string[]} subconjunto de `desejadas` fora do alcance do ator
 */
export function permissoesForaDoAlcance(atorEfetivas, desejadas) {
  if (atorEfetivas.includes(WILDCARD_PERMISSION)) return []
  const efetivas = new Set(atorEfetivas)
  return Array.from(new Set(desejadas)).filter((p) => !efetivas.has(p))
}

/**
 * Rótulos de permissões que existem no catálogo mas NÃO aparecem em
 * `PERMISSION_GROUPS` — o formulário de cargos não as oferece porque são
 * exclusivas do Presidente. Ainda assim precisam de nome legível: é
 * exatamente o que a recusa de delegação (Achado 6) mostra ao usuário.
 */
const PERMISSION_LABELS_FORA_DO_FORMULARIO = {
  [PERMISSIONS.SETTINGS_MANAGE]: 'Configurações da torcida',
}

/**
 * Rótulo legível de uma permissão (o mesmo do formulário de cargos). Cai na
 * própria chave quando a permissão não está catalogada — mensagem de erro
 * nunca deve cuspir `undefined`.
 *
 * @param {string} permission
 * @returns {string}
 */
export function labelPermission(permission) {
  for (const group of PERMISSION_GROUPS) {
    for (const item of group.items) {
      if (item.key === permission) return item.label
    }
  }
  return PERMISSION_LABELS_FORA_DO_FORMULARIO[permission] ?? permission
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
 * Expandir a hierarquia territorial (Adicionar local) só na Sede principal.
 * `sedes:manage` em subsede/PDE (Caso B) permite editar a própria unidade,
 * não criar novos locais sob a torcida.
 *
 * @param {string} tipoSede - TipoSede ('SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO')
 * @returns {boolean}
 */
export function podeCriarUnidadeTerritorial(tipoSede) {
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
