/**
 * Contrato do trabalho de um departamento: campanhas, projetos contínuos,
 * ações pontuais e parcerias (Campanha do Agasalho, Escolinha da Bateria,
 * Corrida de Rua, Festa das Crianças).
 *
 * Como a área de atuação, projeto **NÃO concede permissão** — quem gere é
 * `canManageDepartamento`. `responsavelId` é accountability, não delegação.
 */

import { z } from 'zod'
import { slugifyDepartamento } from './permissions.js'

export const TipoProjetoSchema = z.enum(['CAMPANHA', 'PROJETO', 'ACAO', 'PARCERIA'])
export const StatusProjetoSchema = z.enum(['PLANEJADO', 'ATIVO', 'CONCLUIDO', 'CANCELADO'])

/** @typedef {'CAMPANHA' | 'PROJETO' | 'ACAO' | 'PARCERIA'} TipoProjeto */
/** @typedef {'PLANEJADO' | 'ATIVO' | 'CONCLUIDO' | 'CANCELADO'} StatusProjeto */

/** @type {Readonly<Record<TipoProjeto, { label: string, descricao: string }>>} */
export const TIPO_PROJETO = Object.freeze({
  CAMPANHA: {
    label: 'Campanha',
    descricao: 'Arrecadação com meta e janela no ano (Agasalho, Natal, Páscoa).',
  },
  PROJETO: {
    label: 'Projeto',
    descricao: 'Trabalho contínuo, sem data de encerramento (Inclusão Digital, Escolinha).',
  },
  ACAO: {
    label: 'Ação',
    descricao: 'Atividade pontual num dia (Doação de Sangue, Dia da Saúde).',
  },
  PARCERIA: {
    label: 'Parceria',
    descricao: 'Convênio com universidade, instituição ou poder público.',
  },
})

/** @type {Readonly<Record<StatusProjeto, { label: string, tom: 'neutral' | 'primary' | 'success' | 'danger' }>>} */
export const STATUS_PROJETO = Object.freeze({
  PLANEJADO: { label: 'Planejado', tom: 'neutral' },
  ATIVO: { label: 'Em andamento', tom: 'primary' },
  CONCLUIDO: { label: 'Concluído', tom: 'success' },
  CANCELADO: { label: 'Cancelado', tom: 'danger' },
})

export const TIPOS_PROJETO = /** @type {readonly TipoProjeto[]} */ (Object.keys(TIPO_PROJETO))
export const STATUS_PROJETOS = /** @type {readonly StatusProjeto[]} */ (Object.keys(STATUS_PROJETO))

/** Status que ainda pedem atenção — usado em KPI e "próxima ação". */
export const STATUS_PROJETO_ABERTOS = Object.freeze(['PLANEJADO', 'ATIVO'])

/**
 * @param {string} nome
 * @returns {string}
 */
export function slugifyProjeto(nome) {
  return slugifyDepartamento(nome)
}

/**
 * Título da campanha sazonal do ano (ex.: "Campanha do Agasalho 2026").
 *
 * @param {string} nomeArea
 * @param {number} ano
 * @returns {string}
 */
export function tituloCampanhaDoAno(nomeArea, ano) {
  const base = typeof nomeArea === 'string' ? nomeArea.trim() : ''
  const y = Number(ano)
  if (!base || !Number.isInteger(y) || y < 2000) return base || 'Campanha'
  return `${base} ${y}`.slice(0, 120)
}

/**
 * Slug estável por área+ano — unique em `(departamentoId, slug)`.
 *
 * @param {string} slugArea
 * @param {number} ano
 * @returns {string}
 */
export function slugCampanhaDoAno(slugArea, ano) {
  const y = Number(ano)
  const base = typeof slugArea === 'string' ? slugArea.trim() : ''
  return slugifyProjeto(`${base || 'campanha'}-${Number.isInteger(y) ? y : ''}`)
}

/**
 * Janela default do ano civil (1º jan → 31 dez, meio-dia local).
 *
 * @param {number} ano
 * @returns {{ inicio: Date, fim: Date }}
 */
export function janelaCampanhaDoAno(ano) {
  const y = Number(ano)
  const safe = Number.isInteger(y) && y >= 2000 ? y : new Date().getFullYear()
  return {
    inicio: new Date(safe, 0, 1, 12, 0, 0, 0),
    fim: new Date(safe, 11, 31, 12, 0, 0, 0),
  }
}

/**
 * Campanha do ano corrente começa ATIVA; de outro ano, PLANEJADA.
 *
 * @param {number} ano
 * @param {Date} [hoje]
 * @returns {'ATIVO' | 'PLANEJADO'}
 */
export function statusInicialCampanhaDoAno(ano, hoje = new Date()) {
  return hoje.getFullYear() === Number(ano) ? 'ATIVO' : 'PLANEJADO'
}

/**
 * @param {TipoProjeto | string | null | undefined} tipo
 * @returns {string}
 */
export function labelTipoProjeto(tipo) {
  return TIPO_PROJETO[/** @type {TipoProjeto} */ (tipo)]?.label ?? 'Projeto'
}

/**
 * @param {StatusProjeto | string | null | undefined} status
 * @returns {string}
 */
export function labelStatusProjeto(status) {
  return STATUS_PROJETO[/** @type {StatusProjeto} */ (status)]?.label ?? 'Planejado'
}

/**
 * Progresso da meta em 0–100. Sem meta declarada devolve `null` — a UI mostra
 * "sem meta" em vez de fingir 0%, que leria como fracasso.
 *
 * @param {number | null | undefined} realizado
 * @param {number | null | undefined} meta
 * @returns {number | null}
 */
export function progressoMeta(realizado, meta) {
  if (typeof meta !== 'number' || !Number.isFinite(meta) || meta <= 0) return null
  const feito = typeof realizado === 'number' && Number.isFinite(realizado) ? realizado : 0
  return Math.max(0, Math.min(100, Math.round((feito / meta) * 100)))
}

/**
 * Saúde do orçamento: quanto do previsto já foi consumido. Sem previsto
 * devolve `null` (gastar sem orçamento declarado não é estouro, é ausência
 * de plano — a UI diz isso).
 *
 * @param {number | null | undefined} realizado
 * @param {number | null | undefined} previsto
 * @returns {{ percentual: number, estourou: boolean } | null}
 */
export function saudeOrcamento(realizado, previsto) {
  if (typeof previsto !== 'number' || !Number.isFinite(previsto) || previsto <= 0) return null
  const gasto = typeof realizado === 'number' && Number.isFinite(realizado) ? realizado : 0
  const percentual = Math.round((gasto / previsto) * 100)
  return { percentual, estourou: gasto > previsto }
}

/**
 * Uma campanha sazonal está "na janela" quando hoje cai entre início e fim.
 * Para recorrente anual, compara só dia/mês — a Campanha do Agasalho de 2025
 * segue marcando a janela de 2026 sem precisar duplicar o registro.
 *
 * @param {{ inicio: Date, fim: Date | null, recorrenteAnual: boolean }} projeto
 * @param {Date} [hoje]
 * @returns {boolean}
 */
export function estaNaJanela(projeto, hoje = new Date()) {
  const { inicio, fim, recorrenteAnual } = projeto
  if (!(inicio instanceof Date)) return false
  if (!recorrenteAnual) {
    if (hoje < inicio) return false
    return fim instanceof Date ? hoje <= fim : true
  }

  const diaDoAno = (d) => (d.getMonth() + 1) * 100 + d.getDate()
  const h = diaDoAno(hoje)
  const i = diaDoAno(inicio)
  const f = fim instanceof Date ? diaDoAno(fim) : i
  // Janela que vira o ano (ex.: 15/11 → 10/01) precisa do OR.
  return i <= f ? h >= i && h <= f : h >= i || h <= f
}

/** Payload de criação/edição — validado antes de qualquer escrita. */
export const ProjetoFormSchema = z.object({
  titulo: z.string().trim().min(3, 'Título muito curto').max(120, 'Título muito longo'),
  descricao: z.string().trim().max(2000, 'Descrição muito longa').optional().or(z.literal('')),
  tipo: TipoProjetoSchema,
  status: StatusProjetoSchema,
  areaId: z.string().trim().optional().or(z.literal('')),
  inicio: z.string().trim().min(1, 'Informe a data de início'),
  fim: z.string().trim().optional().or(z.literal('')),
  recorrenteAnual: z.boolean(),
  metaQuantidade: z.number().int().min(0).max(10_000_000).nullable(),
  metaUnidade: z.string().trim().max(40, 'Unidade muito longa').optional().or(z.literal('')),
  orcamentoPrevisto: z.number().min(0).max(100_000_000).nullable(),
  responsavelId: z.string().trim().optional().or(z.literal('')),
})
