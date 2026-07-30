import { redirect } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { DiscordForm } from '@/components/admin/config-forms'
import { ConfigSectionCard } from '../_components/config-section-card'
import { getConfigContexto } from '../_lib/contexto'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Integrações — Configurações' }

export default async function ConfiguracoesIntegracoesPage() {
  const contexto = await getConfigContexto()
  if (!contexto) redirect('/')
  const { tenant, isOwner } = contexto

  return (
    <div className="space-y-6">
      <ConfigSectionCard
        icon={<MessageSquare className="h-4 w-4" />}
        title="Integração Discord"
        description="Vincule o servidor Discord para sincronizar membros e comandos do bot"
        ownerOnly
        blocked={!isOwner}
      >
        <DiscordForm discordGuildId={tenant.discordGuildId ?? null} />
      </ConfigSectionCard>
    </div>
  )
}
