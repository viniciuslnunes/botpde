import { z } from 'zod'

export const CriarProdutoSchema = z.object({
  nome: z.string().min(2).max(100),
  preco: z.number().positive('Preço deve ser positivo'),
  tamanhos: z.array(z.string()).default([]),
  estoque: z.record(z.string(), z.number().int().min(0)).default({}),
  imagensUrl: z.array(z.string().url()).max(4, 'Máximo 4 imagens').default([]),
})

export const UpdateProdutoSchema = CriarProdutoSchema.partial()

export const CriarPedidoSchema = z.object({
  produtoId: z.string().uuid(),
  tamanho: z.string().optional(),
  quantidade: z.number().int().positive(),
})
