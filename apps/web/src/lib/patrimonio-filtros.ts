import { FiltroPatrimonioSchema } from '@torcida/types'
import type { PatrimonioFiltro } from '@/lib/patrimonio'

export type PatrimonioSearchParams = {
  categoria?: string
  status?: string
  q?: string
  page?: string
  incluirBaixados?: string
}

export function parseFiltroPatrimonio(sp: PatrimonioSearchParams): {
  filtro: PatrimonioFiltro
  values: {
    categoria?: string
    status?: string
    q?: string
    incluirBaixados?: boolean
  }
} {
  const parsed = FiltroPatrimonioSchema.safeParse({
    categoria: sp.categoria || undefined,
    status: sp.status || undefined,
    q: sp.q || undefined,
    page: sp.page || 1,
    incluirBaixados: sp.incluirBaixados || undefined,
  })

  if (!parsed.success) {
    return { filtro: { page: 1 }, values: {} }
  }

  const { categoria, status, q, page, incluirBaixados } = parsed.data
  return {
    filtro: { categoria, status, q, page, incluirBaixados },
    values: {
      categoria,
      status,
      q,
      incluirBaixados: incluirBaixados || undefined,
    },
  }
}
