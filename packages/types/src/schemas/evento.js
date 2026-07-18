import { z } from 'zod'

export const TipoEventoSchema = z.enum(['GERAL', 'CARAVANA', 'ENSAIO'])
export const RsvpStatusSchema = z.enum(['CONFIRMADO', 'RECUSADO', 'LISTA_ESPERA'])
export const TIPO_EVENTO_LABEL = { GERAL: 'Evento', CARAVANA: 'Caravana', ENSAIO: 'Ensaio' }
export const RSVP_STATUS_LABEL = { CONFIRMADO: 'Confirmado', RECUSADO: 'Recusado', LISTA_ESPERA: 'Lista de espera' }
export const MandoJogoSchema = z.enum(['CASA', 'FORA'])
export const StatusPartidaSchema = z.enum(['AGENDADA', 'AO_VIVO', 'ENCERRADA', 'CANCELADA'])
export const MANDO_JOGO_LABEL = { CASA: 'Casa', FORA: 'Fora' }

export const CriarEventoSchema = z.object({
  titulo: z.string().min(3, 'Título muito curto').max(200),
  descricao: z.string().max(2000).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  data: z.string().min(1, 'Data obrigatória'),
  local: z.string().max(200).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  fotoUrl: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().url('URL da foto inválida').max(500).optional()),
  tipo: TipoEventoSchema.default('GERAL'),
  sedeId: z.preprocess((v) => (v === '' || v == null || v === 'global' ? null : v), z.string().uuid().nullable().optional()),
  lat: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().min(-90).max(90).optional()),
  lng: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().min(-180).max(180).optional()),
  capacidade: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().positive().max(100_000).optional()),
  valorVaga: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().positive().max(99_999.99).optional()),
  recorrenciasSemanas: z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().int().min(0).max(12).default(0)),
  partidaId: z.preprocess((v) => (v === '' || v == null || v === '__nova__' ? null : v), z.string().uuid().nullable().optional()),
})
export const UpdateEventoSchema = CriarEventoSchema.omit({ recorrenciasSemanas: true }).partial()
export const CriarPartidaRapidaSchema = z.object({
  adversario: z.string().min(2).max(120),
  competicao: z.string().max(120).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  dataHora: z.string().min(1),
  local: z.string().max(200).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  mando: MandoJogoSchema.default('CASA'),
})
