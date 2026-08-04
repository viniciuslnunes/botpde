import { redirect } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { DiscordForm } from '@/components/admin/config-forms'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { ConfigSectionCard } from '../_components/config-section-card'
import { getConfigContexto } from '../_lib/contexto'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Integrações — Configurações' }

export default async function ConfiguracoesIntegracoesPage() {
  const { tenant, canManageSettings, podeEditarConfigDeOwner } = await getConfigContexto()
  // O contexto também aceita `associacao:pendencias_manage` (aba Geral).
  if (!canManageSettings) redirect('/admin/configuracoes')

  // A única seção da aba é do presidente. Quem não pode gerir não recebe o
  // formulário — vê só o porquê, para a aba não virar uma tela em branco.
  if (!podeEditarConfigDeOwner) {
    return (
      <MotionEmptyState
        icon={<MessageSquare className="mb-3 h-6 w-6 text-[rgb(var(--foreground-muted))]" />}
        title="Nada para configurar aqui"
        description="A integração com o Discord é definida pelo presidente da torcida."
      />
    )
  }

  return (
    <div className="space-y-6">
      <ConfigSectionCard
        icon={<MessageSquare className="h-4 w-4" />}
        title="Integração Discord"
        description="Vincule o servidor Discord para sincronizar membros e comandos do bot"
        ownerOnly
      >
        <DiscordForm discordGuildId={tenant.discordGuildId ?? null} />
      </ConfigSectionCard>
    </div>
  )
}
