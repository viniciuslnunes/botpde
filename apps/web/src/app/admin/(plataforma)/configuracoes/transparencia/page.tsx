import { Network, Scale, Store } from 'lucide-react'
import {
  BalancoVisivelForm,
  HierarquiaVisivelForm,
  PortalNasUnidadesForm,
} from '@/components/admin/config-forms'
import { ConfigSectionCard } from '../_components/config-section-card'
import { getConfigContexto } from '../_lib/contexto'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Transparência — Configurações' }

const ICONE = 'h-4 w-4'

/**
 * O que a torcida expõe no portal. Balanço, hierarquia e (na Sede) o que
 * cascateia para unidades — loja e agenda.
 */
export default async function ConfiguracoesTransparenciaPage() {
  const { tenant, isOwner } = await getConfigContexto()
  const raizId = await resolverTenantRaizId(tenant.id)
  const isRaiz = raizId === tenant.id

  return (
    <div className="space-y-6">
      <ConfigSectionCard
        icon={<Scale className={ICONE} />}
        title="Balanço financeiro"
        description="Prestação de contas no portal — escolha o nível de detalhe público"
        index={0}
      >
        <BalancoVisivelForm
          key={`${tenant.balancoFinanceiroVisivel}-${tenant.balancoDetalheNivel}`}
          visivel={tenant.balancoFinanceiroVisivel}
          detalheNivel={tenant.balancoDetalheNivel}
        />
      </ConfigSectionCard>

      <ConfigSectionCard
        icon={<Network className={ICONE} />}
        title="Hierarquia da torcida"
        description="Controle o que subsedes e PDEs enxergam da estrutura completa"
        ownerOnly
        blocked={!isOwner}
        index={1}
      >
        <HierarquiaVisivelForm
          key={String(tenant.hierarquiaVisivelParaFilhos)}
          visivel={tenant.hierarquiaVisivelParaFilhos}
        />
      </ConfigSectionCard>

      {isRaiz ? (
        <ConfigSectionCard
          icon={<Store className={ICONE} />}
          title="Loja e agenda nas unidades"
          description="Presidente e vices controlam se a Sede aparece no portal de PDE/subsede"
          index={2}
        >
          <PortalNasUnidadesForm
            key={`${tenant.lojaVisivelNasUnidades}-${tenant.agendaVisivelNasUnidades}`}
            lojaVisivel={tenant.lojaVisivelNasUnidades}
            agendaVisivel={tenant.agendaVisivelNasUnidades}
          />
        </ConfigSectionCard>
      ) : null}
    </div>
  )
}
