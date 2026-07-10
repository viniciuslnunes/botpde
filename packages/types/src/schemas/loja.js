import { z } from 'zod'

export const TAMANHO_UNICO = 'UN'

export const CriarProdutoSchema = z.object({
  nome: z.string().min(2).max(100),
  slug: z.string().min(2).max(120).optional(),
  descricao: z.string().max(2000).optional(),
  preco: z.number().positive('Preço deve ser positivo'),
  precoOriginal: z.number().positive().optional(),
  marca: z.string().max(80).optional(),
  categoriaId: z.string().uuid().optional(),
  destaque: z.boolean().default(false),
  ordem: z.number().int().min(0).default(0),
  tamanhos: z.array(z.string().min(1).max(10)).default([]),
  estoque: z.record(z.string(), z.number().int().min(0)).default({}),
  imagensUrl: z.array(z.string().url()).max(4, 'Máximo 4 imagens').default([]),
})

export const UpdateProdutoSchema = CriarProdutoSchema.partial()

export const CategoriaSchema = z.object({
  nome: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).optional(),
  ordem: z.coerce.number().int().min(0).default(0),
  parentId: z.string().uuid().optional().nullable(),
})

export const CupomSchema = z.object({
  codigo: z.string().min(2).max(30).transform((s) => s.toUpperCase().trim()),
  tipo: z.enum(['PERCENTUAL', 'FIXO']),
  valor: z.coerce.number().positive(),
  primeiraCompra: z.coerce.boolean().default(false),
  ativo: z.coerce.boolean().default(true),
  validoAte: z.coerce.date().optional().nullable(),
})

export const CarrinhoItemSchema = z.object({
  produtoId: z.string().uuid(),
  tamanho: z.string().min(1).max(10).default(TAMANHO_UNICO),
  quantidade: z.coerce.number().int().min(1).max(10),
})

export const EnderecoEntregaSchema = z.object({
  cep: z.string().min(8).max(9),
  rua: z.string().min(2).max(200),
  numero: z.string().min(1).max(20),
  complemento: z.string().max(100).optional(),
  cidade: z.string().min(2).max(100).optional(),
  estado: z.string().length(2).optional(),
})

export const CheckoutSchema = z.object({
  cupomCodigo: z.string().max(30).optional(),
  modalidadeEntrega: z.enum(['RETIRADA', 'ENVIO']),
  enderecoEntrega: EnderecoEntregaSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.modalidadeEntrega === 'ENVIO' && !data.enderecoEntrega) {
    ctx.addIssue({ code: 'custom', message: 'Informe o endereço para envio.', path: ['enderecoEntrega'] })
  }
})

export const CriarPedidoSchema = z.object({
  produtoId: z.string().uuid(),
  tamanho: z.string().optional(),
  quantidade: z.number().int().positive(),
})
