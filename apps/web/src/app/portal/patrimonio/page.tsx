import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftRight, Flag, Landmark } from 'lucide-react'
import { PATRIMONIO_ACERVO_PAGE_SIZE } from '@torcida/types'
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
import { parseAcervoTab } from '@/lib/acervo-tab'
import {
  PatrimonioItensLista,
  type PatrimonioRow,
} from '@/components/patrimonio/patrimonio-itens-lista'
import { PatrimonioResumoCards } from '@/components/patrimonio/patrimonio-resumo-cards'
import { PatrimonioFiltros } from '@/components/patrimonio/patrimonio-filtros'
import { fichaVistoriaDoItem } from '@/lib/patrimonio-vistoria-ficha'
import {
  DevolverPatrimonioForm,
  RetirarPatrimonioForm,
} from '@/components/patrimonio/patrimonio-emprestimo-forms'
import { AdminTabs, adminTabIds, type AdminTabItem } from '@/components/admin/ui'
import { PortalModuloHeader } from '@/components/portal/portal-modulo-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Patrimônio' }

const PATRIMONIO_PORTAL_TABS = ['acervo', 'emprestimos'] as const
const ICONE_TAB = 'h-4 w-4 shrink-0'

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
  const tab = parseAcervoTab(sp.tab, PATRIMONIO_PORTAL_TABS, 'acervo')
  const { filtro, values } = parseFiltroPatrimonio(sp)

  const [resumo, lista, candidatos, meusEmprestimos, disponiveisRetirada] = await Promise.all([
    resumirPatrimonio(tenant.id, escopoCategoria),
    listarPatrimonio(tenant.id, { filtro, escopoCategoria, pageSize: PATRIMONIO_ACERVO_PAGE_SIZE }),
    podeGerir ? listarCandidatosResponsavelPatrimonio(tenant.id) : Promise.resolve([]),
    listarEmprestimosPatrimonio(tenant.id, {
      userId: session.user.id!,
      status: 'ABERTO',
      limite: 20,
      escopoCategoria,
    }),
    listarPatrimonio(tenant.id, {
      filtro: { status: 'DISPONIVEL', page: 1 },
      pageSize: 24,
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
    fotoUrl: i.fotoUrl,
    fotoPreviewUrl: i.fotoPreviewUrl,
    responsavelId: i.responsavel?.id ?? null,
    responsavelNome: i.responsavel?.nome ?? null,
    ...fichaVistoriaDoItem(i.meta),
  }))

  const retiradasDisponiveis = disponiveisRetirada.itens.filter(
    (i) => !meusEmprestimos.some((e) => e.item.id === i.id),
  )

  const query: Record<string, string | undefined> = {
    categoria: values.categoria,
    status: values.status,
    q: values.q,
    incluirBaixados: values.incluirBaixados ? '1' : undefined,
    tab: 'acervo',
  }

  const extraParams: Record<string, string | undefined> = {
    categoria: values.categoria,
    status: values.status,
    q: values.q,
    incluirBaixados: values.incluirBaixados ? '1' : undefined,
  }

  const iconeAcervo = soBandeiras ? (
    <Flag className={ICONE_TAB} />
  ) : (
    <Landmark className={ICONE_TAB} />
  )

  const tabs: AdminTabItem[] = [
    {
      id: 'acervo',
      label: 'Acervo',
      icon: iconeAcervo,
      count: lista.total,
    },
    {
      id: 'emprestimos',
      label: 'Empréstimos',
      icon: <ArrowLeftRight className={ICONE_TAB} />,
      count: meusEmprestimos.length,
      countClass:
        meusEmprestimos.length > 0
          ? 'bg-amber-500/16 text-amber-700 dark:text-amber-400'
          : undefined,
    },
  ]

  const { tabId, panelId } = adminTabIds('tab', tab)

  const titulo = soBandeiras ? 'Bandeiras' : 'Patrimônio'
  const descricao = soBandeiras
    ? 'Acervo de bandeirões, faixas e mastros da torcida.'
    : 'Inventário de bens da torcida — consulte o acervo e opere empréstimos com foto.'

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PortalModuloHeader
        kicker={soBandeiras ? '[ Bandeiras ]' : '[ Patrimônio ]'}
        title={titulo}
        description={descricao}
        size="page"
        actions={
          <Link
            href={
              soBandeiras ? '/portal/departamentos/bandeiras' : '/portal/departamentos/patrimonio'
            }
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-4 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Ver departamento
          </Link>
        }
      />

      <div className="sticky top-0 z-10 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.92)] p-3 backdrop-blur-md">
        <AdminTabs
          tabs={tabs}
          basePath="/portal/patrimonio"
          activeId={tab}
          paramKey="tab"
          extraParams={extraParams}
        />
        {tab === 'acervo' ? (
          <PatrimonioFiltros
            basePath="/portal/patrimonio"
            values={values}
            categoriaTravada={escopoCategoria}
            tab="acervo"
            variant="portal"
          />
        ) : null}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
        {tab === 'acervo' ? (
          <>
            <PatrimonioResumoCards resumo={resumo} />
            <p className="text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
              {soBandeiras
                ? 'Liberação de entrada e escala de jogo ficam no departamento de Bandeiras.'
                : 'Retire itens com foto na aba Empréstimos — a foto diferencia peças parecidas no inventário.'}
            </p>
            <PatrimonioItensLista
              itens={itens}
              podeGerir={podeGerir}
              candidatos={candidatos}
              tenantId={tenant.id}
              total={lista.total}
              page={lista.page}
              pageSize={lista.pageSize}
              basePath="/portal/patrimonio"
              query={query}
              categoriaTravada={escopoCategoria}
            />
          </>
        ) : null}

        {tab === 'emprestimos' ? (
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
                Meus empréstimos e retiradas
              </h2>
              <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                Retire com foto na saída e devolva com foto de como ficou guardado.
              </p>
            </div>

            {meusEmprestimos.length === 0 && retiradasDisponiveis.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
                Nenhum empréstimo aberto. Na aba Acervo, escolha um item disponível para retirar.
              </p>
            ) : null}

            {meusEmprestimos.map((e) => (
              <DevolverPatrimonioForm
                key={e.id}
                emprestimoId={e.id}
                itemNome={e.item.nome}
                tenantId={tenant.id}
              />
            ))}

            {retiradasDisponiveis.map((i) => (
              <RetirarPatrimonioForm
                key={i.id}
                itemId={i.id}
                itemNome={i.nome}
                tenantId={tenant.id}
              />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  )
}
