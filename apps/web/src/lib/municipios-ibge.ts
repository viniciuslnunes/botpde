import 'server-only'
import { UFS_BRASIL } from '@/lib/onboarding'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import { CAPITAL_DA_UF } from '@/lib/regioes-brasil'
import MUNICIPIOS_POR_UF from '@/lib/data/municipios-brasil.json'

export type MunicipioBrasil = { cidade: string; uf: string }

/**
 * Malha municipal versionada no repo (`scripts/atualizar-municipios.mjs`), não
 * consultada em runtime.
 *
 * Antes cada busca do passo Região chamava a API do IBGE, com o resultado em
 * `unstable_cache` por 30 dias. Uma falha de rede era engolida como `[]` e
 * gravada no cache: a indisponibilidade de um instante virava "Nenhuma cidade
 * encontrada" permanente, e o onboarding parava. Como a malha muda a cada
 * poucos anos, o dado é referência — atualiza por deploy, não por requisição.
 */
const CIDADES_POR_UF: Record<string, string[]> = MUNICIPIOS_POR_UF

/** Municípios de uma UF. UF inválida → `[]`. Nunca falha: dado local. */
export async function listarMunicipiosPorUf(uf: string): Promise<string[]> {
  const ufUpper = uf.toUpperCase()
  if (!UFS_BRASIL.includes(ufUpper)) return []
  return CIDADES_POR_UF[ufUpper] ?? []
}

/** Índice nacional achatado (27 UFs × municípios). */
export async function listarMunicipiosBrasil(): Promise<MunicipioBrasil[]> {
  return UFS_BRASIL.flatMap((uf) =>
    (CIDADES_POR_UF[uf] ?? []).map((cidade) => ({ cidade, uf })),
  )
}

type RankedMunicipio = MunicipioBrasil & { rank: number; capital: boolean }

function ehCapital(m: MunicipioBrasil): boolean {
  const capital = CAPITAL_DA_UF[m.uf]
  return capital != null && normalizarTexto(capital) === normalizarTexto(m.cidade)
}

/**
 * Busca nacional de municípios por texto.
 * Ranking: 1º match exato, 2º começa com o termo, 3º contém o termo; resto descartado.
 * Dentro do mesmo tier a capital vem primeiro — sem isso "sao" devolve dezenas de
 * homônimos em ordem alfabética e São Paulo nem entra no limite. Depois, alfabético.
 *
 * Com `uf`, restringe à malha daquele estado (cadastro de clube / praça já escolhida).
 */
export async function buscarMunicipiosBrasil(
  query: string,
  limite = 20,
  uf?: string,
): Promise<MunicipioBrasil[]> {
  const alvo = normalizarTexto(query)
  if (alvo.length < 2) return []

  const ufUpper = uf?.trim().toUpperCase()
  const todos: MunicipioBrasil[] = ufUpper
    ? (await listarMunicipiosPorUf(ufUpper)).map((cidade) => ({ cidade, uf: ufUpper }))
    : await listarMunicipiosBrasil()
  if (todos.length === 0) return []

  const ranked: RankedMunicipio[] = []
  for (const m of todos) {
    const nome = normalizarTexto(m.cidade)
    let rank: number
    if (nome === alvo) rank = 1
    else if (nome.startsWith(alvo)) rank = 2
    else if (nome.includes(alvo)) rank = 3
    else continue
    ranked.push({ ...m, rank, capital: ehCapital(m) })
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.capital !== b.capital) return a.capital ? -1 : 1
    return a.cidade.localeCompare(b.cidade, 'pt-BR')
  })

  const resultado: MunicipioBrasil[] = ranked
    .slice(0, Math.max(0, limite))
    .map(({ cidade, uf: u }) => ({ cidade, uf: u }))
  return resultado
}

/**
 * Verifica se a cidade pertence à UF (comparação sem acentos/caixa) e devolve
 * o nome canônico do IBGE, ou `null` se não pertencer.
 */
export async function cidadePertenceUf(cidade: string, uf: string): Promise<string | null> {
  const municipios = await listarMunicipiosPorUf(uf)
  const alvo = normalizarTexto(cidade)
  return municipios.find((m) => normalizarTexto(m) === alvo) ?? null
}
