import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'

export type PendentesSuperAdmin = {
  afiliacoes: number
  moderacao: number
}

/** Contagens cross-tenant para badges do menu do super-admin — sem `tenantId` (visão de plataforma). */
export const contarPendentesSuperAdmin = cache(async function contarPendentesSuperAdmin(): Promise<PendentesSuperAdmin> {
  const [afiliacoes, denunciasPost, denunciasMensagem]: [number, number, number] = await Promise.all([
    db.solicitacaoUnidade.count({ where: { status: 'PENDENTE', tipo: { not: 'SEDE' } } }),
    db.denuncia.count({ where: { status: 'PENDENTE' } }),
    db.denunciaMensagem.count({ where: { status: 'PENDENTE' } }),
  ])

  return { afiliacoes, moderacao: denunciasPost + denunciasMensagem }
})
