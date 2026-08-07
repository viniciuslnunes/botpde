import { PERMISSIONS, hasPermission } from './permissions.js'

/**
 * Seções do menu admin. `label: null` = sem cabeçalho (Dashboard).
 *
 * Uma seção só se justifica quando **agrupa** e diz algo que os nomes dos
 * itens não dizem sozinhos. Enquanto cada módulo ocupava 3–7 linhas, havia uma
 * seção por módulo; depois que o módulo virou **uma** entrada (tabs de rota,
 * §5.12), sobravam cinco cabeçalhos repetindo o nome do único item abaixo
 * (Loja › Loja, Comunidade › Comunidade…). Agora agrupam por natureza do
 * trabalho, não por módulo.
 */
export const ADMIN_MENU_SECOES = /** @type {const} */ ([
  { id: 'geral', label: null },
  { id: 'pessoas', label: 'Pessoas' },
  { id: 'operacao', label: 'Operação' },
  { id: 'financas', label: 'Finanças' },
  { id: 'governanca', label: 'Governança' },
])

/**
 * Árvore de menu do admin, protegida por permissão.
 * Cada item some da navegação (e deveria ser bloqueado na rota também)
 * se o usuário não tiver a permissão listada em `permissao`.
 * `permissao: null` = sempre visível para quem tem acesso à área admin.
 *
 * A visibilidade é **por permissão efetiva** (cargo/depto/extras/overrides).
 * Hubs thin de departamento (`departamentoSlug`) exigem gestoria adicional —
 * ver `filterMenuByPermissionsAndGestoria`. Domínios ricos (Financeiro, Loja…)
 * não filtram por id de departamento.
 */
export const ADMIN_MENU = /** @type {const} */ ([
  { id: 'dashboard', label: 'Dashboard', href: '/admin', permissao: null, exact: true, secao: 'geral' },
  // Visão da torcida, unidades (sedes), hierarquia e solicitações de afiliação
  // são tabs de `/admin/torcida` (route group `admin/(estrutura)/` — as URLs
  // não mudaram). Quem só tem `roles:manage` ou `affiliation:manage` cai na
  // própria etapa (ver torcida/page.tsx). Console global e solicitações só
  // existem na Sede principal: o layout do admin esconde a entrada, e o do
  // módulo esconde a tab.
  {
    id: 'estrutura',
    label: 'Estrutura',
    href: '/admin/torcida',
    permissao: [
      PERMISSIONS.TORCIDA_GLOBAL_VIEW,
      PERMISSIONS.SEDES_VIEW,
      PERMISSIONS.SEDES_MANAGE,
      PERMISSIONS.ROLES_MANAGE,
      PERMISSIONS.AFFILIATION_MANAGE,
      PERMISSIONS.LEADERSHIP_TRANSFER,
    ],
    secao: 'governanca',
  },
  // Aprovar torcedores/sócios sem members:view ainda precisa ver a fila.
  // Solicitações de sócio ficam em /admin/socios; torcedores em /admin/torcedores.
  {
    id: 'torcedores',
    label: 'Torcedores',
    href: '/admin/torcedores',
    permissao: [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.MEMBERS_APPROVE],
    secao: 'pessoas',
  },
  {
    id: 'socios',
    label: 'Sócios',
    href: '/admin/socios',
    // MEMBERS_APPROVE: fila de solicitações (SOCIO PENDENTE) mora neste hub.
    permissao: [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.MEMBERS_APPROVE],
    secao: 'pessoas',
  },
  // Departamento como área operacional (áreas de atuação, equipes). O pacote
  // de PERMISSÃO de cada departamento continua em /admin/acessos — aqui é
  // organização de gente, não RBAC.
  {
    id: 'departamentos',
    label: 'Departamentos',
    href: '/admin/departamentos',
    permissao: PERMISSIONS.ROLES_MANAGE,
    secao: 'pessoas',
  },
  {
    id: 'eventos',
    label: 'Agenda',
    href: '/admin/eventos',
    // Leitura (Diretoria oversight) × gerir.
    permissao: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_MANAGE],
    secao: 'operacao',
  },
  // Hubs thin de departamento (comando do gestor). Visibilidade fina por
  // `departamentoSlug` em `filterMenuByPermissionsAndGestoria` — vários
  // compartilham `events:*` e o menu só por permissão misturaria Caravanas
  // com Bateria/Social/etc.
  {
    id: 'caravanas',
    label: 'Caravanas',
    href: '/admin/caravanas',
    permissao: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE],
    secao: 'operacao',
    departamentoSlug: 'caravanas',
  },
  {
    id: 'bateria',
    label: 'Bateria',
    href: '/admin/bateria',
    // Patrimônio na página é bloco extra; menu não usa patrimony:view sozinho
    // (membro Bateria tem view e não deve entrar no admin só por isso).
    permissao: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE],
    secao: 'operacao',
    departamentoSlug: 'bateria',
  },
  {
    id: 'bandeiras',
    label: 'Bandeiras',
    href: '/admin/bandeiras',
    // `flags:manage` é o pacote do gestor da área; events:* entra porque a
    // escala de jogo é evento da Agenda. `flags:view` (colaborador) fica de
    // fora de propósito: acervo se opera no portal.
    permissao: [
      PERMISSIONS.FLAGS_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
    ],
    secao: 'operacao',
    departamentoSlug: 'bandeiras',
  },
  {
    id: 'social',
    label: 'Social',
    href: '/admin/social',
    permissao: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE],
    secao: 'operacao',
    departamentoSlug: 'social-e-eventos',
  },
  {
    id: 'feminino',
    label: 'Feminino',
    href: '/admin/feminino',
    permissao: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE],
    secao: 'operacao',
    departamentoSlug: 'feminino',
  },
  {
    id: 'carnaval',
    label: 'Carnaval',
    href: '/admin/carnaval',
    permissao: [PERMISSIONS.EVENTS_VIEW, PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_MANAGE],
    secao: 'operacao',
    departamentoSlug: 'carnaval',
  },
  {
    id: 'diretoria',
    label: 'Diretoria',
    href: '/admin/diretoria',
    permissao: [
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.MEMBERS_APPROVE,
      PERMISSIONS.ROLES_MANAGE,
      PERMISSIONS.AUDIT_VIEW,
    ],
    secao: 'operacao',
    departamentoSlug: 'diretoria',
  },
  // Catálogo, pedidos, categorias, cupons e desempenho são tabs de `/admin/loja`.
  // Quem só tem `store:view-orders` cai direto em Pedidos (ver loja/page.tsx).
  {
    id: 'loja',
    label: 'Loja',
    href: '/admin/loja',
    permissao: [PERMISSIONS.STORE_MANAGE, PERMISSIONS.STORE_VIEW_ORDERS],
    secao: 'operacao',
  },
  // Etapas do módulo (vendas, comandas, produtos, estoque, desempenho) vivem nas
  // tabs de `/admin/bar` — o menu guarda só a entrada do módulo e o atalho
  // operacional do PDV, que é tela cheia e fica fora do shell de tabs.
  {
    id: 'bar',
    label: 'Bar',
    href: '/admin/bar',
    permissao: [PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE],
    secao: 'operacao',
  },
  {
    id: 'bar-pdv',
    label: 'PDV',
    href: '/admin/bar/pdv',
    permissao: [PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE],
    secao: 'operacao',
  },
  // Comunicados, mural, moderação e notícias são tabs de `/admin/comunidade`.
  // As permissões aqui são a união das etapas — quem tem só `news:curate`
  // entra pelo módulo e cai direto em Notícias (ver `primeiraTabPermitida`).
  {
    id: 'comunidade',
    label: 'Comunidade',
    href: '/admin/comunidade',
    permissao: [
      PERMISSIONS.COMMUNITY_VIEW,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.MESSAGES_MODERATE,
      PERMISSIONS.NEWS_CURATE,
    ],
    secao: 'operacao',
  },
  // Lançamentos, evolução, cobranças e planos são tabs de `/admin/financeiro`.
  // Home do módulo = Direção (inbox). `/admin/cobrancas` e
  // `/admin/planos-associacao` seguem como redirect: há notificações gravadas
  // apontando para a URL antiga.
  {
    id: 'financeiro',
    label: 'Financeiro',
    href: '/admin/financeiro',
    // finance:view sozinho = portal; admin exige manage OU (view + audit) —
    // oversight da Diretoria sem abrir o livro-caixa para o colaborador Financeiro.
    permissao: [
      PERMISSIONS.FINANCE_MANAGE,
      [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.AUDIT_VIEW],
    ],
    secao: 'financas',
  },
  {
    id: 'patrimonio',
    label: 'Patrimônio',
    href: '/admin/patrimonio',
    permissao: [
      PERMISSIONS.PATRIMONY_MANAGE,
      [PERMISSIONS.PATRIMONY_VIEW, PERMISSIONS.AUDIT_VIEW],
    ],
    secao: 'financas',
  },
  // Rede externa: domínio próprio, não vira etapa de Estrutura (que é a
  // organização interna da própria torcida).
  {
    id: 'aliancas',
    label: 'Alianças',
    href: '/admin/aliancas',
    permissao: PERMISSIONS.ALLIANCES_MANAGE,
    secao: 'governanca',
  },
  // Leitura de inteligência administrativa (indicadores/insights por módulo).
  // Cross-módulo por natureza — por isso não é tab de ninguém.
  {
    id: 'relatorios',
    label: 'Relatórios',
    href: '/admin/relatorios',
    permissao: PERMISSIONS.REPORTS_VIEW,
    secao: 'governanca',
  },
  // Configurações, design, controle de acesso e auditoria são tabs de
  // `/admin/configuracoes` (route group `admin/(plataforma)/`).
  // Quem só tem `roles:manage` ou `audit:view` cai na própria etapa
  // (ver configuracoes/page.tsx). Auditoria é append-only: sem mutações na UI.
  {
    id: 'plataforma',
    label: 'Plataforma',
    href: '/admin/configuracoes',
    permissao: [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.ROLES_MANAGE, PERMISSIONS.AUDIT_VIEW, PERMISSIONS.ASSOCIACAO_PENDENCIAS_MANAGE],
    secao: 'governanca',
  },
])

/**
 * Permissão de item de menu/tab:
 * - `null` → sempre permitido (gate é do módulo)
 * - `string` → precisa daquela permissão
 * - `string[]` → OR entre entradas
 * - entrada aninhada `string[]` → AND (oversight: view + audit)
 *
 * @typedef {string | readonly (string | readonly string[])[] | null} MenuPermissao
 */

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
 *   permissao: MenuPermissao,
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
 * `permissao`: ver `MenuPermissao` (string, OR, AND aninhado, ou `null`).
 * `matchPaths`: rotas irmãs que ativam a tab sem aparecer na barra.
 *
 * @typedef {{ id: string, menuId: string, href: string, tabs: readonly AdminModuloTab[] }} AdminModulo
 *
 * @type {readonly AdminModulo[]}
 */
export const ADMIN_MODULOS = ([
  {
    id: 'departamentos',
    menuId: 'departamentos',
    href: '/admin/departamentos',
    tabs: [
      { id: 'visao', label: 'Visão', href: '/admin/departamentos', permissao: PERMISSIONS.ROLES_MANAGE },
      {
        id: 'areas',
        label: 'Áreas',
        href: '/admin/departamentos/areas',
        permissao: PERMISSIONS.ROLES_MANAGE,
      },
      {
        id: 'equipes',
        label: 'Equipes',
        href: '/admin/departamentos/equipes',
        permissao: PERMISSIONS.ROLES_MANAGE,
      },
      {
        id: 'projetos',
        label: 'Projetos',
        href: '/admin/departamentos/projetos',
        permissao: PERMISSIONS.ROLES_MANAGE,
      },
      // O pacote de PERMISSÃO do departamento continua em /admin/acessos e NÃO
      // vira tab daqui: tab é etapa do próprio módulo (ARCHITECTURE §5.12). O
      // caminho para lá é um link na Visão.
    ],
  },
  {
    id: 'loja',
    menuId: 'loja',
    href: '/admin/loja',
    tabs: [
      { id: 'comando', label: 'Comando', href: '/admin/loja', permissao: PERMISSIONS.STORE_MANAGE },
      {
        id: 'catalogo',
        label: 'Catálogo',
        href: '/admin/loja/produtos',
        permissao: PERMISSIONS.STORE_MANAGE,
        matchPaths: ['/admin/loja/categorias', '/admin/loja/vitrine'],
      },
      {
        id: 'pedidos',
        label: 'Pedidos',
        href: '/admin/loja/pedidos',
        permissao: [PERMISSIONS.STORE_MANAGE, PERMISSIONS.STORE_VIEW_ORDERS],
      },
      {
        id: 'tickets',
        label: 'Arquivo',
        href: '/admin/loja/tickets',
        permissao: [PERMISSIONS.STORE_MANAGE, PERMISSIONS.STORE_VIEW_ORDERS],
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
      {
        id: 'comandas',
        label: 'Comandas',
        href: '/admin/bar/comandas',
        // Lista = bar:operate (§5.10); OR manage evita regressão de papéis
        // que só tinham manage no fiado legado. Quit/cancel na UI = manage.
        permissao: [PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE],
        // Links legados de Notificacao / redirect permanente.
        matchPaths: ['/admin/bar/fiado'],
      },
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
        permissao: [
          PERMISSIONS.COMMUNITY_VIEW,
          PERMISSIONS.COMMUNITY_MANAGE,
          PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
        ],
      },
      {
        id: 'comunicados',
        label: 'Comunicados',
        href: '/admin/comunidade/comunicados',
        permissao: [PERMISSIONS.COMMUNITY_VIEW, PERMISSIONS.ANNOUNCEMENTS_PUBLISH],
      },
      {
        id: 'mural',
        label: 'Mural',
        href: '/admin/comunidade/mural',
        permissao: [PERMISSIONS.COMMUNITY_VIEW, PERMISSIONS.COMMUNITY_MANAGE],
      },
      {
        id: 'moderacao',
        label: 'Moderação',
        href: '/admin/comunidade/moderacao',
        permissao: [
          PERMISSIONS.COMMUNITY_VIEW,
          PERMISSIONS.COMMUNITY_MODERATE,
          PERMISSIONS.MESSAGES_MODERATE,
        ],
      },
      {
        id: 'noticias',
        label: 'Notícias',
        href: '/admin/comunidade/noticias',
        permissao: [PERMISSIONS.COMMUNITY_VIEW, PERMISSIONS.NEWS_CURATE],
      },
    ],
  },
  {
    id: 'financeiro',
    menuId: 'financeiro',
    href: '/admin/financeiro',
    tabs: [
      { id: 'direcao', label: 'Direção', href: '/admin/financeiro', permissao: null },
      {
        id: 'lancamentos',
        label: 'Lançamentos',
        href: '/admin/financeiro/lancamentos',
        permissao: null,
      },
      { id: 'evolucao', label: 'Evolução', href: '/admin/financeiro/evolucao', permissao: null },
      { id: 'cobrancas', label: 'Cobranças', href: '/admin/financeiro/cobrancas', permissao: null },
      { id: 'planos', label: 'Planos de sócio', href: '/admin/financeiro/planos', permissao: null },
    ],
  },
  // Estrutura e Plataforma são montados em **route group**
  // (`admin/(estrutura)/`, `admin/(plataforma)/`): as etapas não compartilham
  // prefixo com a raiz, então mover as rotas exigiria redirects. O group dá o
  // layout comum sem tocar em nenhuma URL — e `resolverMenuIdDeRota` acha o
  // módulo pelas tabs, não pelo prefixo.
  {
    id: 'estrutura',
    menuId: 'estrutura',
    href: '/admin/torcida',
    tabs: [
      {
        id: 'visao-geral',
        label: 'Visão geral',
        href: '/admin/torcida',
        // Presidente vê o console consolidado; quem gere ou só lê unidades vê a árvore.
        permissao: [
          PERMISSIONS.TORCIDA_GLOBAL_VIEW,
          PERMISSIONS.SEDES_VIEW,
          PERMISSIONS.SEDES_MANAGE,
        ],
        // Leitura de uma unidade pertence à visão consolidada.
        matchPaths: ['/admin/torcida/unidade'],
      },
      {
        id: 'unidades',
        label: 'Unidades',
        href: '/admin/sedes',
        permissao: [PERMISSIONS.SEDES_VIEW, PERMISSIONS.SEDES_MANAGE],
      },
      {
        id: 'hierarquia',
        label: 'Hierarquia',
        href: '/admin/hierarquia',
        permissao: PERMISSIONS.ROLES_MANAGE,
      },
      {
        id: 'solicitacoes',
        label: 'Solicitações',
        href: '/admin/afiliacoes',
        permissao: PERMISSIONS.AFFILIATION_MANAGE,
      },
      // Passar o mandato adiante. Só o owner tem `leadership:transfer`
      // (`SYSTEM_ROLE_PERMISSIONS` tira de admin e vice), então a etapa some
      // para o resto da diretoria em vez de aparecer bloqueada.
      {
        id: 'presidencia',
        label: 'Presidência',
        href: '/admin/presidencia',
        permissao: PERMISSIONS.LEADERSHIP_TRANSFER,
      },
    ],
  },
  {
    id: 'plataforma',
    menuId: 'plataforma',
    href: '/admin/configuracoes',
    tabs: [
      {
        id: 'geral',
        label: 'Geral',
        href: '/admin/configuracoes',
        permissao: [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.ASSOCIACAO_PENDENCIAS_MANAGE],
      },
      {
        id: 'transparencia',
        label: 'Transparência',
        href: '/admin/configuracoes/transparencia',
        permissao: PERMISSIONS.SETTINGS_MANAGE,
      },
      {
        id: 'integracoes',
        label: 'Integrações',
        href: '/admin/configuracoes/integracoes',
        permissao: PERMISSIONS.SETTINGS_MANAGE,
      },
      { id: 'identidade', label: 'Identidade', href: '/admin/design', permissao: PERMISSIONS.SETTINGS_MANAGE },
      { id: 'acessos', label: 'Acessos', href: '/admin/acessos', permissao: PERMISSIONS.ROLES_MANAGE },
      { id: 'auditoria', label: 'Auditoria', href: '/admin/auditoria', permissao: PERMISSIONS.AUDIT_VIEW },
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
 * Testa `permissao` no formato do menu/tab:
 * - `null` → sempre permitido (gate é do módulo)
 * - `string` → precisa daquela permissão
 * - `string[]` → OR entre entradas
 * - entrada aninhada `string[]` → AND (oversight: view + audit, sem abrir
 *   o módulo admin para quem só tem view no portal)
 *
 * @param {string | readonly (string | readonly string[])[] | null} permissao
 * @param {string[]} effectivePermissions
 */
function permite(permissao, effectivePermissions) {
  if (permissao === null || permissao === undefined) return true
  if (typeof permissao === 'string') {
    return hasPermission(effectivePermissions, permissao)
  }
  if (Array.isArray(permissao)) {
    return permissao.some((entry) => {
      if (Array.isArray(entry)) {
        return entry.every((p) => hasPermission(effectivePermissions, p))
      }
      return hasPermission(effectivePermissions, entry)
    })
  }
  return false
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
 * Módulo dono de uma rota, se ela for etapa de algum — casamento por prefixo
 * mais longo entre `href` e `matchPaths` das tabs.
 *
 * @param {string} rota
 * @returns {AdminModulo | null}
 */
export function resolverModuloDeRota(rota) {
  const base = rota.split('?')[0] ?? rota
  /** @type {AdminModulo | null} */
  let dono = null
  let maisEspecifico = -1

  for (const modulo of ADMIN_MODULOS) {
    for (const tab of modulo.tabs) {
      for (const alvo of [tab.href, ...(tab.matchPaths ?? [])]) {
        const casa = base === alvo || base.startsWith(`${alvo}/`)
        if (casa && alvo.length > maisEspecifico) {
          maisEspecifico = alvo.length
          dono = modulo
        }
      }
    }
  }

  return dono
}

/**
 * Item de `ADMIN_MENU` que **hoje** representa uma rota — o casamento mais
 * específico entre as entradas do menu e as tabs dos módulos.
 *
 * É o que impede o bug silencioso dos badges: ao transformar uma rota de menu
 * em tab de módulo, o badge sobe sozinho para a entrada do módulo em vez de
 * sumir apontando para um id que não existe mais. Consultar `ADMIN_MODULOS`
 * é o que faz isso valer também para módulo montado em route group, cujas
 * etapas não compartilham prefixo com a raiz (`/admin/afiliacoes` é etapa de
 * `/admin/torcida`).
 *
 * As duas fontes competem pelo prefixo mais longo, nunca por precedência fixa:
 * `/admin/bar/pdv` tem entrada própria no menu e precisa vencer a tab
 * `/admin/bar` do módulo, senão o badge de divergência de turno migra para o
 * módulo errado.
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
    const casa = item.exact
      ? base === item.href
      : base === item.href || base.startsWith(`${item.href}/`)
    if (casa && item.href.length > maisEspecifico) {
      maisEspecifico = item.href.length
      menuId = item.id
    }
  }

  for (const modulo of ADMIN_MODULOS) {
    for (const tab of modulo.tabs) {
      for (const alvo of [tab.href, ...(tab.matchPaths ?? [])]) {
        const casa = base === alvo || base.startsWith(`${alvo}/`)
        if (casa && alvo.length > maisEspecifico) {
          maisEspecifico = alvo.length
          menuId = modulo.menuId
        }
      }
    }
  }

  return menuId
}

/**
 * Filtra a árvore de menu pelas permissões efetivas do usuário no tenant atual.
 * Usar sempre no servidor — nunca confiar em filtragem feita só no cliente,
 * já que o menu não é controle de acesso, só affordance visual.
 *
 * `permissao` segue `MenuPermissao` (string, OR, AND aninhado, ou `null`).
 *
 * @param {readonly {id: string, label: string, href: string, permissao: MenuPermissao, secao?: string, departamentoSlug?: string}[]} menu
 * @param {string[]} effectivePermissions
 */
export function filterMenuByPermissions(menu, effectivePermissions) {
  return menu.filter((item) => permite(item.permissao, effectivePermissions))
}

/**
 * Como `filterMenuByPermissions`, mas hubs thin com `departamentoSlug` só
 * aparecem para quem gerencia aquele departamento (ou `podeGerirTodos`).
 * Domínios sem slug (Agenda, Financeiro, Loja…) seguem só por permissão.
 *
 * @param {readonly {id: string, label: string, href: string, permissao: MenuPermissao, secao?: string, departamentoSlug?: string}[]} menu
 * @param {string[]} effectivePermissions
 * @param {{ gestorSlugs?: readonly string[], podeGerirTodos?: boolean }} [gestoria]
 */
export function filterMenuByPermissionsAndGestoria(menu, effectivePermissions, gestoria = {}) {
  const gestorSlugs = new Set(gestoria.gestorSlugs ?? [])
  const podeGerirTodos = Boolean(gestoria.podeGerirTodos)

  return filterMenuByPermissions(menu, effectivePermissions).filter((item) => {
    const slug = 'departamentoSlug' in item ? item.departamentoSlug : undefined
    if (!slug) return true
    if (podeGerirTodos) return true
    return gestorSlugs.has(slug)
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
    return permite(item.permissao, effectivePermissions)
  })
}
