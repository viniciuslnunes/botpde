import { getComunicadosParaFeed } from '@/lib/feed'
import { ComunicadosSection } from '@/components/portal/comunicados-section'

interface ComunidadeComunicadosSectionProps {
  tenantId: string
  currentUserId: string
}

export async function ComunidadeComunicadosSection({
  tenantId,
  currentUserId,
}: ComunidadeComunicadosSectionProps) {
  const announcements = await getComunicadosParaFeed(
    tenantId,
    currentUserId || undefined,
  )

  if (announcements.length === 0) return null

  const temComunicadosNovos = announcements.some((a) => a.lido === false)
  const comunicadosItems = announcements.map((a) => ({
    id: a.id,
    tenantId: a.tenantId,
    titulo: a.titulo,
    corpo: a.corpo,
    prioridade: a.prioridade,
    fixado: a.fixado,
    publicadoEm: a.publicadoEm.toISOString(),
    tenantNome: a.tenant.nome,
    autorNome: a.autor.nome,
    lido: a.lido,
  }))

  return (
    <ComunicadosSection
      announcements={comunicadosItems}
      tenantId={tenantId}
      defaultExpanded={temComunicadosNovos}
    />
  )
}
