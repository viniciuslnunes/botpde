import { unstable_cache } from 'next/cache'
import { UFS_BRASIL } from '@/lib/onboarding'
import { normalizarTexto } from '@/lib/onboarding-unidade'

type MunicipioIbge = { nome: string }

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
 * Verifica se a cidade pertence à UF (comparação sem acentos/caixa) e devolve
 * o nome canônico do IBGE, ou `null` se não pertencer.
 */
export async function cidadePertenceUf(cidade: string, uf: string): Promise<string | null> {
  const municipios = await listarMunicipiosPorUf(uf)
  const alvo = normalizarTexto(cidade)
  return municipios.find((m) => normalizarTexto(m) === alvo) ?? null
}
