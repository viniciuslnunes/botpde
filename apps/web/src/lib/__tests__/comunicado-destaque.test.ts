import { describe, expect, it } from 'vitest'
import { escolherComunicadoDestaque, type ComunicadoDestacavel } from '@/lib/comunicado-destaque'

function comunicado(overrides: Partial<ComunicadoDestacavel> = {}): ComunicadoDestacavel {
  return {
    id: 'a1',
    titulo: 'Título',
    corpo: 'Corpo',
    prioridade: 'NORMAL',
    fixado: false,
    lido: false,
    ...overrides,
  }
}

describe('escolherComunicadoDestaque', () => {
  it('destaca URGENTE não lido', () => {
    const destaque = escolherComunicadoDestaque([comunicado({ prioridade: 'URGENTE' })])
    expect(destaque?.id).toBe('a1')
  })

  it('destaca IMPORTANTE não lido', () => {
    const destaque = escolherComunicadoDestaque([comunicado({ prioridade: 'IMPORTANTE' })])
    expect(destaque?.id).toBe('a1')
  })

  it('destaca NORMAL fixado não lido', () => {
    const destaque = escolherComunicadoDestaque([comunicado({ fixado: true })])
    expect(destaque?.id).toBe('a1')
  })

  it('NÃO destaca NORMAL sem fixação (vai só pro widget/feed)', () => {
    expect(escolherComunicadoDestaque([comunicado()])).toBeNull()
  })

  it('NÃO destaca comunicado já lido, mesmo urgente', () => {
    expect(
      escolherComunicadoDestaque([comunicado({ prioridade: 'URGENTE', lido: true })]),
    ).toBeNull()
  })

  it('NÃO destaca sem estado de leitura (usuário deslogado, lido undefined)', () => {
    expect(
      escolherComunicadoDestaque([comunicado({ prioridade: 'URGENTE', lido: undefined })]),
    ).toBeNull()
  })

  it('respeita a ordem do feed: primeiro relevante não lido vence', () => {
    const destaque = escolherComunicadoDestaque([
      comunicado({ id: 'lido-urgente', prioridade: 'URGENTE', lido: true }),
      comunicado({ id: 'normal-solto' }),
      comunicado({ id: 'importante-novo', prioridade: 'IMPORTANTE' }),
      comunicado({ id: 'urgente-novo-depois', prioridade: 'URGENTE' }),
    ])
    expect(destaque?.id).toBe('importante-novo')
  })

  it('lista vazia → null', () => {
    expect(escolherComunicadoDestaque([])).toBeNull()
  })
})
