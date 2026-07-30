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
  // Catálogo, pedidos, categorias, cupons e desempenho são tabs de `/admin/loja`.
  // Quem só tem `store:view-orders` cai direto em Pedidos (ver loja/page.tsx).
  {
    id: 'loja',
    label: 'Loja',
    href: '/admin/loja',
    permissao: [PERMISSIONS.STORE_MANAGE, PERMISSIONS.STORE_VIEW_ORDERS],
    secao: 'loja',
  },
  // Etapas do módulo (vendas, fiado, produtos, estoque, desempenho) vivem nas
  // tabs de `/admin/bar` — o menu guarda só a entrada do módulo e o atalho
  // operacional do PDV, que é tela cheia e fica fora do shell de tabs.
  {
    id: 'bar',
    label: 'Bar',
    href: '/admin/bar',
    permissao: [PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE],
    secao: 'bar',
  },
  {
    id: 'bar-pdv',
    label: 'PDV',
    href: '/admin/bar/pdv',
    permissao: [PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE],
    secao: 'bar',
  },
  // Comunicados, mural, moderação e notícias são tabs de `/admin/comunidade`.
  // As permissões aqui são a união das etapas — quem tem só `news:curate`
  // entra pelo módulo e cai direto em Notícias (ver `primeiraTabPermitida`).
  {
    id: 'comunidade',
    label: 'Comunidade',
    href: '/admin/comunidade',
    permissao: [
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.MESSAGES_MODERATE,
      PERMISSIONS.NEWS_CURATE,
    ],
    secao: 'comunidade',
  },
  // Lançamentos, evolução, cobranças e planos são tabs de `/admin/financeiro`.
  // `/admin/cobrancas` e `/admin/planos-associacao` seguem como redirect: há
  // notificações gravadas no banco apontando para a URL antiga.
  {
    id: 'financeiro',
    label: 'Financeiro',
    href: '/admin/financeiro',
    // finance:view = portal; admin = operação do gestor.
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
    id: 'afiliacoes',
    label: 'Solicitações de afiliação',
    href: '/admin/afiliacoes',
    permissao: PERMISSIONS.AFFILIATION_MANAGE,
    secao: 'governanca',
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
  // Leitura de inteligência administrativa (indicadores/insights por módulo).
  {
    id: 'relatorios',
    label: 'Relatórios',
    href: '/admin/relatorios',
    permissao: PERMISSIONS.REPORTS_VIEW,
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
 * Etapa de um módulo do admin, na forma consumida pelo layout.
 *
 * Existe porque `ADMIN_MODULOS` é `as const`: sem este contrato, o `.filter`
 * devolve a união literal das tabs declaradas e `matchPaths` — presente em
 * poucas — deixa de existir no tipo.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   href: string,
 *   permissao: string | readonly string[] | null,
 *   matchPaths?: readonly string[],
 * }} AdminModuloTab
 */

/**
 * Módulos do admin navegados por **tabs de rota** (`AdminModuleTabs` no
 * `layout.tsx` do segmento). Fonte única da relação módulo → etapas: o layout
 * monta a barra a partir daqui, o menu lateral guarda só a entrada do módulo
 * (`menuId`) e os badges de notificação resolvem a rota para essa entrada.
 *
 * Só rótulo/ordem/permissão vivem aqui — ícone e contagem ficam no layout,
 * porque componente React não atravessa o boundary Server→Client.
 *
 * Regras de corte (ver `ARCHITECTURE.md` §5.12): tab é etapa do mesmo módulo,
 * sobre a mesma entidade-raiz, deep-linkável. Tela imersiva (PDV), detalhe de
 * item (`[id]`) e leitura cross-módulo (Relatórios) **não** viram tab.
 *
 * `permissao`: string (única), array (OR) ou `null` (herda o gate do módulo).
 * `matchPaths`: rotas irmãs que ativam a tab sem aparecer na barra.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   href: string,
 *   permissao: string | readonly string[] | null,
 *   matchPaths?: readonly string[],
 * }} AdminModuloTab
 * @typedef {{ id: string, menuId: string, href: string, tabs: readonly AdminModuloTab[] }} AdminModulo
 *
 * @type {readonly AdminModulo[]}
 */
export const ADMIN_MODULOS = ([
  {
    id: 'loja',
    menuId: 'loja',
    href: '/admin/loja',
    tabs: [
      { id: 'catalogo', label: 'Catálogo', href: '/admin/loja', permissao: PERMISSIONS.STORE_MANAGE },
      {
        id: 'pedidos',
        label: 'Pedidos',
        href: '/admin/loja/pedidos',
        permissao: [PERMISSIONS.STORE_MANAGE, PERMISSIONS.STORE_VIEW_ORDERS],
      },
      {
        id: 'categorias',
        label: 'Categorias',
        href: '/admin/loja/categorias',
        permissao: PERMISSIONS.STORE_MANAGE,
      },
      { id: 'cupons', label: 'Cupons', href: '/admin/loja/cupons', permissao: PERMISSIONS.STORE_MANAGE },
      {
        id: 'desempenho',
        label: 'Desempenho',
        href: '/admin/loja/desempenho',
        permissao: PERMISSIONS.STORE_MANAGE,
      },
    ],
  },
  {
    id: 'bar',
    menuId: 'bar',
    href: '/admin/bar',
    tabs: [
      { id: 'balcao', label: 'Balcão', href: '/admin/bar', permissao: null },
      {
        id: 'vendas',
        label: 'Vendas',
        href: '/admin/bar/vendas',
        permissao: null,
        // Estorno é venda revertida — mesma etapa.
        matchPaths: ['/admin/bar/estornos'],
      },
      { id: 'fiado', label: 'Fiado', href: '/admin/bar/fiado', permissao: PERMISSIONS.BAR_MANAGE },
      { id: 'produtos', label: 'Produtos', href: '/admin/bar/produtos', permissao: PERMISSIONS.BAR_MANAGE },
      {
        id: 'estoque',
        label: 'Estoque',
        href: '/admin/bar/estoque',
        permissao: PERMISSIONS.BAR_MANAGE,
        // Fornecedor só existe para abastecer o estoque.
        matchPaths: ['/admin/bar/fornecedores'],
      },
      {
        id: 'desempenho',
        label: 'Desempenho',
        href: '/admin/bar/desempenho',
        // Margem/CMV: quem gere o bar ou quem lê o financeiro.
        permissao: [PERMISSIONS.BAR_MANAGE, PERMISSIONS.FINANCE_VIEW],
      },
    ],
  },
  {
    id: 'comunidade',
    menuId: 'comunidade',
    href: '/admin/comunidade',
    tabs: [
      {
        id: 'visao-geral',
        label: 'Visão geral',
        href: '/admin/comunidade',
        permissao: [PERMISSIONS.COMMUNITY_MANAGE, PERMISSIONS.ANNOUNCEMENTS_PUBLISH],
      },
      {
        id: 'comunicados',
        label: 'Comunicados',
        href: '/admin/comunidade/comunicados',
        permissao: PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      },
      {
        id: 'mural',
        label: 'Mural',
        href: '/admin/comunidade/mural',
        permissao: PERMISSIONS.COMMUNITY_MANAGE,
      },
      {
        id: 'moderacao',
        label: 'Moderação',
        href: '/admin/comunidade/moderacao',
        permissao: [PERMISSIONS.COMMUNITY_MODERATE, PERMISSIONS.MESSAGES_MODERATE],
      },
      {
        id: 'noticias',
        label: 'Notícias',
        href: '/admin/comunidade/noticias',
        permissao: PERMISSIONS.NEWS_CURATE,
      },
    ],
  },
  {
    id: 'financeiro',
    menuId: 'financeiro',
    href: '/admin/financeiro',
    tabs: [
      { id: 'lancamentos', label: 'Lançamentos', href: '/admin/financeiro', permissao: null },
      { id: 'evolucao', label: 'Evolução', href: '/admin/financeiro/evolucao', permissao: null },
      { id: 'cobrancas', label: 'Cobranças', href: '/admin/financeiro/cobrancas', permissao: null },
      { id: 'planos', label: 'Planos de sócio', href: '/admin/financeiro/planos', permissao: null },
    ],
  },
])

/**
 * @param {string} moduloId
 * @returns {AdminModulo | null}
 */
export function getAdminModulo(moduloId) {
  return ADMIN_MODULOS.find((m) => m.id === moduloId) ?? null
}

/**
 * Testa `permissao` no formato do menu/tab: string, array (OR) ou `null`
 * (sempre permitido — o gate é do módulo).
 *
 * @param {string | readonly string[] | null} permissao
 * @param {string[]} effectivePermissions
 */
function permite(permissao, effectivePermissions) {
  if (permissao === null || permissao === undefined) return true
  if (Array.isArray(permissao)) {
    return permissao.some((p) => hasPermission(effectivePermissions, p))
  }
  return hasPermission(effectivePermissions, /** @type {string} */ (permissao))
}

/**
 * Tabs do módulo visíveis para as permissões efetivas, na ordem declarada.
 *
 * Nunca é controle de acesso: cada rota-tab continua responsável pelo próprio
 * `assertPermission`. Serve para não oferecer uma etapa que o usuário não pode
 * abrir — e para escolher o destino de quem não tem a etapa raiz.
 *
 * @param {string} moduloId
 * @param {string[]} effectivePermissions
 * @returns {AdminModuloTab[]}
 */
export function tabsPermitidasDoModulo(moduloId, effectivePermissions) {
  const modulo = getAdminModulo(moduloId)
  if (!modulo) return []
  return modulo.tabs.filter((tab) => permite(tab.permissao, effectivePermissions))
}

/**
 * Primeira etapa que o usuário pode abrir — destino de quem chega na raiz do
 * módulo sem permissão para a etapa raiz (ex.: `store:view-orders` cai em
 * Pedidos em vez de ser expulso para `/admin`).
 *
 * @param {string} moduloId
 * @param {string[]} effectivePermissions
 * @returns {string | null}
 */
export function primeiraTabPermitida(moduloId, effectivePermissions) {
  return tabsPermitidasDoModulo(moduloId, effectivePermissions)[0]?.href ?? null
}

/**
 * Item de `ADMIN_MENU` que **hoje** representa uma rota — casamento por prefixo
 * mais longo, ignorando itens `exact` que não sejam a rota inteira.
 *
 * É o que impede o bug silencioso dos badges: ao transformar uma rota de menu
 * em tab de módulo, o badge sobe sozinho para a entrada do módulo em vez de
 * sumir apontando para um id que não existe mais.
 *
 * @param {string} rota
 * @returns {string | null}
 */
export function resolverMenuIdDeRota(rota) {
  const base = rota.split('?')[0] ?? rota
  /** @type {string | null} */
  let menuId = null
  let maisEspecifico = -1

  for (const item of ADMIN_MENU) {
    if (item.exact) {
      if (base === item.href && item.href.length > maisEspecifico) {
        maisEspecifico = item.href.length
        menuId = item.id
      }
      continue
    }
    const casa = base === item.href || base.startsWith(`${item.href}/`)
    if (casa && item.href.length > maisEspecifico) {
      maisEspecifico = item.href.length
      menuId = item.id
    }
  }

  return menuId
}

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
