import { db } from '@torcida/db'

export type EscopoSerie = 'esta' | 'futuras'

export function parseEscopoSerie(raw: FormDataEntryValue | null): EscopoSerie {
  return raw === 'futuras' ? 'futuras' : 'esta'
}

/** Ocorrências desta data em diante na mesma série (inclui a atual). */
export async function listarOcorrenciasFuturasSerie(opts: {
  tenantId: string
  serieId: string
  aPartirDe: Date
}): Promise<Array<{ id: string; data: Date }>> {
  type Row = { id: string; data: Date }
  const rows: Row[] = await db.evento.findMany({
    where: {
      tenantId: opts.tenantId,
      serieId: opts.serieId,
      data: { gte: opts.aPartirDe },
    },
    select: { id: true, data: true },
    orderBy: { data: 'asc' },
  })
  return rows
}
