import { ESCOPO_TENANT, type ListagemSpec } from './spec'

/**
 * Registro das listagens administrativas — fonte única, no mesmo espírito de
 * `ADMIN_MODULOS` para as tabs. Os invariantes de segurança e de contrato são
 * verificados sobre este registro em `__tests__/listagem.test.ts`, então uma
 * listagem nova entra aqui e ganha as travas de graça.
 */

/** Campos LGE / sensíveis: nunca em filtro, busca, ordenação ou faceta. */
const CAMPOS_SENSIVEIS_MEMBRO = [
  'cpf',
  'rg',
  'imagemProva',
  'fotoDocumentoUrl',
  'comprovanteResidenciaUrl',
  'responsavelDocumento',
  'filiacao',
] as const

/** Base de torcedores (`SaasMembro.tipo = TORCEDOR`). A página força o tipo no where. */
export const LISTAGEM_TORCEDORES: ListagemSpec = {
  id: 'admin-torcedores',
  basePath: '/admin/torcedores',
  sortPadrao: 'criadoEm',
  dirPadrao: 'desc',
  porPaginaPadrao: 25,
  buscaPlaceholder: 'Buscar por nome, nº, cidade, telefone ou Discord…',
  buscaEm: [
    { campo: 'nome' },
    { campo: 'cidade' },
    { campo: 'telefone', modo: 'digitos' },
    { campo: 'discordTag' },
    { campo: 'numeroAssociado', modo: 'digitos' },
  ],
  camposProibidos: CAMPOS_SENSIVEIS_MEMBRO,
  colunas: [
    { id: 'nome', label: 'Torcedor', ordenarPor: 'nome', dirPadrao: 'asc' },
    {
      id: 'departamento',
      label: 'Área',
      ordenarPor: 'departamento.nome',
      dirPadrao: 'asc',
      filtro: {
        id: 'departamento',
        label: 'Área',
        tipo: 'enum',
        campo: 'departamentoId',
        multiplo: true,
        faceta: true,
        valorNulo: 'sem',
      },
    },
    {
      id: 'sede',
      label: 'Unidade',
      ordenarPor: 'sede.nome',
      dirPadrao: 'asc',
      filtro: {
        id: 'sede',
        label: 'Unidade',
        tipo: 'enum',
        campo: 'sedeId',
        multiplo: true,
        faceta: true,
        valorNulo: 'nenhuma',
      },
    },
    {
      id: 'cidade',
      label: 'Cidade',
      ordenarPor: 'cidade',
      dirPadrao: 'asc',
      filtro: { id: 'cidade', label: 'Cidade', tipo: 'texto', campo: 'cidade' },
    },
    // Ordenável, mas sem popover: quem filtra situação são as tabs da página.
    { id: 'status', label: 'Status', ordenarPor: 'status', dirPadrao: 'asc' },
    {
      id: 'criadoEm',
      label: 'Cadastro',
      ordenarPor: 'criadoEm',
      dirPadrao: 'desc',
      filtro: { id: 'criadoEm', label: 'Data de cadastro', tipo: 'data', campo: 'criadoEm' },
    },
  ],
  filtrosAvulsos: [
    {
      id: 'status',
      label: 'Situação',
      tipo: 'enum',
      campo: 'status',
      opcoes: [
        { valor: 'PENDENTE', label: 'Pendentes' },
        { valor: 'APROVADO', label: 'Aprovados' },
        { valor: 'REPROVADO', label: 'Reprovados' },
        // Não é `status` no banco (é `desligadoEm`) — a página traduz.
        { valor: 'DESLIGADO', label: 'Desligados' },
      ],
    },
  ],
}

/** @deprecated Alias — use LISTAGEM_TORCEDORES. */
export const LISTAGEM_MEMBROS: ListagemSpec = LISTAGEM_TORCEDORES

export const LISTAGEM_ACESSOS_PESSOAS: ListagemSpec = {
  id: 'admin-acessos-pessoas',
  basePath: '/admin/acessos',
  sortPadrao: 'nome',
  dirPadrao: 'asc',
  porPaginaPadrao: 25,
  buscaPlaceholder: 'Buscar por nome, e-mail ou @usuário…',
  buscaEm: [{ campo: 'nome' }, { campo: 'email' }, { campo: 'nickname' }],
  colunas: [
    { id: 'nome', label: 'Pessoa', ordenarPor: 'nome', dirPadrao: 'asc' },
    { id: 'email', label: 'E-mail', ordenarPor: 'email', dirPadrao: 'asc' },
    {
      id: 'perfis',
      label: 'Perfis',
      filtro: {
        id: 'cargo',
        label: 'Perfil',
        tipo: 'enum',
        // Ids de cargo são escopados por torcida: um id de outra torcida não
        // casa com nada aqui, então devolve zero linhas em vez de vazar dado.
        campo: 'userRoles.some.roleId',
        multiplo: true,
        clausulas: {
          sem: { userRoles: { none: { tenantId: ESCOPO_TENANT } } },
        },
      },
    },
    {
      id: 'areas',
      label: 'Áreas',
      filtro: {
        id: 'area',
        label: 'Área',
        tipo: 'enum',
        campo: 'userDepartamentos.some.departamentoId',
        multiplo: true,
        clausulas: {
          sem: { userDepartamentos: { none: { tenantId: ESCOPO_TENANT } } },
        },
      },
    },
  ],
}

/**
 * Carteirinhas emitidas (`SaasSocio`). A aba `status` da página escolhe o
 * recorte de validade e NÃO entra no contrato — ela também decide se a listagem
 * é esta ou a de aguardando (modelo diferente).
 */
export const LISTAGEM_SOCIOS_EMITIDAS: ListagemSpec = {
  id: 'admin-socios-emitidas',
  basePath: '/admin/socios',
  sortPadrao: 'numero',
  dirPadrao: 'asc',
  porPaginaPadrao: 25,
  buscaPlaceholder: 'Buscar carteirinha por nome ou número…',
  // `numeroSocio` é Int: a página acrescenta o match numérico quando `q` é
  // só dígitos. O nº do recrutamento mora em `SaasMembro`, então a busca livre
  // cobre só o nome da carteirinha aqui.
  buscaEm: [{ campo: 'nome' }],
  colunas: [
    { id: 'numero', label: 'Nº', ordenarPor: 'numeroSocio', dirPadrao: 'asc' },
    { id: 'nome', label: 'Sócio', ordenarPor: 'nome', dirPadrao: 'asc' },
    {
      id: 'email',
      label: 'E-mail',
      ordenarPor: 'user.email',
      dirPadrao: 'asc',
    },
    {
      id: 'validade',
      label: 'Validade',
      ordenarPor: 'validade',
      dirPadrao: 'asc',
    },
  ],
  // Unidade vive em SaasMembro: filtra via relação, sem materializar `userId[]`.
  filtrosAvulsos: [
    {
      id: 'sede',
      label: 'Unidade',
      tipo: 'enum',
      campo: 'user.membros.some.sedeId',
      multiplo: true,
      clausulas: {
        nenhuma: {
          user: {
            membros: {
              some: { tenantId: ESCOPO_TENANT, tipo: 'SOCIO', sedeId: null },
            },
          },
        },
      },
    },
  ],
}

/** Fila de admissão — sócios com status PENDENTE (`SaasMembro`). */
export const LISTAGEM_SOCIOS_SOLICITACOES: ListagemSpec = {
  id: 'admin-socios-solicitacoes',
  basePath: '/admin/socios',
  sortPadrao: 'criadoEm',
  dirPadrao: 'desc',
  porPaginaPadrao: 25,
  buscaPlaceholder: 'Buscar solicitação por nome, cidade ou telefone…',
  buscaEm: [
    { campo: 'nome' },
    { campo: 'cidade' },
    { campo: 'telefone', modo: 'digitos' },
    { campo: 'discordTag' },
  ],
  camposProibidos: CAMPOS_SENSIVEIS_MEMBRO,
  colunas: [
    { id: 'nome', label: 'Solicitante', ordenarPor: 'nome', dirPadrao: 'asc' },
    {
      id: 'sede',
      label: 'Unidade',
      ordenarPor: 'sede.nome',
      dirPadrao: 'asc',
      filtro: {
        id: 'sede',
        label: 'Unidade',
        tipo: 'enum',
        campo: 'sedeId',
        multiplo: true,
        valorNulo: 'nenhuma',
      },
    },
    {
      id: 'cidade',
      label: 'Cidade',
      ordenarPor: 'cidade',
      dirPadrao: 'asc',
    },
    {
      id: 'criadoEm',
      label: 'Solicitado em',
      ordenarPor: 'criadoEm',
      dirPadrao: 'desc',
    },
  ],
}

/** Fila de emissão — sócios aprovados sem carteirinha (`SaasMembro`). */
export const LISTAGEM_SOCIOS_AGUARDANDO: ListagemSpec = {
  id: 'admin-socios-aguardando',
  basePath: '/admin/socios',
  sortPadrao: 'aprovadoEm',
  dirPadrao: 'desc',
  porPaginaPadrao: 25,
  buscaPlaceholder: 'Buscar sócio aguardando por nome, cidade ou telefone…',
  buscaEm: [
    { campo: 'nome' },
    { campo: 'cidade' },
    { campo: 'telefone', modo: 'digitos' },
    { campo: 'discordTag' },
    { campo: 'numeroAssociado', modo: 'digitos' },
  ],
  camposProibidos: CAMPOS_SENSIVEIS_MEMBRO,
  colunas: [
    {
      id: 'numero',
      label: 'Nº',
      ordenarPor: 'numeroAssociado',
      dirPadrao: 'asc',
    },
    { id: 'nome', label: 'Sócio', ordenarPor: 'nome', dirPadrao: 'asc' },
    {
      id: 'sede',
      label: 'Unidade',
      ordenarPor: 'sede.nome',
      dirPadrao: 'asc',
      filtro: {
        id: 'sede',
        label: 'Unidade',
        tipo: 'enum',
        campo: 'sedeId',
        multiplo: true,
        valorNulo: 'nenhuma',
      },
    },
    {
      id: 'cidade',
      label: 'Cidade',
      ordenarPor: 'cidade',
      dirPadrao: 'asc',
    },
    {
      id: 'aprovadoEm',
      label: 'Aprovado em',
      ordenarPor: 'aprovadoEm',
      dirPadrao: 'desc',
    },
  ],
}

export const LISTAGEM_LOJA_PEDIDOS: ListagemSpec = {
  id: 'admin-loja-pedidos',
  basePath: '/admin/loja/pedidos',
  sortPadrao: 'criadoEm',
  dirPadrao: 'desc',
  porPaginaPadrao: 25,
  buscaPlaceholder: 'Buscar por cliente, e-mail ou cupom…',
  buscaEm: [
    { campo: 'user.nome' },
    { campo: 'user.email' },
    { campo: 'cupomCodigo' },
  ],
  colunas: [
    {
      id: 'cliente',
      label: 'Pedido',
      ordenarPor: 'user.nome',
      dirPadrao: 'asc',
    },
    { id: 'itens', label: 'Itens' },
    {
      id: 'total',
      label: 'Total',
      ordenarPor: 'total',
      dirPadrao: 'desc',
      align: 'right',
    },
    {
      id: 'status',
      label: 'Status',
      ordenarPor: 'status',
      dirPadrao: 'asc',
      filtro: {
        id: 'status',
        label: 'Status',
        tipo: 'enum',
        campo: 'status',
        faceta: true,
        opcoes: [
          { valor: 'PENDENTE', label: 'Pendente' },
          { valor: 'CONFIRMADO', label: 'Confirmado' },
          { valor: 'ENTREGUE', label: 'Entregue' },
          { valor: 'CANCELADO', label: 'Cancelado' },
        ],
      },
    },
    {
      id: 'criadoEm',
      label: 'Data',
      ordenarPor: 'criadoEm',
      dirPadrao: 'desc',
      filtro: {
        id: 'criadoEm',
        label: 'Data do pedido',
        tipo: 'data',
        campo: 'criadoEm',
      },
    },
  ],
}

/** Setup da plataforma — tenants reais (sintéticos ficam fora via `extra` na página). */
export const LISTAGEM_SUPER_ADMIN_SETUP: ListagemSpec = {
  id: 'super-admin-setup-tenants',
  basePath: '/super-admin/setup',
  sortPadrao: 'criadoEm',
  dirPadrao: 'desc',
  porPaginaPadrao: 25,
  buscaPlaceholder: 'Buscar por nome ou slug…',
  buscaModo: 'termos',
  buscaEm: [{ campo: 'nome' }, { campo: 'slug' }],
  colunas: [
    { id: 'nome', label: 'Torcida', ordenarPor: 'nome', dirPadrao: 'asc' },
    {
      id: 'plano',
      label: 'Plano',
      ordenarPor: 'plano',
      dirPadrao: 'asc',
      filtro: {
        id: 'plano',
        label: 'Plano',
        tipo: 'enum',
        campo: 'plano',
        multiplo: true,
        faceta: true,
        opcoes: [
          { valor: 'FREE', label: 'Free' },
          { valor: 'BASIC', label: 'Basic' },
          { valor: 'PREMIUM', label: 'Premium' },
        ],
      },
    },
    {
      id: 'situacao',
      label: 'Situação',
      ordenarPor: 'ativo',
      dirPadrao: 'desc',
      filtro: {
        id: 'situacao',
        label: 'Situação',
        tipo: 'enum',
        // URL carrega string; Prisma espera boolean — cláusulas traduzem.
        campo: 'ativo',
        faceta: true,
        clausulas: {
          true: { ativo: true },
          false: { ativo: false },
        },
        opcoes: [
          { valor: 'true', label: 'Ativas' },
          { valor: 'false', label: 'Suspensas' },
        ],
      },
    },
    {
      id: 'criadoEm',
      label: 'Criada em',
      ordenarPor: 'criadoEm',
      dirPadrao: 'desc',
    },
  ],
}

/** Todas as listagens registradas — base dos testes de invariante. */
export const LISTAGENS: readonly ListagemSpec[] = [
  LISTAGEM_TORCEDORES,
  LISTAGEM_SOCIOS_SOLICITACOES,
  LISTAGEM_ACESSOS_PESSOAS,
  LISTAGEM_SOCIOS_EMITIDAS,
  LISTAGEM_SOCIOS_AGUARDANDO,
  LISTAGEM_LOJA_PEDIDOS,
  LISTAGEM_SUPER_ADMIN_SETUP,
]
