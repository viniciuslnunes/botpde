import { redirect } from 'next/navigation'
import { ExternalLink, Landmark, ShieldAlert, Timer, History } from 'lucide-react'
import { PERMISSIONS, PATRIMONIO_ACERVO_PAGE_SIZE } from '@torcida/types'
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
import { parseAcervoTab } from '@/lib/acervo-tab'
import { listarAuditoriaInventario } from '@/lib/patrimonio-auditoria'
import { PatrimonioItensLista, type PatrimonioRow } from '@/components/patrimonio/patrimonio-itens-lista'
import { fichaVistoriaDoItem } from '@/lib/patrimonio-vistoria-ficha'
import { montarQrItemPatrimonio } from '@/lib/patrimonio-qr'
import { FolhaEtiquetas } from '@/components/ui/folha-etiquetas'
import { PatrimonioAuditoriaTimeline } from '@/components/patrimonio/patrimonio-auditoria-timeline'
import { PatrimonioResumoCards } from '@/components/patrimonio/patrimonio-resumo-cards'
import { PatrimonioFiltros } from '@/components/patrimonio/patrimonio-filtros'
import { MarcarDanoEmprestimoForm } from '@/components/patrimonio/marcar-dano-emprestimo-form'
import { AdminInboxList, AdminPageHeader, AdminHeaderActionLink, AdminPendingTabs, adminTabIds, type AdminTabItem } from '@/components/admin/ui'
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

  const [resumo, lista, candidatos, emprestimosAbertos, ops, auditoria] = await Promise.all([
    resumirPatrimonio(tenant.id),
    listarPatrimonio(tenant.id, { filtro, pageSize: PATRIMONIO_ACERVO_PAGE_SIZE }),
    listarCandidatosResponsavelPatrimonio(tenant.id),
    listarEmprestimosPatrimonio(tenant.id, { status: 'ABERTO', limite: 24 }),
    carregarDirecaoPatrimonio(tenant.id),
    listarAuditoriaInventario(tenant.id),
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
    qrEtiqueta: montarQrItemPatrimonio(i.id),
    ...fichaVistoriaDoItem(i.meta),
  }))

  const query: Record<string, string | undefined> = {
    categoria: values.categoria,
    status: values.status,
    q: values.q,
    incluirBaixados: values.incluirBaixados ? '1' : undefined,
    tab: 'acervo',
  }

  const PATRIMONIO_TABS = ['acervo', 'em-uso', 'pendencias', 'historico'] as const
  const tab = parseAcervoTab(sp.tab, PATRIMONIO_TABS, 'acervo')
  const { tabId, panelId } = adminTabIds('tab', tab)
  const iconeTab = 'h-4 w-4 shrink-0'
  const tabs: AdminTabItem[] = [
    {
      id: 'acervo',
      label: 'Acervo',
      icon: <Landmark className={iconeTab} />,
      count: lista.total,
    },
    {
      id: 'em-uso',
      label: 'Em uso agora',
      icon: <Timer className={iconeTab} />,
      count: emprestimosAbertos.length,
    },
    {
      id: 'pendencias',
      label: 'Precisa de você',
      icon: <ShieldAlert className={iconeTab} />,
      count: ops.pendencias.length,
      countClass:
        ops.pendencias.length > 0
          ? 'bg-amber-500/16 text-amber-700 dark:text-amber-400'
          : undefined,
    },
    {
      id: 'historico',
      label: 'Histórico',
      icon: <History className={iconeTab} />,
      count: auditoria.length,
    },
  ]

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Patrimônio"
        description={
          podeGerir
            ? 'Inventário e custódia — audite retiradas com foto e registre dano.'
            : 'Somente leitura — inventário da unidade.'
        }
        icon={<Landmark className="h-5 w-5" />}
        actions={
          <AdminHeaderActionLink href="/portal/patrimonio" icon={ExternalLink}>
            Ver no portal
          </AdminHeaderActionLink>
        }
      >
        <AdminPendingTabs
          tabs={tabs}
          basePath="/admin/patrimonio"
          activeId={tab}
          paramKey="tab"
          extraParams={{
            categoria: values.categoria,
            status: values.status,
            q: values.q,
            incluirBaixados: values.incluirBaixados ? '1' : undefined,
          }}
        />
        {tab === 'acervo' ? (
          <PatrimonioFiltros
            basePath="/admin/patrimonio"
            values={values}
            tab="acervo"
            variant="toolbar"
          />
        ) : null}
      </AdminPageHeader>

      <div className="app-container min-w-0 flex-1 space-y-6 py-5 sm:py-8">
      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-4">
        {tab === 'acervo' ? (
          <>
            <PatrimonioResumoCards resumo={resumo} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                A foto diferencia peças parecidas no inventário.
              </p>
              {podeGerir && (
                // Etiquetas da página atual: imprimir o acervo inteiro de uma vez
                // gastaria papel com item que ninguém vai etiquetar hoje.
                <FolhaEtiquetas
                  etiquetas={itens.map((i) => ({
                    id: i.id,
                    titulo: i.nome,
                    subtitulo: i.localizacao ?? null,
                    valor: i.qrEtiqueta ?? '',
                  }))}
                />
              )}
            </div>
            <PatrimonioItensLista
              itens={itens}
              podeGerir={podeGerir}
              candidatos={candidatos}
              tenantId={tenant.id}
              total={lista.total}
              page={lista.page}
              pageSize={lista.pageSize}
              basePath="/admin/patrimonio"
              query={query}
            />
          </>
        ) : null}

        {tab === 'em-uso' ? (
          emprestimosAbertos.length > 0 ? (
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
          ) : (
            <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhum item em uso agora.
            </p>
          )
        ) : null}

        {tab === 'pendencias' ? (
          <AdminInboxList itens={ops.pendencias} podeAgir={false} />
        ) : null}

        {tab === 'historico' ? <PatrimonioAuditoriaTimeline entradas={auditoria} /> : null}
      </div>
      </div>
    </div>
  )
}
