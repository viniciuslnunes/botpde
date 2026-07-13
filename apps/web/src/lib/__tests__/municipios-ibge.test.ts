import { beforeEach, describe, expect, it, vi } from 'vitest'

// `unstable_cache` não funciona fora do runtime Next.js — passthrough no teste.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

// `@/lib/onboarding` puxa `@/lib/tenant` → env validation, indisponível no teste.
// Só a constante de UFs é usada por municipios-ibge.
vi.mock('@/lib/onboarding', () => ({
  UFS_BRASIL: ['SP', 'PR', 'RJ'],
}))

import { listarMunicipiosPorUf, cidadePertenceUf } from '@/lib/municipios-ibge'

function mockFetchOk(nomes: string[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => nomes.map((nome) => ({ nome })),
  })
}

describe('listarMunicipiosPorUf', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna os nomes dos municípios da UF', async () => {
    const fetchMock = mockFetchOk(['Santos', 'São Paulo', 'São Vicente'])
    vi.stubGlobal('fetch', fetchMock)

    const cidades = await listarMunicipiosPorUf('SP')
    expect(cidades).toEqual(['Santos', 'São Paulo', 'São Vicente'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios?orderBy=nome',
    )
  })

  it('normaliza a UF para maiúsculas', async () => {
    const fetchMock = mockFetchOk(['Curitiba'])
    vi.stubGlobal('fetch', fetchMock)

    const cidades = await listarMunicipiosPorUf('pr')
    expect(cidades).toEqual(['Curitiba'])
    expect(fetchMock.mock.calls[0][0]).toContain('/estados/PR/')
  })

  it('retorna [] para UF inválida sem chamar fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await listarMunicipiosPorUf('XX')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorna [] quando a resposta HTTP não é ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await listarMunicipiosPorUf('RJ')).toEqual([])
  })

  it('retorna [] quando o fetch lança erro de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await listarMunicipiosPorUf('RJ')).toEqual([])
  })
})

describe('cidadePertenceUf', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('acha a cidade ignorando acentos e caixa, retornando o nome canônico', async () => {
    vi.stubGlobal('fetch', mockFetchOk(['Santos', 'São Paulo', 'São Vicente']))
    expect(await cidadePertenceUf('sao paulo', 'SP')).toBe('São Paulo')
    expect(await cidadePertenceUf('  SÃO VICENTE  ', 'SP')).toBe('São Vicente')
  })

  it('retorna null quando a cidade não pertence à UF', async () => {
    vi.stubGlobal('fetch', mockFetchOk(['Santos', 'São Paulo']))
    expect(await cidadePertenceUf('Curitiba', 'SP')).toBeNull()
  })

  it('retorna null quando a UF é inválida', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect(await cidadePertenceUf('Santos', 'ZZ')).toBeNull()
  })
})
