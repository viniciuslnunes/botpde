import { cache } from 'react'
import { db } from '@torcida/db'

export type PartidaOption = {
  id: string
  adversario: string
  competicao: string | null
  dataHora: Date
  local: string | null
  mando: 'CASA' | 'FORA'
  status: string
}

export type PartidaLite = PartidaOption & {
  placarCasa: number | null
  placarFora: number | null
}

/** Partidas futuras (e recentes) da afiliação do tenant — referência global. */
export const listPartidasParaEvento = cache(async function listPartidasParaEvento(
  tenantId: string,
  limite = 40,
): Promise<PartidaOption[]> {
  const tenant: { afiliacaoId: string | null } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { afiliacaoId: true },
  })
  if (!tenant?.afiliacaoId) return []

  const desde = new Date()
  desde.setDate(desde.getDate() - 2)

  const rows: PartidaOption[] = await db.partida.findMany({
    where: {
      afiliacaoId: tenant.afiliacaoId,
      status: { in: ['AGENDADA', 'AO_VIVO'] },
      dataHora: { gte: desde },
    },
    select: {
      id: true,
      adversario: true,
      competicao: true,
      dataHora: true,
      local: true,
      mando: true,
      status: true,
    },
    orderBy: { dataHora: 'asc' },
    take: limite,
  })
  return rows
})

export async function getAfiliacaoIdDoTenant(tenantId: string): Promise<string | null> {
  const tenant: { afiliacaoId: string | null } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { afiliacaoId: true },
  })
  return tenant?.afiliacaoId ?? null
}
