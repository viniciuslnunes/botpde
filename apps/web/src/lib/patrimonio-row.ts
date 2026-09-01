import type { PatrimonioRow } from '@/components/patrimonio/patrimonio-item-card'
import { fichaVistoriaDoItem } from '@/lib/patrimonio-vistoria-ficha'

type ValorEstimado = number | { toString(): string } | null

/** Item de inventário (Prisma lite ou direção de bandeiras) → card do acervo. */
export type AcervoItemInput = {
  id: string
  nome: string
  categoria: string
  status: string
  quantidade: number
  localizacao: string | null
  valorEstimado: ValorEstimado
  observacao: string | null
  fotoUrl: string | null
  fotoPreviewUrl?: string | null
  responsavelId?: string | null
  responsavelNome?: string | null
  responsavel?: { id: string; nome: string | null } | null
  meta?: unknown
  temVistoria?: boolean
  vistoriaVencendo?: boolean
  vistoria?: PatrimonioRow['vistoria']
}

function numeroValor(valor: ValorEstimado): number | null {
  if (valor == null) return null
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : null
}

export function acervoItemParaRow(i: AcervoItemInput): PatrimonioRow {
  const ficha =
    i.temVistoria != null
      ? {
          temVistoria: i.temVistoria,
          vistoriaVencendo: i.vistoriaVencendo ?? false,
          vistoria: i.vistoria ?? null,
        }
      : fichaVistoriaDoItem(i.meta)
  return {
    id: i.id,
    nome: i.nome,
    categoria: i.categoria,
    status: i.status,
    quantidade: i.quantidade,
    localizacao: i.localizacao,
    valorEstimado: numeroValor(i.valorEstimado),
    observacao: i.observacao,
    fotoUrl: i.fotoUrl,
    fotoPreviewUrl: i.fotoPreviewUrl ?? null,
    responsavelId: i.responsavelId ?? i.responsavel?.id ?? null,
    responsavelNome: i.responsavelNome ?? i.responsavel?.nome ?? null,
    ...ficha,
  }
}
