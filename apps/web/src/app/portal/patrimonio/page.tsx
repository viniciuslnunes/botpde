import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Flag, Landmark } from 'lucide-react'
import { assertAcervoView } from '@/lib/patrimonio-authz'
import {
  listarCandidatosResponsavelPatrimonio,
  listarEmprestimosPatrimonio,
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
import {
  DevolverPatrimonioForm,
  RetirarPatrimonioForm,
} from '@/components/patrimonio/patrimonio-emprestimo-forms'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Patrimônio' }

type Props = { searchParams: Promise<PatrimonioSearchParams> }

export default async function PortalPatrimonioPage({ searchParams }: Props) {
  let acervo: Awaited<ReturnType<typeof assertAcervoView>>
  try {
    acervo = await assertAcervoView()
  } catch {
    redirect('/portal/departamentos')
  }
  const { session, tenant, escopo, escopoCategoria } = acervo

  // Quem entrou por `flags:*` vê e opera só o acervo de bandeiras — o módulo é
  // o mesmo, a página é que se apresenta como o recorte dele.
  const soBandeiras = escopoCategoria !== null
  const podeGerir = soBandeiras ? escopo.podeGerirBandeiras : escopo.podeGerirTudo

  const sp = await searchParams
  const { filtro, values } = parseFiltroPatrimonio(sp)

  const [resumo, lista, candidatos, meusEmprestimos, disponiveisRetirada] = await Promise.all([
    resumirPatrimonio(tenant.id, escopoCategoria),
    listarPatrimonio(tenant.id, { filtro, escopoCategoria }),
    podeGerir ? listarCandidatosResponsavelPatrimonio(tenant.id) : Promise.resolve([]),
    listarEmprestimosPatrimonio(tenant.id, {
      userId: session.user.id!,
      status: 'ABERTO',
      limite: 20,
      escopoCategoria,
    }),
    listarPatrimonio(tenant.id, {
      filtro: { status: 'DISPONIVEL', page: 1 },
      pageSize: 8,
      escopoCategoria,
    }),
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
    <div className="mx-auto max-w-4xl space-y-6">
      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={
                soBandeiras
                  ? 'flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  : 'flex h-10 w-10 items-center justify-center rounded-xl bg-stone-500/15 text-stone-700 dark:text-stone-300'
              }
            >
              {soBandeiras ? <Flag className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
                {soBandeiras ? 'Bandeiras' : 'Patrimônio'}
              </h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                {soBandeiras
                  ? 'Acervo de bandeirões, faixas e mastros da torcida'
                  : 'Inventário de bens da torcida'}
              </p>
            </div>
          </div>
          <Link
            href={soBandeiras ? '/portal/departamentos/bandeiras' : '/portal/departamentos/patrimonio'}
            className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Ver departamento
          </Link>
        </div>
      </MotionReveal>

      <PatrimonioResumoCards resumo={resumo} />

      {(meusEmprestimos.length > 0 || disponiveisRetirada.itens.length > 0) && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Meus empréstimos e retiradas
            </h2>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Retire com foto na saída e devolva com foto de como ficou guardado.
            </p>
          </div>

          {meusEmprestimos.map((e) => (
            <DevolverPatrimonioForm
              key={e.id}
              emprestimoId={e.id}
              itemNome={e.item.nome}
              tenantId={tenant.id}
            />
          ))}

          {disponiveisRetirada.itens
            .filter((i) => !meusEmprestimos.some((e) => e.item.id === i.id))
            .slice(0, 4)
            .map((i) => (
              <RetirarPatrimonioForm
                key={i.id}
                itemId={i.id}
                itemNome={i.nome}
                tenantId={tenant.id}
              />
            ))}
        </section>
      )}

      <PatrimonioFiltros
        basePath="/portal/patrimonio"
        values={values}
        categoriaTravada={escopoCategoria}
      />
      {podeGerir && (
        <PatrimonioItemForm candidatos={candidatos} categoriaTravada={escopoCategoria} />
      )}
      <PatrimonioItensLista
        itens={itens}
        podeGerir={podeGerir}
        candidatos={candidatos}
        total={lista.total}
        page={lista.page}
        pageSize={lista.pageSize}
        basePath="/portal/patrimonio"
        query={query}
        categoriaTravada={escopoCategoria}
      />
    </div>
  )
}
