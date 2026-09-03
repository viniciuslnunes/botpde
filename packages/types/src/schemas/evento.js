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
  /**
   * Projeto do departamento ao qual o evento pertence (Festa das Crianças →
   * projeto homônimo). Opcional; a Server Action valida tenant.
   */
  projetoId: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().min(1).optional(),
  ),
  /**
   * Dono operacional: quem escala, monta e responde pelo evento. Chega do
   * formulário como um valor só (`departamentoId` ou `departamentoId::areaId`)
   * porque área depende do departamento — a Server Action separa e valida.
   * Vazio = herda do projeto, quando houver.
   */
  donoOperacional: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().min(1).max(120).optional(),
  ),
  /** Hub thin do departamento: o slug do próprio hub vira dono na criação. */
  departamentoSlug: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().min(1).max(80).optional(),
  ),
  /** Caravana paga: bloqueia check-in sem PAGO (override do gestor na porta). */
  checkInExigePagamento: z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean()).optional(),
  recorrenciasSemanas: z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().int().min(0).max(12).default(0)),
  partidaId: z.preprocess((v) => (v === '' || v == null || v === '__nova__' ? null : v), z.string().uuid().nullable().optional()),
})
export const UpdateEventoSchema = CriarEventoSchema.omit({ recorrenciasSemanas: true }).partial()

export const FuncaoEscalaSchema = z.enum([
  'COORDENACAO',
  'EMBARQUE',
  'CONDUCAO',
  'BANDEIRA',
  'BATERIA',
  'BAR',
  'PORTARIA',
  'ACOLHIMENTO',
  'COBERTURA',
  'APOIO',
])

export const StatusEscalaSchema = z.enum(['CONVOCADO', 'ACEITO', 'RECUSADO', 'SUBSTITUIDO'])

/** Convocação de um posto da operação (quem trabalha, não quem vai). */
export const ConvocarEscalaSchema = z.object({
  eventoId: z.string().uuid(),
  userId: z.string().min(1, 'Escolha quem vai assumir o posto'),
  funcao: FuncaoEscalaSchema,
  /** Naipe, número do ônibus, portão — o detalhe que faz o posto ser concreto. */
  observacao: z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  areaId: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().min(1).optional(),
  ),
})
export const CriarPartidaRapidaSchema = z.object({
  adversario: z.string().min(2).max(120),
  competicao: z.string().max(120).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  dataHora: z.string().min(1),
  local: z.string().max(200).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  mando: MandoJogoSchema.default('CASA'),
})

/** Ônibus/van da caravana. Capacidade é do veículo, não do evento. */
export const CaravanaVeiculoSchema = z.object({
  eventoId: z.string().uuid(),
  identificacao: z.string().trim().min(1, 'Dê um nome ao veículo').max(60),
  placa: z
    .string()
    .trim()
    .max(10)
    .optional()
    .transform((v) => (v && v.length > 0 ? v.toUpperCase() : undefined)),
  empresa: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  capacidade: z.coerce.number().int().positive('Informe a capacidade').max(120),
  responsavelId: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().min(1).optional(),
  ),
  pontoEmbarque: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  horarioEmbarque: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  observacao: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})
