import type { ReactNode } from 'react'
import { Drum, Flag, Landmark } from 'lucide-react'
import { PATRIMONIO_ACERVO_PAGE_SIZE } from '@torcida/types'
import type { CategoriaPatrimonioItem } from '@torcida/db'
import {
  listarCandidatosResponsavelPatrimonio,
  listarPatrimonio,
  type EscopoCategoria,
} from '@/lib/patrimonio'
import { acervoItemParaRow } from '@/lib/patrimonio-row'
import { PatrimonioItensLista } from '@/components/patrimonio/patrimonio-itens-lista'

/**
 * Grade visual do acervo no cockpit do portal. Leitura para quem tem
 * `*:view`; CRUD só com `*:manage` — o mesmo recorte do admin, sem o
 * atalho de "é gestor do departamento".
 */
export async function DepartamentoAcervoGrade({
  tenantId,
  basePath,
  page,
  podeGerir,
  categoriaTravada = null,
  emptyTitle,
  emptyDescription,
}: {
  tenantId: string
  basePath: string
  page: number
  podeGerir: boolean
  categoriaTravada?: CategoriaPatrimonioItem | null
  emptyTitle: string
  emptyDescription: string
}) {
  const escopoCategoria: EscopoCategoria =
    categoriaTravada === 'BANDEIRA' ? 'BANDEIRA' : null
  const filtroCategoria =
    categoriaTravada === 'BANDEIRA' || categoriaTravada === 'INSTRUMENTO'
      ? categoriaTravada
      : undefined

  const [lista, candidatos] = await Promise.all([
    listarPatrimonio(tenantId, {
      filtro: { page, categoria: filtroCategoria },
      pageSize: PATRIMONIO_ACERVO_PAGE_SIZE,
      escopoCategoria,
    }),
    podeGerir ? listarCandidatosResponsavelPatrimonio(tenantId) : Promise.resolve([]),
  ])

  let emptyIcon: ReactNode = (
    <Landmark className="mb-3 h-8 w-8 text-stone-600 dark:text-stone-300" />
  )
  if (categoriaTravada === 'BANDEIRA') {
    emptyIcon = <Flag className="mb-3 h-8 w-8 text-[rgb(var(--color-primary-fg))]" />
  } else if (categoriaTravada === 'INSTRUMENTO') {
    emptyIcon = <Drum className="mb-3 h-8 w-8 text-rose-600 dark:text-rose-400" />
  }

  return (
    <section aria-label="Peças do acervo">
      <PatrimonioItensLista
        itens={lista.itens.map(acervoItemParaRow)}
        podeGerir={podeGerir}
        candidatos={candidatos}
        tenantId={tenantId}
        total={lista.total}
        page={lista.page}
        pageSize={lista.pageSize}
        basePath={basePath}
        categoriaTravada={categoriaTravada}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyIcon={emptyIcon}
        gridClassName="grid grid-cols-2 content-start gap-3 sm:grid-cols-3"
      />
    </section>
  )
}

export function DepartamentoAcervoGradeSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
        >
          <div className="aspect-[4/3] animate-pulse bg-[rgb(var(--border))]" />
          <div className="space-y-2 p-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[rgb(var(--border))]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[rgb(var(--border))]" />
          </div>
        </div>
      ))}
    </div>
  )
}
