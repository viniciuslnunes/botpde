import { describe, expect, it } from 'vitest'
import { resolverEscopoComunidadePorModo } from '@/lib/comunidade-escopo'
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
    escopos: { torcida: true, unidade: false },
  }
}

/** Sócio vinculado a uma subsede/PDE: tem as três abas. */
function ctxSocioComUnidade(): ContextoComunidadePortal {
  const base = ctxTorcida()
  return {
    ...base,
    escopos: { torcida: true, unidade: true },
    unidade: { canalId: 'canal-1', tenantId: 't-1', nome: 'Subsede Jundiaí' },
  }
}

function ctxNacional(): ContextoComunidadePortal {
  return {
    modo: 'nacional',
    tenant: null,
    afiliacao,
    tenantSintetico: { id: 'syn-1', corPrimaria: '#000', design: null },
    escopos: { torcida: false, unidade: false },
    torcidaReal: null,
  }
}

function ctxTorcedorComUnidade(): ContextoComunidadePortal {
  return {
    modo: 'nacional',
    tenant: null,
    afiliacao,
    tenantSintetico: { id: 'syn-1', corPrimaria: '#000', design: null },
    // Torcedor NÃO tem a aba da torcida — ele pertence à unidade que o
    // convidou, e não pode estar no canal da Sede.
    escopos: { torcida: false, unidade: true },
    torcidaReal: {
      id: 't-furia',
      nome: 'Fúria Jovem',
      afiliacaoId: 'af-1',
      logoUrl: null,
      corPrimaria: '#000',
      balancoFinanceiroVisivel: false,
    },
    unidade: { canalId: 'canal-2', tenantId: 't-furia', nome: 'PDE Baixada' },
  }
}

describe('resolverEscopoComunidade', () => {
  it('sócio: default torcida; honra ?escopo=nacional', () => {
    const ctx = ctxTorcida()
    expect(resolverEscopoComunidade(ctx, undefined)).toBe('torcida')
    expect(resolverEscopoComunidade(ctx, 'torcida')).toBe('torcida')
    expect(resolverEscopoComunidade(ctx, 'nacional')).toBe('nacional')
  })

  it('torcedor global: sempre nacional, mesmo com ?escopo=torcida', () => {
    const ctx = ctxNacional()
    expect(resolverEscopoComunidade(ctx, undefined)).toBe('nacional')
    expect(resolverEscopoComunidade(ctx, 'nacional')).toBe('nacional')
    expect(resolverEscopoComunidade(ctx, 'torcida')).toBe('nacional')
  })

  it('torcedor com unidade: default nacional; honra ?escopo=unidade', () => {
    const ctx = ctxTorcedorComUnidade()
    expect(resolverEscopoComunidade(ctx, undefined)).toBe('nacional')
    expect(resolverEscopoComunidade(ctx, 'nacional')).toBe('nacional')
    expect(resolverEscopoComunidade(ctx, 'unidade')).toBe('unidade')
  })

  it('torcedor NUNCA entra no escopo da torcida, nem forçando a query', () => {
    // A aba da organizada é de sócio. Torcedor pertence à unidade que o
    // convidou e não pode estar inscrito no canal da Sede.
    const ctx = ctxTorcedorComUnidade()
    expect(resolverEscopoComunidade(ctx, 'torcida')).toBe('nacional')
  })

  it('sócio com unidade: alterna entre os três escopos', () => {
    const ctx = ctxSocioComUnidade()
    expect(resolverEscopoComunidade(ctx, undefined)).toBe('torcida')
    expect(resolverEscopoComunidade(ctx, 'nacional')).toBe('nacional')
    expect(resolverEscopoComunidade(ctx, 'unidade')).toBe('unidade')
  })

  it('escopo indisponível cai no default em vez de quebrar', () => {
    // Link colado de outra conta não pode dar erro na cara de quem abriu.
    const semUnidade = ctxTorcida()
    expect(resolverEscopoComunidade(semUnidade, 'unidade')).toBe('torcida')
    expect(resolverEscopoComunidade(ctxNacional(), 'unidade')).toBe('nacional')
    expect(resolverEscopoComunidade(semUnidade, 'lixo')).toBe('torcida')
  })

  it('por modo: TORCEDOR sem query fica nacional; sócio sem query fica torcida', () => {
    const so = { torcida: true, unidade: false }
    expect(resolverEscopoComunidadePorModo('nacional', so, null)).toBe('nacional')
    expect(resolverEscopoComunidadePorModo('nacional', so, 'torcida')).toBe('torcida')
    expect(resolverEscopoComunidadePorModo('torcida', so, null)).toBe('torcida')
    expect(resolverEscopoComunidadePorModo('torcida', so, 'nacional')).toBe('nacional')
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
