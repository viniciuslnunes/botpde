import { FiltroFinanceiroSchema } from '@torcida/types'
import type { FinanceiroFiltro } from '@/lib/financeiro'

export type FinanceiroSearchParams = {
  tipo?: string
  categoria?: string
  q?: string
  dataDe?: string
  dataAte?: string
  page?: string
}

export function parseFiltroFinanceiro(sp: FinanceiroSearchParams): {
  filtro: FinanceiroFiltro
  values: {
    tipo?: string
    categoria?: string
    q?: string
    dataDe?: string
    dataAte?: string
  }
} {
  const parsed = FiltroFinanceiroSchema.safeParse({
    tipo: sp.tipo || undefined,
    categoria: sp.categoria || undefined,
    q: sp.q || undefined,
    dataDe: sp.dataDe || undefined,
    dataAte: sp.dataAte || undefined,
    page: sp.page || 1,
  })

  if (!parsed.success) {
    return { filtro: { page: 1 }, values: {} }
  }

  const { tipo, categoria, q, dataDe, dataAte, page } = parsed.data
  return {
    filtro: { tipo, categoria, q, dataDe, dataAte, page },
    values: {
      tipo,
      categoria,
      q,
      dataDe,
      dataAte,
    },
  }
}
