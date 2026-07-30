import { Network, Scale } from 'lucide-react'
import { BalancoVisivelForm, HierarquiaVisivelForm } from '@/components/admin/config-forms'
import { ConfigSectionCard } from '../_components/config-section-card'
import { getConfigContexto } from '../_lib/contexto'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Transparência — Configurações' }

const ICONE = 'h-4 w-4'

/**
 * O que a torcida expõe no portal. Balanço e hierarquia visível estavam em
 * seções separadas de `?tab=`, mas respondem à mesma pergunta — quanto da
 * operação interna fica visível para associados e unidades filhas.
 */
export default async function ConfiguracoesTransparenciaPage() {
  const { tenant, isOwner } = await getConfigContexto()

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
    </div>
  )
}
