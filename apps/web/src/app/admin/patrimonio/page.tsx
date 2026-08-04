import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import { PERMISSIONS } from '@torcida/types'
import { assertManageOrOversightView } from '@/lib/authz'
import {
  listarCandidatosResponsavelPatrimonio,
  listarEmprestimosPatrimonio,
  listarPatrimonio,
  resumirPatrimonio,
} from '@/lib/patrimonio'
import { carregarDirecaoPatrimonio } from '@/lib/patrimonio-direcao'
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
import { MarcarDanoEmprestimoForm } from '@/components/patrimonio/marcar-dano-emprestimo-form'
import { AdminInboxList } from '@/components/admin/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Patrimônio — Admin' }

type Props = { searchParams: Promise<PatrimonioSearchParams> }

export default async function PatrimonioAdminPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertManageOrOversightView>>['tenant']
  let podeGerir = false
  try {
    ;({ tenant, podeGerir } = await assertManageOrOversightView(
      PERMISSIONS.PATRIMONY_MANAGE,
      PERMISSIONS.PATRIMONY_VIEW,
    ))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const { filtro, values } = parseFiltroPatrimonio(sp)

  const [resumo, lista, candidatos, emprestimosAbertos, ops] = await Promise.all([
    resumirPatrimonio(tenant.id),
    listarPatrimonio(tenant.id, { filtro }),
    listarCandidatosResponsavelPatrimonio(tenant.id),
    listarEmprestimosPatrimonio(tenant.id, { status: 'ABERTO', limite: 24 }),
    carregarDirecaoPatrimonio(tenant.id),
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
                {podeGerir
                  ? 'Inventário e custódia — audite retiradas com foto e registre dano.'
                  : 'Somente leitura — inventário da unidade.'}
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

      {ops.pendencias.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Precisa de você
            </h2>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Empréstimos longos e itens em manutenção.
            </p>
          </div>
          <AdminInboxList itens={ops.pendencias} podeAgir={false} />
        </section>
      ) : null}

      {emprestimosAbertos.length > 0 ? (
        <section id="em-uso" className="scroll-mt-20 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Em uso agora
            </h2>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Trilha de custódia — confira fotos de saída; marque dano se preciso.
            </p>
          </div>
          <ul className="space-y-2">
            {emprestimosAbertos.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                      {e.item.nome}
                    </p>
                    <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                      Com {e.user.nome ?? 'membro'} · desde{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(e.abertoEm)}
                    </p>
                  </div>
                  <a
                    href={e.fotoSaidaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                  >
                    Ver foto saída
                  </a>
                </div>
                {podeGerir ? <MarcarDanoEmprestimoForm emprestimoId={e.id} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PatrimonioFiltros basePath="/admin/patrimonio" values={values} />
      {podeGerir ? <PatrimonioItemForm candidatos={candidatos} /> : null}
      <PatrimonioItensLista
        itens={itens}
        podeGerir={podeGerir}
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
