/**
 * Comunicado segmentado — quem recebe o fan-out e quem vê no feed.
 * Persistência: `Announcement.audiencia` (JSON).
 */

import { z } from 'zod'

export const ESCOPOS_COMUNICADO_AUDIENCIA = Object.freeze([
  'TODOS',
  'SOCIOS',
  'TORCEDORES',
  'DEPARTAMENTO',
  'ADIMPLENTES',
])

export const ComunicadoAudienciaSchema = z.object({
  escopo: z.enum(['TODOS', 'SOCIOS', 'TORCEDORES', 'DEPARTAMENTO', 'ADIMPLENTES']),
  departamentoId: z.string().uuid().optional().nullable(),
})

/** @typedef {z.infer<typeof ComunicadoAudienciaSchema>} ComunicadoAudiencia */

export const COMUNICADO_AUDIENCIA_PADRAO = Object.freeze({ escopo: 'TODOS' })

/**
 * @param {unknown} raw
 * @returns {ComunicadoAudiencia}
 */
export function parseComunicadoAudiencia(raw) {
  if (raw == null) return { ...COMUNICADO_AUDIENCIA_PADRAO }
  const parsed = ComunicadoAudienciaSchema.safeParse(raw)
  if (!parsed.success) return { ...COMUNICADO_AUDIENCIA_PADRAO }
  if (parsed.data.escopo === 'DEPARTAMENTO' && !parsed.data.departamentoId) {
    return { ...COMUNICADO_AUDIENCIA_PADRAO }
  }
  return parsed.data
}

/**
 * @param {ComunicadoAudiencia} audiencia
 * @returns {string}
 */
export function labelComunicadoAudiencia(audiencia) {
  switch (audiencia.escopo) {
    case 'SOCIOS':
      return 'Só sócios'
    case 'TORCEDORES':
      return 'Só torcedores'
    case 'DEPARTAMENTO':
      return 'Um departamento'
    case 'ADIMPLENTES':
      return 'Só adimplentes'
    default:
      return 'Todos os membros'
  }
}

/**
 * Filtra userIds pelo escopo (dados já carregados em lote).
 *
 * @param {ComunicadoAudiencia} audiencia
 * @param {Array<{ userId: string, tipo: string, adimplente: boolean, departamentoId?: string | null }>} membros
 * @returns {string[]}
 */
export function filtrarMembrosPorAudiencia(audiencia, membros) {
  const escopo = audiencia.escopo ?? 'TODOS'
  if (escopo === 'TODOS') return membros.map((m) => m.userId)

  return membros
    .filter((m) => {
      if (escopo === 'SOCIOS') return m.tipo === 'SOCIO'
      if (escopo === 'TORCEDORES') return m.tipo === 'TORCEDOR'
      if (escopo === 'ADIMPLENTES') return m.tipo !== 'SOCIO' || m.adimplente
      if (escopo === 'DEPARTAMENTO' && audiencia.departamentoId) {
        return m.departamentoId === audiencia.departamentoId
      }
      return true
    })
    .map((m) => m.userId)
}
