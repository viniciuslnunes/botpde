import { describe, expect, it } from 'vitest'
import {
  resolverEscopoComunidade,
  type ContextoComunidadePortal,
} from '@/lib/comunidade-contexto'
import { decidePodeVerCanal } from '@/lib/canais-shared'
import { tagSalasNacionais } from '@/lib/comunidade-cache'

const afiliacao = {
  id: 'af-1',
  nome: 'Sport Club Corinthians Paulista',
  apelido: 'Timão',
  slug: 'corinthians',
  escudoUrl: null,
}

function ctxTorcida(): ContextoComunidadePortal {
  return {
    modo: 'torcida',
    tenant: {
      id: 't-1',
      nome: 'Gaviões',
      afiliacaoId: 'af-1',
      logoUrl: null,
      corPrimaria: '#000',
      balancoFinanceiroVisivel: false,
    },
    afiliacao,
    tenantSintetico: { id: 'syn-1', corPrimaria: '#000', design: null },
    podeEscopoTorcida: true,
  }
}

function ctxNacional(): ContextoComunidadePortal {
  return {
    modo: 'nacional',
    tenant: null,
    afiliacao,
    tenantSintetico: { id: 'syn-1', corPrimaria: '#000', design: null },
    podeEscopoTorcida: false,
  }
}

describe('resolverEscopoComunidade', () => {
  it('sócio: default torcida; honra ?escopo=nacional', () => {
    const ctx = ctxTorcida()
    expect(resolverEscopoComunidade(ctx, undefined)).toBe('torcida')
    expect(resolverEscopoComunidade(ctx, 'torcida')).toBe('torcida')
    expect(resolverEscopoComunidade(ctx, 'nacional')).toBe('nacional')
  })

  it('torcedor: sempre nacional, mesmo com ?escopo=torcida', () => {
    const ctx = ctxNacional()
    expect(resolverEscopoComunidade(ctx, undefined)).toBe('nacional')
    expect(resolverEscopoComunidade(ctx, 'nacional')).toBe('nacional')
    expect(resolverEscopoComunidade(ctx, 'torcida')).toBe('nacional')
  })
})

describe('segregação de canais (decidePodeVerCanal)', () => {
  it('PUBLICO exige alcance comunidade; não-sócio nunca vê TENANT/HIERARQUIA/ALIADOS', () => {
    // CN lista PUBLICO por afiliação sem passar por esta função; no path
    // torcida, unrelated continua bloqueado (sem relação de tenant).
    expect(
      decidePodeVerCanal({ relation: 'unrelated', visibilidade: 'PUBLICO', isSocio: false }),
    ).toBe(false)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'PUBLICO', isSocio: false }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'self', visibilidade: 'TENANT', isSocio: false }),
    ).toBe(false)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'HIERARQUIA', isSocio: false }),
    ).toBe(false)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'ALIADOS', isSocio: false }),
    ).toBe(false)
  })

  it('sócio vê TENANT/HIERARQUIA/ALIADOS conforme relação', () => {
    expect(
      decidePodeVerCanal({ relation: 'self', visibilidade: 'TENANT', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'ancestor', visibilidade: 'HIERARQUIA', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'ALIADOS', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'unrelated', visibilidade: 'TENANT', isSocio: true }),
    ).toBe(false)
  })
})

describe('tagSalasNacionais', () => {
  it('chaveia cache por afiliação', () => {
    expect(tagSalasNacionais('af-1')).toContain('af-1')
  })
})
