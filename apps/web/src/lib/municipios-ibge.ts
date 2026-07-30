import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { UFS_BRASIL } from '@/lib/onboarding'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import { CAPITAL_DA_UF } from '@/lib/regioes-brasil'

type MunicipioIbge = { nome: string }

export type MunicipioBrasil = { cidade: string; uf: string }

/**
 * Lista os municípios de uma UF via API de localidades do IBGE.
 * Cache de 30 dias por UF (a malha municipal muda raramente).
 * Em UF inválida ou falha de rede/HTTP retorna `[]` — nunca lança.
 */
export async function listarMunicipiosPorUf(uf: string): Promise<string[]> {
  const ufUpper = uf.toUpperCase()
  if (!UFS_BRASIL.includes(ufUpper)) return []

  return unstable_cache(
    async (): Promise<string[]> => {
      try {
        const res = await fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufUpper}/municipios?orderBy=nome`,
        )
        if (!res.ok) return []
        const municipios = (await res.json()) as MunicipioIbge[]
        return municipios.map((m) => m.nome)
      } catch {
        return []
      }
    },
    ['municipios-uf', ufUpper],
    { revalidate: 2592000, tags: [`municipios-uf-${ufUpper}`] },
  )()
}

/**
 * Índice nacional achatado (27 UFs × municípios), reaproveitando o cache por UF.
 * `unstable_cache` (30 dias) + `cache` do React (dedupe por request). Nunca lança.
 */
export const listarMunicipiosBrasil = cache(async (): Promise<MunicipioBrasil[]> => {
  return unstable_cache(
    async (): Promise<MunicipioBrasil[]> => {
      try {
        const porUf: MunicipioBrasil[][] = await Promise.all(
          UFS_BRASIL.map(async (uf): Promise<MunicipioBrasil[]> => {
            const cidades: string[] = await listarMunicipiosPorUf(uf)
            return cidades.map((cidade) => ({ cidade, uf }))
          }),
        )
        return porUf.flat()
      } catch {
        return []
      }
    },
    ['municipios-brasil'],
    { revalidate: 2592000, tags: ['municipios-brasil'] },
  )()
})

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
 */
export async function buscarMunicipiosBrasil(
  query: string,
  limite = 20,
): Promise<MunicipioBrasil[]> {
  const alvo = normalizarTexto(query)
  if (alvo.length < 2) return []

  const todos: MunicipioBrasil[] = await listarMunicipiosBrasil()
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
    .map(({ cidade, uf }) => ({ cidade, uf }))
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
