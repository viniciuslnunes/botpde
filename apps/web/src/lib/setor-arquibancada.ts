import { db } from '@torcida/db'
import { cache } from 'react'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import {
  SETORES_ARQUIBANCADA,
  formatarSetorArquibancada,
  rotuloSetorArquibancada,
  setorAceitaGeral,
} from '@torcida/types'

export type SetorArquibancadaCardeal = (typeof SETORES_ARQUIBANCADA)[number]

export type SetorArquibancadaView = {
  cardeal: SetorArquibancadaCardeal
  geral: boolean
  nomeLocal: string | null
  portao: string | null
  tenantRaizId: string
}

type SetorArquibancadaRow = {
  id: string
  setorArquibancada: SetorArquibancadaCardeal | null
  setorArquibancadaGeral: boolean
  setorArquibancadaNome: string | null
  setorArquibancadaPortao: string | null
}

function viewDeLinha(row: SetorArquibancadaRow): SetorArquibancadaView | null {
  if (!row.setorArquibancada) return null
  const geral =
    setorAceitaGeral(row.setorArquibancada) && row.setorArquibancadaGeral
  return {
    cardeal: row.setorArquibancada,
    geral,
    nomeLocal: row.setorArquibancadaNome,
    portao: row.setorArquibancadaPortao,
    tenantRaizId: row.id,
  }
}

/**
 * Setor da torcida: sempre o da Sede raiz. Unidades (subsede/PDE) herdam.
 */
export const resolverSetorArquibancada = cache(
  async (tenantId: string): Promise<SetorArquibancadaView | null> => {
    const raizId = await resolverTenantRaizId(tenantId)
    const row: SetorArquibancadaRow | null = await db.tenant.findUnique({
      where: { id: raizId },
      select: {
        id: true,
        setorArquibancada: true,
        setorArquibancadaGeral: true,
        setorArquibancadaNome: true,
        setorArquibancadaPortao: true,
      },
    })
    if (!row) return null
    return viewDeLinha(row)
  },
)

export function linhaSetorArquibancada(
  setor: SetorArquibancadaView | null | undefined,
): string {
  if (!setor) return ''
  return formatarSetorArquibancada(setor)
}

export { rotuloSetorArquibancada, setorAceitaGeral }
