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

import {
  listarMunicipiosPorUf,
  cidadePertenceUf,
  buscarMunicipiosBrasil,
} from '@/lib/municipios-ibge'

function mockFetchOk(nomes: string[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => nomes.map((nome) => ({ nome })),
  })
}

/** Responde por UF no path da URL (mock do índice nacional). */
function mockFetchPorUf(mapa: Record<string, string[]>) {
  return vi.fn().mockImplementation(async (url: string) => {
    const match = /\/estados\/([A-Z]{2})\//.exec(url)
    const uf = match?.[1] ?? ''
    const nomes = mapa[uf] ?? []
    return {
      ok: true,
      json: async () => nomes.map((nome) => ({ nome })),
    }
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

describe('buscarMunicipiosBrasil', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'fetch',
      mockFetchPorUf({
        SP: ['Santos', 'São Paulo', 'São Vicente'],
        PR: ['Curitiba', 'São José dos Pinhais'],
        RJ: ['Rio de Janeiro', 'São Gonçalo'],
      }),
    )
  })

  it('ranqueia match exato antes de prefixo e contém', async () => {
    const r = await buscarMunicipiosBrasil('sao')
    expect(r.every((m) => /são/i.test(m.cidade))).toBe(true)
    expect(r[0]?.cidade).toMatch(/^São/)
  })

  it('prioriza match exato', async () => {
    const r = await buscarMunicipiosBrasil('Santos')
    expect(r[0]).toEqual({ cidade: 'Santos', uf: 'SP' })
  })

  it('descarta query com menos de 2 caracteres', async () => {
    expect(await buscarMunicipiosBrasil('s')).toEqual([])
  })

  it('inclui a UF em cada resultado', async () => {
    const r = await buscarMunicipiosBrasil('Curitiba')
    expect(r).toContainEqual({ cidade: 'Curitiba', uf: 'PR' })
  })

  it('coloca a capital antes de homônimos do mesmo tier', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchPorUf({
        // Alfabeticamente "São Bernardo" viria antes — só a regra de capital inverte.
        SP: ['São Bernardo do Campo', 'São Caetano do Sul', 'São Paulo'],
        PR: [],
        RJ: [],
      }),
    )

    const r = await buscarMunicipiosBrasil('sao')
    expect(r[0]).toEqual({ cidade: 'São Paulo', uf: 'SP' })
  })
})
