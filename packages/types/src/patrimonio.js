import { z } from 'zod'

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
  responsavelId: z
    .union([z.literal(''), z.string().uuid('Responsável inválido')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  areaId: z
    .union([z.literal(''), z.string().min(1)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
}

export const CriarPatrimonioItemSchema = z.object(itemCampos)

export const AtualizarPatrimonioItemSchema = z.object({
  id: z.string().uuid('Item inválido'),
  ...itemCampos,
})

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
