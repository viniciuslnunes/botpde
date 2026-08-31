import { z } from 'zod'
import { PERMISSIONS, hasPermission } from './permissions.js'

export const CategoriaPatrimonioSchema = z.enum([
  'INSTRUMENTO',
  'BANDEIRA',
  'UNIFORME',
  'MOBILIARIO',
  'ELETRONICO',
  'ESPACO',
  'OUTROS',
])

export const StatusPatrimonioSchema = z.enum([
  'DISPONIVEL',
  'EM_USO',
  'MANUTENCAO',
  'BAIXADO',
])

export const StatusPatrimonioEmprestimoSchema = z.enum([
  'ABERTO',
  'DEVOLVIDO',
  'COM_DANO',
])

/** Itens por página (portal e admin alinhados). */
export const PATRIMONIO_PAGE_SIZE = 40

/** Grade visual do acervo — cabe mais itens porque o card é a unidade. */
export const PATRIMONIO_ACERVO_PAGE_SIZE = 60

const itemCampos = {
  nome: z.string().trim().min(2, 'Nome muito curto').max(120),
  categoria: CategoriaPatrimonioSchema,
  status: StatusPatrimonioSchema.default('DISPONIVEL'),
  quantidade: z.coerce.number().int().min(1, 'Mínimo 1').max(99_999),
  localizacao: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  valorEstimado: z
    .union([z.literal(''), z.coerce.number().nonnegative('Valor inválido').max(99_999_999.99)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  observacao: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  fotoUrl: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().trim().url('URL da foto inválida').max(2000).optional(),
  ),
  responsavelId: z
    .union([z.literal(''), z.string().uuid('Responsável inválido')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  areaId: z
    .union([z.literal(''), z.string().min(1)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
}

/**
 * Bandeira/faixa/mastro não é lote: cada peça tem foto, vistoria e
 * empréstimo próprios. Na criação, `quantidade` é quantas peças abrir
 * (cada uma grava `quantidade: 1`). Na edição a peça já é única.
 */
export const CATEGORIA_BANDEIRA = 'BANDEIRA'
export const BANDEIRA_PECAS_MAX = 50

export function patrimonioEhPecaUnica(categoria) {
  return categoria === CATEGORIA_BANDEIRA
}

/**
 * Nomes das N peças de um lote. `total === 1` devolve o nome original,
 * sem sufixo. Sufixo já existente (` · 3`) é descartado para não virar
 * `Bandeira · 3 · 1`.
 *
 * @param {string} nome
 * @param {number} total
 * @returns {string[]}
 */
export function nomesPecasPatrimonio(nome, total) {
  const n = Math.max(1, Math.floor(Number(total) || 1))
  const base = String(nome ?? '')
    .replace(/\s·\s\d+$/, '')
    .trim()
  const rotulo = base || String(nome ?? '').trim() || 'Peça'
  if (n === 1) return [rotulo]
  return Array.from({ length: n }, (_, i) => `${rotulo} · ${i + 1}`)
}

function bandeiraQuantidadeNoCadastro(data, ctx) {
  if (!patrimonioEhPecaUnica(data.categoria)) return
  if (data.quantidade > BANDEIRA_PECAS_MAX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quantidade'],
      message: `No máximo ${BANDEIRA_PECAS_MAX} peças por cadastro.`,
    })
  }
}

function bandeiraPecaUnicaNaEdicao(data, ctx) {
  if (!patrimonioEhPecaUnica(data.categoria)) return
  if (data.quantidade !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quantidade'],
      message: 'Bandeira é peça única — cada uma tem a própria foto.',
    })
  }
}

export const CriarPatrimonioItemSchema = z.object(itemCampos).superRefine(bandeiraQuantidadeNoCadastro)

export const AtualizarPatrimonioItemSchema = z
  .object({
    id: z.string().uuid('Item inválido'),
    ...itemCampos,
  })
  .superRefine(bandeiraPecaUnicaNaEdicao)

export const AbrirEmprestimoPatrimonioSchema = z.object({
  itemId: z.string().uuid('Item inválido'),
  fotoSaidaUrl: z.string().url('Foto da retirada obrigatória').max(2000),
  observacao: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})

export const DevolverEmprestimoPatrimonioSchema = z.object({
  emprestimoId: z.string().uuid('Empréstimo inválido'),
  fotoGuardaUrl: z.string().url('Foto de como ficou guardado é obrigatória').max(2000),
  observacao: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})

export const MarcarDanoEmprestimoSchema = z.object({
  emprestimoId: z.string().uuid('Empréstimo inválido'),
  danoObservacao: z.string().trim().min(3, 'Descreva o dano').max(500),
})

export const FiltroPatrimonioSchema = z.object({
  categoria: CategoriaPatrimonioSchema.optional(),
  status: StatusPatrimonioSchema.optional(),
  areaId: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  q: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  page: z.coerce.number().int().min(1).max(200).optional().default(1),
  /** Por padrão a listagem omite BAIXADO; `true` inclui tudo. */
  incluirBaixados: z
    .union([z.literal('1'), z.literal('true'), z.literal('on'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === '1' || v === 'true' || v === 'on'),
})

/** @type {Record<string, string>} */
export const CATEGORIA_PATRIMONIO_LABEL = {
  INSTRUMENTO: 'Instrumento',
  BANDEIRA: 'Bandeira / bandeirão',
  UNIFORME: 'Uniforme / camisa',
  MOBILIARIO: 'Mobiliário',
  ELETRONICO: 'Eletrônico',
  ESPACO: 'Espaço / estrutura',
  OUTROS: 'Outros',
}

/** @type {Record<string, string>} */
export const STATUS_PATRIMONIO_LABEL = {
  DISPONIVEL: 'Disponível',
  EM_USO: 'Em uso',
  MANUTENCAO: 'Manutenção',
  BAIXADO: 'Baixado',
}

/** @type {Record<string, string>} */
export const STATUS_EMPRESTIMO_PATRIMONIO_LABEL = {
  ABERTO: 'Em aberto',
  DEVOLVIDO: 'Devolvido',
  COM_DANO: 'Com dano',
}

/**
 * Instrumentos e bandeirões sempre exigem evidência fotográfica.
 * @param {string} categoria
 */
export function categoriaExigeEvidencia(categoria) {
  return categoria === 'INSTRUMENTO' || categoria === 'BANDEIRA'
}

/* ------------------------------------------------------------------ *
 * Bandeiras — recorte do acervo (departamento próprio, mesmo modelo)
 * ------------------------------------------------------------------ */

/**
 * Escopo de acesso ao inventário, resolvido de uma vez para a página/action.
 *
 * Regra central do módulo: `patrimony:*` é o inventário inteiro (mesa, cadeira,
 * projetor, instrumento, bandeirão); `flags:*` é **só** categoria `BANDEIRA`.
 * Quem tem `patrimony:manage` gere bandeira também — o contrário não vale.
 *
 * `categoriaTravada` não é filtro de UI: quando vem `'BANDEIRA'`, a query do
 * servidor precisa aplicá-la, senão `flags:view` viraria `patrimony:view`.
 *
 * @typedef {{
 *   podeVer: boolean,
 *   podeVerTudo: boolean,
 *   podeGerir: boolean,
 *   podeGerirTudo: boolean,
 *   podeGerirBandeiras: boolean,
 *   categoriaTravada: 'BANDEIRA' | null,
 * }} EscopoPatrimonio
 *
 * @param {readonly string[]} permissoes
 * @param {{ isSuperAdmin?: boolean }} [opts] plataforma opera fora do RBAC do
 *   tenant — mesmo bypass que `/portal/patrimonio` e `/admin/patrimonio` já
 *   aplicavam antes das bandeiras existirem.
 * @returns {EscopoPatrimonio}
 */
export function resolverEscopoPatrimonio(permissoes, opts = {}) {
  const isSuperAdmin = opts.isSuperAdmin === true
  const podeVerTudo =
    isSuperAdmin ||
    hasPermission(permissoes, PERMISSIONS.PATRIMONY_VIEW) ||
    hasPermission(permissoes, PERMISSIONS.PATRIMONY_MANAGE)
  const podeGerirTudo = isSuperAdmin || hasPermission(permissoes, PERMISSIONS.PATRIMONY_MANAGE)
  const podeGerirBandeiras =
    podeGerirTudo || hasPermission(permissoes, PERMISSIONS.FLAGS_MANAGE)
  const podeVerBandeiras =
    podeVerTudo ||
    podeGerirBandeiras ||
    hasPermission(permissoes, PERMISSIONS.FLAGS_VIEW)

  return {
    podeVer: podeVerTudo || podeVerBandeiras,
    podeVerTudo,
    podeGerir: podeGerirTudo || podeGerirBandeiras,
    podeGerirTudo,
    podeGerirBandeiras,
    categoriaTravada: podeVerTudo ? null : podeVerBandeiras ? CATEGORIA_BANDEIRA : null,
  }
}

/**
 * Pode escrever neste item? `patrimony:manage` em qualquer categoria;
 * `flags:manage` só em `BANDEIRA`.
 *
 * @param {readonly string[]} permissoes
 * @param {string} categoria
 * @param {{ isSuperAdmin?: boolean }} [opts]
 * @returns {boolean}
 */
export function podeGerirCategoriaPatrimonio(permissoes, categoria, opts = {}) {
  const escopo = resolverEscopoPatrimonio(permissoes, opts)
  if (escopo.podeGerirTudo) return true
  return escopo.podeGerirBandeiras && categoria === CATEGORIA_BANDEIRA
}

/**
 * Pode ler este item?
 *
 * @param {readonly string[]} permissoes
 * @param {string} categoria
 * @param {{ isSuperAdmin?: boolean }} [opts]
 * @returns {boolean}
 */
export function podeVerCategoriaPatrimonio(permissoes, categoria, opts = {}) {
  const escopo = resolverEscopoPatrimonio(permissoes, opts)
  if (!escopo.podeVer) return false
  if (escopo.categoriaTravada) return categoria === escopo.categoriaTravada
  return true
}

/**
 * Ficha de vistoria/liberação: o que clube e polícia pedem para o bandeirão
 * entrar no estádio. Vive em `PatrimonioItem.meta.vistoria` — sem tabela nova
 * e sem virar ERP de compliance.
 */
export const VistoriaBandeiraSchema = z.object({
  larguraM: z.coerce.number().positive('Largura inválida').max(200),
  alturaM: z.coerce.number().positive('Altura inválida').max(200),
  /**
   * Bandeira de mastro costuma ter regra própria de entrada.
   * Checkbox de FormData: ausente = false; `z.coerce.boolean` transformaria a
   * string "false" em `true`.
   */
  comMastro: z
    .union([z.literal('1'), z.literal('true'), z.literal('on'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === '1' || v === 'true' || v === 'on'),
  orgao: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  protocolo: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  /** ISO `yyyy-mm-dd`; ausente = liberação sem prazo declarado. */
  validade: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  observacao: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})

export const RegistrarVistoriaBandeiraSchema = z.object({
  itemId: z.string().uuid('Item inválido'),
  ...VistoriaBandeiraSchema.shape,
})

/**
 * Lê a vistoria gravada em `meta` sem confiar no formato (dado antigo, JSON
 * escrito por script). Retorna `null` em vez de estourar.
 *
 * @param {unknown} meta
 * @returns {{ larguraM: number, alturaM: number, comMastro: boolean, orgao?: string, protocolo?: string, validade?: string, observacao?: string } | null}
 */
export function lerVistoriaBandeira(meta) {
  if (!meta || typeof meta !== 'object') return null
  const bruto = /** @type {Record<string, unknown>} */ (meta).vistoria
  if (!bruto || typeof bruto !== 'object') return null
  const parsed = VistoriaBandeiraSchema.safeParse(bruto)
  return parsed.success ? parsed.data : null
}

/**
 * Grava a vistoria preservando o resto de `meta`.
 *
 * @param {unknown} meta
 * @param {unknown} vistoria
 * @returns {Record<string, unknown>}
 */
export function gravarVistoriaBandeira(meta, vistoria) {
  const base = meta && typeof meta === 'object' ? { .../** @type {object} */ (meta) } : {}
  return { ...base, vistoria }
}

/**
 * Vistoria vencida (ou vencendo dentro de `diasAviso`). Sem `validade`
 * declarada não há prazo a cobrar — devolve `false`, não `true`: liberação sem
 * prazo é o caso comum, e alarmar nele treinaria o gestor a ignorar o aviso.
 *
 * @param {{ validade?: string } | null} vistoria
 * @param {{ ref?: Date, diasAviso?: number }} [opts]
 * @returns {boolean}
 */
export function vistoriaVencendo(vistoria, opts = {}) {
  if (!vistoria?.validade) return false
  const ref = opts.ref ?? new Date()
  const dias = opts.diasAviso ?? 0
  const limite = new Date(ref.getTime() + dias * 24 * 60 * 60 * 1000)
  const validade = new Date(`${vistoria.validade}T23:59:59`)
  if (Number.isNaN(validade.getTime())) return false
  return validade.getTime() <= limite.getTime()
}
