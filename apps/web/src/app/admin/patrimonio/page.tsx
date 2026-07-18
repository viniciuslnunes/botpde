import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import {
  listarCandidatosResponsavelPatrimonio,
  listarPatrimonio,
  resumirPatrimonio,
} from '@/lib/patrimonio'
import {
  parseFiltroPatrimonio,
  type PatrimonioSearchParams,
} from '@/lib/patrimonio-filtros'
import { PatrimonioItemForm } from '@/components/patrimonio/patrimonio-item-form'
import {
  PatrimonioItensLista,
  type PatrimonioRow,
} from '@/components/patrimonio/patrimonio-itens-lista'
import { PatrimonioResumoCards } from '@/components/patrimonio/patrimonio-resumo-cards'
import { PatrimonioFiltros } from '@/components/patrimonio/patrimonio-filtros'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Patrimônio — Admin' }

type Props = { searchParams: Promise<PatrimonioSearchParams> }

export default async function PatrimonioAdminPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.PATRIMONY_MANAGE))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const { filtro, values } = parseFiltroPatrimonio(sp)

  const [resumo, lista, candidatos] = await Promise.all([
    resumirPatrimonio(tenant.id),
    listarPatrimonio(tenant.id, { filtro }),
    listarCandidatosResponsavelPatrimonio(tenant.id),
  ])

  const itens: PatrimonioRow[] = lista.itens.map((i) => ({
    id: i.id,
    nome: i.nome,
    categoria: i.categoria,
    status: i.status,
    quantidade: i.quantidade,
    localizacao: i.localizacao,
    valorEstimado: i.valorEstimado != null ? Number(i.valorEstimado) : null,
    observacao: i.observacao,
    responsavelId: i.responsavel?.id ?? null,
    responsavelNome: i.responsavel?.nome ?? null,
  }))

  const query: Record<string, string | undefined> = {
    categoria: values.categoria,
    status: values.status,
    q: values.q,
    incluirBaixados: values.incluirBaixados ? '1' : undefined,
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-500/15 text-stone-700 dark:text-stone-300">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[rgb(var(--foreground))]">Patrimônio</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Operação do inventário — cadastro, baixa e responsáveis.
              </p>
            </div>
          </div>
          <Link
            href="/portal/patrimonio"
            className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Ver no portal
          </Link>
        </div>
      </MotionReveal>

      <PatrimonioResumoCards resumo={resumo} />
      <PatrimonioFiltros basePath="/admin/patrimonio" values={values} />
      <PatrimonioItemForm candidatos={candidatos} />
      <PatrimonioItensLista
        itens={itens}
        podeGerir
        candidatos={candidatos}
        total={lista.total}
        page={lista.page}
        pageSize={lista.pageSize}
        basePath="/admin/patrimonio"
        query={query}
      />
    </div>
  )
}
