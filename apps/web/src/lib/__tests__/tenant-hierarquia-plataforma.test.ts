import { describe, expect, it } from 'vitest'
import {
  filtrarTenantsRaiz,
  paraTenantRaiz,
} from '@/lib/tenant-hierarquia-plataforma'

describe('filtrarTenantsRaiz', () => {
  it('remove portais Caso B (filhos do mapa mãe)', () => {
    const maePorFilho = new Map([
      ['fiel-sao-vicente', 'pde-gavioes-fiel'],
      ['subsede-rio-claro', 'pde-gavioes-fiel'],
    ])
    expect(
      filtrarTenantsRaiz(
        ['pde-gavioes-fiel', 'fiel-sao-vicente', 'outra-torcida', 'subsede-rio-claro'],
        maePorFilho,
      ),
    ).toEqual(['pde-gavioes-fiel', 'outra-torcida'])
  })

  it('preserva a ordem dos ids', () => {
    const maePorFilho = new Map([['b', 'a']])
    expect(filtrarTenantsRaiz(['c', 'a', 'b', 'd'], maePorFilho)).toEqual(['c', 'a', 'd'])
  })

  it('devolve todos se o mapa estiver vazio', () => {
    expect(filtrarTenantsRaiz(['a', 'b'], new Map())).toEqual(['a', 'b'])
  })
})

describe('paraTenantRaiz', () => {
  it('sobe portal filho para a mãe', () => {
    const maePorFilho = new Map([['filho', 'mae']])
    expect(paraTenantRaiz('filho', maePorFilho)).toBe('mae')
    expect(paraTenantRaiz('mae', maePorFilho)).toBe('mae')
  })
})
