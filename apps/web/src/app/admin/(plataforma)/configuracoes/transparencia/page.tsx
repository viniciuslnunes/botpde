import { redirect } from 'next/navigation'
import { Network, Scale, Store } from 'lucide-react'
import {
  BalancoVisivelForm,
  HierarquiaVisivelForm,
  PortalNasUnidadesForm,
} from '@/components/admin/config-forms'
import { AdminTabs, adminTabIds, type AdminTabItem } from '@/components/admin/ui'
import { ConfigSectionCard } from '../_components/config-section-card'
import { getConfigContexto } from '../_lib/contexto'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Transparência — Configurações' }

const ICONE = 'h-4 w-4'
const BASE_PATH = '/admin/configuracoes/transparencia'
const PARAM_SECAO = 'secao'

/**
 * O que a torcida expõe no portal. Balanço, hierarquia e (na Sede) o que
 * cascateia para unidades — loja e agenda. Cada uma é uma seção própria; quem
 * não pode gerir uma delas não recebe a tab.
 */
export default async function ConfiguracoesTransparenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string }>
}) {
  const { secao } = await searchParams
  const { tenant, canManageSettings, podeEditarConfigDeOwner } = await getConfigContexto()
  // O contexto também aceita `associacao:pendencias_manage` (aba Geral). Aqui
  // toda seção exige `settings:manage` — sem ela não há o que ver nem gerir.
  if (!canManageSettings) redirect('/admin/configuracoes')

  const raizId = await resolverTenantRaizId(tenant.id)
  const isRaiz = raizId === tenant.id

  const tabs: AdminTabItem[] = [
    { id: 'balanco', label: 'Balanço financeiro', icon: <Scale className={ICONE} /> },
    ...(podeEditarConfigDeOwner
      ? [{ id: 'hierarquia', label: 'Hierarquia da torcida', icon: <Network className={ICONE} /> }]
      : []),
    ...(isRaiz
      ? [{ id: 'unidades', label: 'Loja e agenda nas unidades', icon: <Store className={ICONE} /> }]
      : []),
  ]

  const ativa = tabs.find((t) => t.id === secao)?.id ?? tabs[0]!.id
  const { tabId, panelId } = adminTabIds(PARAM_SECAO, ativa)

  return (
    <div className="space-y-6">
      <AdminTabs tabs={tabs} basePath={BASE_PATH} activeId={ativa} paramKey={PARAM_SECAO} />

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
        {ativa === 'balanco' ? (
          <ConfigSectionCard
            icon={<Scale className={ICONE} />}
            title="Balanço financeiro"
            description="Prestação de contas no portal — escolha o nível de detalhe público"
          >
            <BalancoVisivelForm
              key={`${tenant.balancoFinanceiroVisivel}-${tenant.balancoDetalheNivel}`}
              visivel={tenant.balancoFinanceiroVisivel}
              detalheNivel={tenant.balancoDetalheNivel}
            />
          </ConfigSectionCard>
        ) : null}

        {ativa === 'hierarquia' ? (
          <ConfigSectionCard
            icon={<Network className={ICONE} />}
            title="Hierarquia da torcida"
            description="Controle o que subsedes e PDEs enxergam da estrutura completa"
            ownerOnly
          >
            <HierarquiaVisivelForm
              key={String(tenant.hierarquiaVisivelParaFilhos)}
              visivel={tenant.hierarquiaVisivelParaFilhos}
            />
          </ConfigSectionCard>
        ) : null}

        {ativa === 'unidades' ? (
          <ConfigSectionCard
            icon={<Store className={ICONE} />}
            title="Loja e agenda nas unidades"
            description="Presidente e vices controlam se a Sede aparece no portal de PDE/subsede. Cada unidade mantém catálogo e estoque próprios — este interruptor só libera a ponte até a loja da torcida principal."
          >
            <PortalNasUnidadesForm
              key={`${tenant.lojaVisivelNasUnidades}-${tenant.agendaVisivelNasUnidades}`}
              lojaVisivel={tenant.lojaVisivelNasUnidades}
              agendaVisivel={tenant.agendaVisivelNasUnidades}
            />
          </ConfigSectionCard>
        ) : null}
      </div>
    </div>
  )
}
