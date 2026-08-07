/** Tipos e rótulos de torcida — seguros para Client Components (sem next/headers). */

import { formatNomeAfiliacao, formatNomeTorcida, nomeExibicaoAfiliacao } from '@torcida/types'

export type TorcidaOpcao = {
  id: string
  slug: string
  nome: string
  corPrimaria: string
  /** FK do clube (`Afiliacao`) — filtro do switcher em cascata. */
  afiliacaoId: string | null
  /** Clube (afiliação), para distinguir homônimas — ex. várias "Camisa 12". */
  clubeNome: string | null
  /** UF do clube (ex. SP), quando disponível. */
  clubeUf: string | null
}

/** Clube (`Afiliacao`) para o select de super-admin. */
export type ClubeOpcao = {
  id: string
  nome: string
  apelido: string | null
  estado: string | null
}

/** Unidade da worktree (Sede Caso A ou tenant Caso B) para o 3º select. */
export type UnidadeOpcao = {
  id: string
  sedeId: string | null
  tenantId: string
  tenantSlug: string
  nome: string
  tipo: string
  cidade: string | null
  depth: number
  origem: 'sede' | 'tenant'
}

const TIPO_UNIDADE_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

export function labelClubeOpcao(c: Pick<ClubeOpcao, 'nome' | 'apelido' | 'estado'>): string {
  const nome = nomeExibicaoAfiliacao(c)
  return c.estado ? `${nome} (${c.estado})` : nome
}

export function labelTipoUnidade(tipo: string): string {
  return TIPO_UNIDADE_LABEL[tipo] ?? tipo
}

/**
 * Palavras que só classificam a unidade (não a identificam). Usadas para
 * decidir se o nome da unidade repete a torcida — "Sede — Camisa 12" ao lado de
 * "CAMISA 12" não acrescenta nada — e para não prefixar o tipo duas vezes
 * ("PDE PDE Fiel Baixada").
 */
const TOKENS_TIPO_UNIDADE = new Set([
  'sede',
  'subsede',
  'sub',
  'pde',
  'ponto',
  'encontro',
  'unidade',
  'de',
  'do',
  'da',
])

function tokensNome(valor: string): string[] {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Remove tokens de tipo/ligação das pontas — o miolo é o que identifica. */
function miolo(tokens: string[]): string[] {
  let ini = 0
  let fim = tokens.length
  while (ini < fim && TOKENS_TIPO_UNIDADE.has(tokens[ini]!)) ini += 1
  while (fim > ini && TOKENS_TIPO_UNIDADE.has(tokens[fim - 1]!)) fim -= 1
  return tokens.slice(ini, fim)
}

/**
 * Dois rótulos nomeiam a mesma coisa? Comparação conservadora: normaliza
 * (caixa, acento, pontuação) e, se ainda diferirem, compara o miolo — só
 * tokens de tipo/ligação saem das pontas, então nada que identifique de fato
 * é descartado ("PDE Praia Grande" nunca vira "Gaviões da Fiel").
 */
export function nomesEquivalentes(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const primeiro = a?.trim()
  const segundo = b?.trim()
  if (!primeiro || !segundo) return false
  const tokensA = tokensNome(primeiro)
  const tokensB = tokensNome(segundo)
  if (tokensA.length === 0) return true
  if (tokensA.join(' ') === tokensB.join(' ')) return true
  const mioloA = miolo(tokensA)
  if (mioloA.length === 0) return true
  return mioloA.join(' ') === miolo(tokensB).join(' ')
}

/**
 * A unidade repete a torcida? Vale para unidade promovida a tenant próprio
 * (Caso B — mesmo nome nos dois) e para a Sede raiz criada como
 * "Sede — <Torcida>".
 */
export function unidadeRepeteTorcida(
  unidadeNome: string | null | undefined,
  torcidaNome: string | null | undefined,
): boolean {
  return nomesEquivalentes(unidadeNome, torcidaNome)
}

/**
 * Rótulo de unidade ao lado do nome da torcida: `null` quando repete a torcida,
 * senão o nome com o tipo à frente — sem duplicar o tipo que já está no nome.
 */
export function formatUnidadeLabel(args: {
  nome: string | null | undefined
  tipo?: string | null
  torcidaNome?: string | null
}): string | null {
  const nome = args.nome?.trim() || null
  if (!nome) return null
  if (unidadeRepeteTorcida(nome, args.torcidaNome)) return null
  if (!args.tipo) return nome
  const primeiro = tokensNome(nome)[0]
  if (primeiro && TOKENS_TIPO_UNIDADE.has(primeiro)) return nome
  return `${labelTipoUnidade(args.tipo)} ${nome}`
}

export function labelUnidadeSub(u: Pick<UnidadeOpcao, 'tipo' | 'cidade'>): string {
  const tipo = labelTipoUnidade(u.tipo)
  return u.cidade ? `${tipo} · ${u.cidade}` : tipo
}

/** "CORINTHIANS (SP)" — subtítulo / busca. */
export function labelClubeComUf(
  t: Pick<TorcidaOpcao, 'clubeNome' | 'clubeUf'>,
): string | null {
  if (!t.clubeNome) return null
  const clube = formatNomeAfiliacao(t.clubeNome)
  return t.clubeUf ? `${clube} (${t.clubeUf})` : clube
}

/** Rótulo "TORCIDA — CLUBE (UF)" para listagens e combobox. */
export function labelTorcidaComClube(
  t: Pick<TorcidaOpcao, 'nome' | 'clubeNome' | 'clubeUf'>,
): string {
  const nome = formatNomeTorcida(t.nome)
  const clube = labelClubeComUf(t)
  return clube ? `${nome} — ${clube}` : nome
}
