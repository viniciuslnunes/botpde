/**
 * Contrato do CATÁLOGO DE CLUBES (`Afiliacao`) — a referência global de times
 * apoiados. Regras puras, sem Prisma e sem Next: valem no formulário do
 * super-admin (`/super-admin/clubes`), nos seeds e nos testes.
 *
 * Por que o rigor: o clube é lido por partes do produto que assumem campos
 * preenchidos —
 *  - `slug` casa os embeds oficiais da Sofascore (`SOFASCORE_WIDGETS.afiliacaoSlug`);
 *  - `serie` escolhe a tabela de classificação nacional (`SOFASCORE_COMPETICOES`);
 *  - `estado` alimenta o mapa do onboarding;
 *  - o trio de estimativa de torcedores só faz sentido junto (número + fonte + tipo).
 * Cadastro incompleto não quebra a página, mas apaga funcionalidade em silêncio —
 * daí `completudeClube`, que transforma isso em fila de trabalho visível.
 */

import { z } from 'zod'
import { slugify } from './loja.js'

/** @typedef {'A'|'B'|'C'|'D'|'ESTADUAL'|'OUTRA'} SerieClube */

/** Espelha `enum SerieCampeonato` do schema. */
export const SERIES_CLUBE = ['A', 'B', 'C', 'D', 'ESTADUAL', 'OUTRA']

export const SERIE_CLUBE_LABEL = {
  A: 'Série A',
  B: 'Série B',
  C: 'Série C',
  D: 'Série D',
  ESTADUAL: 'Estadual',
  OUTRA: 'Outra',
}

/**
 * Rótulo da série tolerante a nulo/valor desconhecido — o call site costuma ter
 * `string | null` vindo do banco, não o union fechado.
 * @param {string | null | undefined} serie
 * @returns {string}
 */
export function rotuloSerieClube(serie) {
  if (!serie) return 'Sem série'
  return SERIE_CLUBE_LABEL[serie] ?? serie
}

/** Espelha `enum TorcedoresEstimadosTipo`. */
export const TORCEDORES_ESTIMADOS_TIPOS = ['IBOPE_DIGITAL', 'LIMITE_ATE']

export const TORCEDORES_ESTIMADOS_TIPO_LABEL = {
  IBOPE_DIGITAL: 'IBOPE — Ranking Digital',
  LIMITE_ATE: 'Teto conservador (fora do Top 50)',
}

/**
 * @param {string | null | undefined} tipo
 * @returns {string}
 */
export function rotuloTipoEstimativa(tipo) {
  if (!tipo) return '—'
  return TORCEDORES_ESTIMADOS_TIPO_LABEL[tipo] ?? tipo
}

/** Unidades federativas — fonte única para validação e para os selects. */
export const UFS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

/**
 * Slug canônico do clube: mesmo resultado de `gerarSlugUnico` do seed
 * (`packages/db/src/data/afiliacoes-normalize.js`) antes do sufixo de colisão —
 * nome normalizado + UF. Mudar a regra aqui desalinha o catálogo já semeado.
 * @param {string} nome
 * @param {string | null | undefined} estado
 * @returns {string}
 */
export function slugClube(nome, estado) {
  const base = slugify(`${nome ?? ''} ${estado ?? ''}`)
  return base || 'clube'
}

/**
 * Tokens jurídicos/genéricos do futebol BR — somem do apelido sugerido.
 * "Sport Club Corinthians Paulista" → "Corinthians";
 * "Guarany Sporting Club de Sobral" → "Guarany".
 */
const APELIDO_STOPWORDS = new Set([
  'aa',
  'associacao',
  'associacão',
  'associação',
  'atletica',
  'atlética',
  'club',
  'clube',
  'da',
  'das',
  'de',
  'desportiva',
  'do',
  'dos',
  'e',
  'ec',
  'esporte',
  'esportes',
  'esportiva',
  'esportivo',
  'fc',
  'foot-ball',
  'football',
  'futebol',
  'recreativo',
  'regatas',
  'sc',
  'sociedade',
  'sport',
  'sporting',
  'sports',
  'the',
])

/** Genéricos que sozinhos não identificam o clube — pedem a palavra seguinte. */
const APELIDO_GENERICOS = new Set([
  'america',
  'américa',
  'atletico',
  'atlético',
  'internacional',
  'nacional',
  'uniao',
  'união',
])

function normalizarTokenApelido(token) {
  return token
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/**
 * Apelido curto a partir do nome oficial — o que cabe em card, badge e
 * placeholder do escudo. Puro: o form só sugere enquanto o operador não edita.
 * @param {string | null | undefined} nome
 * @returns {string}
 */
export function apelidoClube(nome) {
  const bruto = typeof nome === 'string' ? nome.trim() : ''
  if (!bruto) return ''

  const significativos = bruto.split(/\s+/).filter((token) => {
    const chave = normalizarTokenApelido(token)
    return chave.length > 1 && !APELIDO_STOPWORDS.has(chave)
  })
  if (significativos.length === 0) return ''

  const primeiro = significativos[0]
  const chave = normalizarTokenApelido(primeiro)
  if (APELIDO_GENERICOS.has(chave) && significativos[1]) {
    return `${primeiro} ${significativos[1]}`.slice(0, 60)
  }
  return primeiro.slice(0, 60)
}

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const escudoUrlSchema = z
  .string()
  .trim()
  .url('Informe uma URL válida.')
  .max(500)
  .refine((v) => v.startsWith('https://'), 'O escudo precisa ser servido por HTTPS.')

const opcional = (schema) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v ?? undefined
    const t = v.trim()
    return t === '' ? undefined : t
  }, schema.optional())

/**
 * Campos do clube. `nome`, `slug`, `serie` e `estado` são obrigatórios: são
 * exatamente os que outros módulos consomem sem checar nulo.
 */
export const ClubeSchema = z
  .object({
    nome: z.string().trim().min(3, 'Nome muito curto.').max(120),
    apelido: opcional(z.string().max(60)),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(140)
      .regex(slugRegex, 'Use apenas letras minúsculas, números e hífen.'),
    serie: z.enum(SERIES_CLUBE),
    estado: z.enum(UFS_BRASIL, { errorMap: () => ({ message: 'UF inválida.' }) }),
    cidade: opcional(z.string().max(100)),
    escudoUrl: opcional(escudoUrlSchema),
    apiExternalId: opcional(z.string().max(60)),
    torcedoresEstimados: z
      .union([z.number().int().min(0).max(100_000_000), z.null()])
      .optional(),
    torcedoresEstimadosFonte: opcional(z.string().max(200)),
    torcedoresEstimadosTipo: opcional(z.enum(TORCEDORES_ESTIMADOS_TIPOS)),
    ativo: z.boolean().optional(),
  })
  .superRefine((valor, ctx) => {
    // O trio de estimativa é indivisível: número sem procedência vira boato.
    const temNumero =
      typeof valor.torcedoresEstimados === 'number' && valor.torcedoresEstimados > 0
    if (temNumero && !valor.torcedoresEstimadosFonte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['torcedoresEstimadosFonte'],
        message: 'Informe a fonte da estimativa.',
      })
    }
    if (temNumero && !valor.torcedoresEstimadosTipo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['torcedoresEstimadosTipo'],
        message: 'Informe o tipo da estimativa.',
      })
    }
    if (!temNumero && (valor.torcedoresEstimadosFonte || valor.torcedoresEstimadosTipo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['torcedoresEstimados'],
        message: 'Informe o número estimado ou limpe fonte e tipo.',
      })
    }
  })

/** Edição manda o registro inteiro (o form é completo), só acrescenta o id. */
export const ClubeEdicaoSchema = z.intersection(
  ClubeSchema,
  z.object({ id: z.string().uuid() }),
)

/**
 * Campos cuja ausência apaga funcionalidade. Ordem = prioridade na fila da aba
 * Qualidade. `filtro` casa com a opção homônima do filtro `completude` da
 * listagem (`LISTAGEM_SUPER_ADMIN_CLUBES`) — liga o card da aba Qualidade à
 * lista já filtrada, sem mapa paralelo na página.
 */
export const CAMPOS_COMPLETUDE_CLUBE = [
  {
    campo: 'slug',
    label: 'Slug',
    filtro: 'sem-slug',
    impacto: 'Sem slug os widgets Sofascore do clube não resolvem.',
  },
  {
    campo: 'serie',
    label: 'Série',
    filtro: 'sem-serie',
    impacto: 'Sem série não há tabela de classificação nacional.',
  },
  {
    campo: 'estado',
    label: 'UF',
    filtro: 'sem-uf',
    impacto: 'Sem UF o clube some do mapa do onboarding.',
  },
  {
    campo: 'escudoUrl',
    label: 'Escudo',
    filtro: 'sem-escudo',
    impacto: 'Sem escudo a seleção de clube fica sem identidade.',
  },
  {
    campo: 'cidade',
    label: 'Cidade',
    filtro: 'sem-cidade',
    impacto: 'Sem cidade a busca por praça fica incompleta.',
  },
  {
    campo: 'torcedoresEstimados',
    label: 'Torcedores estimados',
    filtro: 'sem-estimativa',
    impacto: 'Sem estimativa o dimensionamento de base digital não roda.',
  },
]

/**
 * Diagnóstico de cadastro. Puro — recebe o registro (ou um `select` com esses
 * campos) e devolve o que falta.
 * @param {{slug?: string|null, serie?: string|null, estado?: string|null, escudoUrl?: string|null, cidade?: string|null, torcedoresEstimados?: number|null}} clube
 * @returns {{completo: boolean, faltando: string[], percentual: number}}
 */
export function completudeClube(clube) {
  const faltando = CAMPOS_COMPLETUDE_CLUBE.filter(({ campo }) => {
    const valor = clube?.[campo]
    if (campo === 'torcedoresEstimados') return !(typeof valor === 'number' && valor > 0)
    return typeof valor !== 'string' || valor.trim() === ''
  }).map((c) => c.campo)

  const total = CAMPOS_COMPLETUDE_CLUBE.length
  return {
    completo: faltando.length === 0,
    faltando,
    percentual: Math.round(((total - faltando.length) / total) * 100),
  }
}

/**
 * Vínculos que impedem a exclusão definitiva. `Partida` e `Noticia` são
 * `onDelete: Cascade` na afiliação — apagar um clube com jogos apagaria o
 * histórico em silêncio. Por isso a exclusão só é liberada com tudo zerado;
 * o resto do tempo o caminho é arquivar.
 * @param {{tenants?: number, torcedores?: number, partidas?: number, noticias?: number, rivalidades?: number, torcidasConhecidas?: number}} contagens
 * @returns {{podeExcluir: boolean, bloqueios: {chave: string, label: string, total: number}[]}}
 */
export function bloqueiosExclusaoClube(contagens) {
  const mapa = [
    { chave: 'tenants', label: 'torcidas na plataforma' },
    { chave: 'torcedores', label: 'torcedores globais' },
    { chave: 'partidas', label: 'partidas' },
    { chave: 'noticias', label: 'notícias' },
    { chave: 'rivalidades', label: 'rivalidades' },
    { chave: 'torcidasConhecidas', label: 'torcidas do catálogo nacional' },
  ]
  const bloqueios = mapa
    .map(({ chave, label }) => ({ chave, label, total: contagens?.[chave] ?? 0 }))
    .filter((b) => b.total > 0)
  return { podeExcluir: bloqueios.length === 0, bloqueios }
}
