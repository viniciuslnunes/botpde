import { z } from 'zod'

export const CriarMembroSchema = z.object({
  tipo: z.enum(['SOCIO', 'TORCEDOR']),
  nome: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(100),
  idade: z.number().int().min(14).max(100).optional(),
  telefone: z.string().max(20).optional(),
  cidade: z.string().max(100).optional(),
  numeroAssociado: z.string().max(50).optional(),
})

export const AprovarMembroSchema = z.object({
  membroId: z.string().uuid(),
})

// ─── Reprovação de solicitação ──────────────────────────────────────────────
// Fonte única do vocabulário de reprovação: usado pelo diálogo do admin, pela
// Server Action `reprovarMembro`, pelo card de detalhes (destaque vermelho por
// etapa) e pela tela de reenvio do solicitante no portal.

/**
 * Categorias de reprovação. `exigePontos` = a justificativa precisa apontar ao
 * menos um campo/etapa do cadastro (é uma recusa sobre o que foi preenchido,
 * não sobre a pessoa).
 * @type {{ id: string, label: string, descricao: string, exigePontos: boolean }[]}
 */
export const CATEGORIAS_REPROVACAO = [
  {
    id: 'DADOS_INCORRETOS',
    label: 'Dados cadastrais incorretos ou incompletos',
    descricao: 'Campos em branco, com erro de digitação ou inconsistentes.',
    exigePontos: true,
  },
  {
    id: 'DOCUMENTACAO',
    label: 'Documentação inválida ou ilegível',
    descricao: 'Anexos ausentes, cortados, vencidos ou que não conferem.',
    exigePontos: true,
  },
  {
    id: 'VINCULO_NAO_COMPROVADO',
    label: 'Vínculo com a torcida não comprovado',
    descricao: 'A prova de vínculo enviada não sustenta a associação.',
    exigePontos: true,
  },
  {
    id: 'DUPLICIDADE',
    label: 'Cadastro duplicado',
    descricao: 'Já existe um cadastro desta pessoa na torcida.',
    exigePontos: false,
  },
  {
    id: 'RESTRICAO',
    label: 'Restrição estatutária ou de conduta',
    descricao: 'Decisão da diretoria com base no estatuto.',
    exigePontos: false,
  },
  {
    id: 'FORA_DE_PERFIL',
    label: 'Fora do perfil de associação',
    descricao: 'Idade, unidade ou modalidade de vínculo incompatível.',
    exigePontos: false,
  },
  {
    id: 'OUTRO',
    label: 'Outro motivo',
    descricao: 'Descreva na justificativa.',
    exigePontos: false,
  },
]

/**
 * Etapas/campos do cadastro que podem ser apontados como problema. `tab` casa
 * com as abas do card de detalhes do admin; `soSocio` esconde o ponto quando o
 * vínculo é de torcedor (que não preenche LGE nem envia anexos).
 * @type {{ id: string, label: string, grupo: string, tab: string, soSocio: boolean }[]}
 */
export const PONTOS_REPROVACAO = [
  { id: 'nome', label: 'Nome completo', grupo: 'Identificação', tab: 'cadastro', soSocio: false },
  { id: 'cpf', label: 'CPF', grupo: 'Identificação', tab: 'cadastro', soSocio: true },
  { id: 'rg', label: 'RG', grupo: 'Identificação', tab: 'cadastro', soSocio: true },
  {
    id: 'nascimento',
    label: 'Data de nascimento',
    grupo: 'Identificação',
    tab: 'cadastro',
    soSocio: true,
  },
  { id: 'filiacao', label: 'Filiação', grupo: 'Identificação', tab: 'cadastro', soSocio: true },
  { id: 'telefone', label: 'Telefone', grupo: 'Contato', tab: 'cadastro', soSocio: false },
  { id: 'email', label: 'E-mail', grupo: 'Contato', tab: 'cadastro', soSocio: false },
  { id: 'logradouro', label: 'Logradouro', grupo: 'Endereço', tab: 'cadastro', soSocio: true },
  { id: 'numero', label: 'Número', grupo: 'Endereço', tab: 'cadastro', soSocio: true },
  { id: 'bairro', label: 'Bairro', grupo: 'Endereço', tab: 'cadastro', soSocio: true },
  { id: 'cep', label: 'CEP', grupo: 'Endereço', tab: 'cadastro', soSocio: true },
  { id: 'cidade', label: 'Cidade', grupo: 'Endereço', tab: 'cadastro', soSocio: false },
  { id: 'uf', label: 'UF', grupo: 'Endereço', tab: 'cadastro', soSocio: true },
  {
    id: 'resp-nome',
    label: 'Nome do responsável legal',
    grupo: 'Responsável (menor)',
    tab: 'cadastro',
    soSocio: true,
  },
  {
    id: 'resp-doc',
    label: 'Documento do responsável legal',
    grupo: 'Responsável (menor)',
    tab: 'cadastro',
    soSocio: true,
  },
  {
    id: 'prova',
    label: 'Comprovante de vínculo',
    grupo: 'Documentos',
    tab: 'documentos',
    soSocio: true,
  },
  {
    id: 'documento',
    label: 'Foto do documento',
    grupo: 'Documentos',
    tab: 'documentos',
    soSocio: true,
  },
  {
    id: 'residencia',
    label: 'Comprovante de residência',
    grupo: 'Documentos',
    tab: 'documentos',
    soSocio: true,
  },
  {
    id: 'numeroAssociado',
    label: 'Nº de associado',
    grupo: 'Associação',
    tab: 'associacao',
    soSocio: true,
  },
  {
    id: 'termo',
    label: 'Termo de responsabilidade',
    grupo: 'Associação',
    tab: 'associacao',
    soSocio: true,
  },
  {
    id: 'unidade',
    label: 'Unidade (Sede/Subsede/PDE)',
    grupo: 'Vínculo',
    tab: 'operacao',
    soSocio: false,
  },
  {
    id: 'departamento',
    label: 'Departamento pretendido',
    grupo: 'Vínculo',
    tab: 'operacao',
    soSocio: true,
  },
]

const CATEGORIA_IDS = CATEGORIAS_REPROVACAO.map((c) => c.id)
const PONTO_IDS = PONTOS_REPROVACAO.map((p) => p.id)

/** @type {Record<string, string>} */
export const CATEGORIA_REPROVACAO_LABEL = Object.fromEntries(
  CATEGORIAS_REPROVACAO.map((c) => [c.id, c.label]),
)

/** @type {Record<string, string>} */
export const PONTO_REPROVACAO_LABEL = Object.fromEntries(
  PONTOS_REPROVACAO.map((p) => [p.id, p.label]),
)

/**
 * Rótulo humano de um ponto do cadastro; devolve o próprio id quando o
 * catálogo mudou depois de a reprovação ter sido gravada.
 * @param {string} id
 * @returns {string}
 */
export function labelPontoReprovacao(id) {
  return PONTO_REPROVACAO_LABEL[id] ?? id
}

/**
 * @param {string | null | undefined} id
 * @returns {string | null}
 */
export function labelCategoriaReprovacao(id) {
  if (!id) return null
  return CATEGORIA_REPROVACAO_LABEL[id] ?? id
}

/** @param {string} id @returns {boolean} */
export function categoriaExigePontos(id) {
  return CATEGORIAS_REPROVACAO.find((c) => c.id === id)?.exigePontos ?? false
}

export const MOTIVO_REPROVACAO_MIN = 15
export const MOTIVO_REPROVACAO_MAX = 800

export const ReprovarMembroSchema = z
  .object({
    membroId: z.string().uuid('Membro inválido'),
    categoria: z
      .string()
      .refine(
        (v) => CATEGORIA_IDS.includes(v),
        'Escolha o tipo de problema que motivou a reprovação',
      ),
    motivo: z
      .string()
      .trim()
      .min(
        MOTIVO_REPROVACAO_MIN,
        `Explique o motivo em ao menos ${MOTIVO_REPROVACAO_MIN} caracteres`,
      )
      .max(MOTIVO_REPROVACAO_MAX, 'Justificativa muito longa'),
    pontos: z
      .array(z.string().refine((v) => PONTO_IDS.includes(v), 'Etapa do cadastro inválida'))
      .max(PONTO_IDS.length)
      .default([]),
    /** false = reprovação definitiva; bloqueia o reenvio pelo solicitante. */
    permiteReenvio: z.boolean().default(true),
    /**
     * true = além de reprovar, bloqueia novas solicitações na unidade onde a
     * solicitação nasceu. Exige `members:block` (revalidado no servidor).
     */
    bloquear: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (categoriaExigePontos(data.categoria) && data.pontos.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pontos'],
        message: 'Aponte ao menos uma etapa do cadastro com problema',
      })
    }
  })

export const DEFAULT_REPROVAR_MEMBRO = {
  categoria: 'DADOS_INCORRETOS',
  motivo: '',
  pontos: /** @type {string[]} */ ([]),
  permiteReenvio: true,
  bloquear: false,
}

// ─── Bloqueio de novas solicitações ─────────────────────────────────────────
// Bloqueio é sobre o USUÁRIO na torcida (não sobre a linha de `SaasMembro`):
// vale mesmo sem cadastro e herda para as unidades descendentes.

export const MOTIVO_BLOQUEIO_MIN = 3
export const MOTIVO_BLOQUEIO_MAX = 500

export const BloquearMembroSchema = z.object({
  userId: z.string().uuid('Usuário inválido'),
  motivo: z
    .string()
    .trim()
    .min(MOTIVO_BLOQUEIO_MIN, 'Explique o motivo do bloqueio')
    .max(MOTIVO_BLOQUEIO_MAX, 'Motivo muito longo'),
})

export const DesbloquearMembroSchema = z.object({
  userId: z.string().uuid('Usuário inválido'),
})
