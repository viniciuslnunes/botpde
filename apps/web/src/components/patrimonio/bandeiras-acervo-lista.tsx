'use client'

import { Flag } from 'lucide-react'
import {
  PatrimonioItensLista,
  type PatrimonioRow,
} from '@/components/patrimonio/patrimonio-itens-lista'
import type { ResponsavelOption } from '@/components/patrimonio/patrimonio-item-form'

export type BandeiraRow = PatrimonioRow

export function BandeirasAcervoLista({
  itens,
  podeGerir,
  candidatos,
  tenantId,
}: {
  itens: BandeiraRow[]
  podeGerir: boolean
  candidatos: ResponsavelOption[]
  tenantId: string
}) {
  return (
    <PatrimonioItensLista
      itens={itens}
      podeGerir={podeGerir}
      candidatos={candidatos}
      tenantId={tenantId}
      total={itens.length}
      page={1}
      pageSize={Math.max(itens.length, 1)}
      basePath="/admin/bandeiras"
      query={{ tab: 'acervo' }}
      categoriaTravada="BANDEIRA"
      emptyTitle="Nenhuma bandeira cadastrada"
      emptyDescription="Cadastre bandeirões, faixas e mastros com foto — é o que diferencia peças parecidas."
      emptyIcon={<Flag className="mb-3 h-8 w-8 text-[rgb(var(--color-primary-fg))]" />}
    />
  )
}
