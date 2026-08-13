import { describe, expect, it, vi } from 'vitest'

// `@/lib/onboarding` puxa `@/lib/tenant` → env validation, indisponível no teste.
// Só a constante de UFs é usada por municipios-ibge.
vi.mock('@/lib/onboarding', () => ({
  UFS_BRASIL: [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
  ],
}))

import {
  listarMunicipiosPorUf,
  listarMunicipiosBrasil,
  cidadePertenceUf,
  buscarMunicipiosBrasil,
} from '@/lib/municipios-ibge'

// A malha vem do JSON versionado (`scripts/atualizar-municipios.mjs`), não de
// rede: os testes rodam contra o dado real que a produção usa.
describe('malha municipal embutida', () => {
  it('cobre as 27 UFs com a contagem oficial', async () => {
    const todos = await listarMunicipiosBrasil()
    const ufs = new Set(todos.map((m) => m.uf))
    expect(ufs.size).toBe(27)
    // 5.570 municípios + Fernando de Noronha (distrito estadual que o IBGE lista).
    expect(todos.length).toBeGreaterThanOrEqual(5500)
  })

  it('não consulta a rede', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await listarMunicipiosPorUf('SP')
    await buscarMunicipiosBrasil('praia')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('listarMunicipiosPorUf', () => {
  it('retorna os municípios da UF', async () => {
    const cidades = await listarMunicipiosPorUf('SP')
    expect(cidades).toContain('São Paulo')
    expect(cidades).toContain('Praia Grande')
    expect(cidades).not.toContain('Curitiba')
  })

  it('normaliza a UF para maiúsculas', async () => {
    expect(await listarMunicipiosPorUf('pr')).toContain('Curitiba')
  })

  it('retorna [] para UF inválida', async () => {
    expect(await listarMunicipiosPorUf('XX')).toEqual([])
  })
})

describe('cidadePertenceUf', () => {
  it('acha a cidade ignorando acentos e caixa, retornando o nome canônico', async () => {
    expect(await cidadePertenceUf('sao paulo', 'SP')).toBe('São Paulo')
    expect(await cidadePertenceUf('  PRAIA GRANDE  ', 'SP')).toBe('Praia Grande')
  })

  it('retorna null quando a cidade não pertence à UF', async () => {
    expect(await cidadePertenceUf('Curitiba', 'SP')).toBeNull()
  })

  it('retorna null quando a UF é inválida', async () => {
    expect(await cidadePertenceUf('Santos', 'ZZ')).toBeNull()
  })
})

describe('buscarMunicipiosBrasil', () => {
  // O caso do bug: "Praia G" não achava nada porque a lista vinha vazia da rede.
  it('acha por prefixo parcial digitado no combobox', async () => {
    const r = await buscarMunicipiosBrasil('Praia G')
    expect(r).toContainEqual({ cidade: 'Praia Grande', uf: 'SP' })
  })

  it('prioriza match exato', async () => {
    const r = await buscarMunicipiosBrasil('Santos')
    expect(r[0]).toEqual({ cidade: 'Santos', uf: 'SP' })
  })

  it('descarta query com menos de 2 caracteres', async () => {
    expect(await buscarMunicipiosBrasil('s')).toEqual([])
  })

  it('respeita o limite', async () => {
    expect((await buscarMunicipiosBrasil('sao', 5)).length).toBe(5)
  })

  it('coloca as capitais antes dos homônimos do mesmo tier', async () => {
    // Sem isso, "sao" devolve dezenas de homônimos em ordem alfabética e as
    // capitais (São Paulo, São Luís) nem entram no limite de 20.
    const r = await buscarMunicipiosBrasil('sao')
    expect(r.slice(0, 2)).toEqual([
      { cidade: 'São Luís', uf: 'MA' },
      { cidade: 'São Paulo', uf: 'SP' },
    ])
  })

  it('restringe à UF quando informada', async () => {
    const r = await buscarMunicipiosBrasil('sao', 20, 'PR')
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((m) => m.uf === 'PR')).toBe(true)
  })
})
