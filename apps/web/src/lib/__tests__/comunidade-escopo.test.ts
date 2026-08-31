import { describe, expect, it } from 'vitest'
import {
  resolverBrandPorEscopo,
  resolverEscopoComunidadePorModo,
} from '@/lib/comunidade-escopo'
import {
  resolverEscopoComunidade,
  resolverTenantIdBuscaComunidade,
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
      slug: 'gavioes',
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
    unidade: {
      canalId: 'canal-1',
      tenantId: 't-1',
      tenantSlug: 'gavioes',
      nome: 'Subsede Jundiaí',
      logoUrl: null,
    },
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
      slug: 'furia-jovem',
      nome: 'Fúria Jovem',
      afiliacaoId: 'af-1',
      logoUrl: null,
      corPrimaria: '#000',
      balancoFinanceiroVisivel: false,
    },
    unidade: {
      canalId: 'canal-2',
      tenantId: 't-furia',
      tenantSlug: 'furia-jovem',
      nome: 'PDE Baixada',
      logoUrl: null,
    },
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

  it('unidade ativa (Caso B): default é o canal dela, não o da Sede', () => {
    // Quem selecionou a PDE no /admin — liderança da unidade ou operador da
    // plataforma — tem que cair no mural da PDE ao abrir a Comunidade.
    const ctx = { ...ctxSocioComUnidade(), tenantAtivoEhUnidade: true }
    expect(resolverEscopoComunidade(ctx, undefined)).toBe('unidade')
    // As outras abas continuam alcançáveis pela query.
    expect(resolverEscopoComunidade(ctx, 'torcida')).toBe('torcida')
    expect(resolverEscopoComunidade(ctx, 'nacional')).toBe('nacional')
  })

  it('unidade ativa sem aba de unidade cai na torcida (nunca quebra)', () => {
    const ctx = { ...ctxTorcida(), tenantAtivoEhUnidade: true }
    expect(resolverEscopoComunidade(ctx, undefined)).toBe('torcida')
  })

  it('Sede ativa mantém o default na torcida mesmo tendo unidade', () => {
    const ctx = ctxSocioComUnidade()
    expect(resolverEscopoComunidade(ctx, undefined)).toBe('torcida')
  })

  it('typeahead: sócio/operador na PDE busca no portal ativo, não na CN', () => {
    const ctx = { ...ctxSocioComUnidade(), tenantAtivoEhUnidade: true }
    expect(resolverTenantIdBuscaComunidade(ctx, 'unidade')).toBe('t-1')
    expect(resolverTenantIdBuscaComunidade(ctx, 'torcida')).toBe('t-1')
    expect(resolverTenantIdBuscaComunidade(ctx, 'nacional')).toBe('syn-1')
  })

  it('typeahead: torcedor na CN busca no sintético; na unidade, na TO do convite', () => {
    const ctx = ctxTorcedorComUnidade()
    expect(resolverTenantIdBuscaComunidade(ctx, 'nacional')).toBe('syn-1')
    expect(resolverTenantIdBuscaComunidade(ctx, 'unidade')).toBe('t-furia')
  })

  it('por modo: TORCEDOR sem query fica nacional; sócio sem query fica torcida', () => {
    const so = { torcida: true, unidade: false }
    expect(resolverEscopoComunidadePorModo('nacional', so, null)).toBe('nacional')
    expect(resolverEscopoComunidadePorModo('nacional', so, 'torcida')).toBe('torcida')
    expect(resolverEscopoComunidadePorModo('torcida', so, null)).toBe('torcida')
    expect(resolverEscopoComunidadePorModo('torcida', so, 'nacional')).toBe('nacional')
  })

  it('por modo: unidade ativa muda o default só do sócio, nunca do TORCEDOR', () => {
    const comUnidade = { torcida: true, unidade: true }
    const opts = { tenantAtivoEhUnidade: true }
    expect(resolverEscopoComunidadePorModo('torcida', comUnidade, null, opts)).toBe('unidade')
    // TORCEDOR continua abrindo na praça nacional do clube.
    expect(
      resolverEscopoComunidadePorModo('nacional', { torcida: false, unidade: true }, null, opts),
    ).toBe('nacional')
  })
})

describe('resolverBrandPorEscopo', () => {
  const fontes = {
    afiliacao: { nome: 'Sport Club Corinthians Paulista', apelido: 'Timão', escudoUrl: '/tim.png' },
    torcidaReal: { nome: 'Gaviões', corPrimaria: '#111', logoUrl: '/gav.png' },
    unidade: { nome: 'Fiel São Vicente', logoUrl: '/fsv.png' },
    corPrimariaNacional: '#000',
  }

  it('cada escopo devolve a própria marca', () => {
    expect(resolverBrandPorEscopo('nacional', fontes)).toEqual({
      nome: 'Timão',
      corPrimaria: '#000',
      logoUrl: '/tim.png',
    })
    expect(resolverBrandPorEscopo('torcida', fontes)).toEqual({
      nome: 'Gaviões',
      corPrimaria: '#111',
      logoUrl: '/gav.png',
    })
    // Unidade herda a cor da torcida — ela não tem paleta própria.
    expect(resolverBrandPorEscopo('unidade', fontes)).toEqual({
      nome: 'Fiel São Vicente',
      corPrimaria: '#111',
      logoUrl: '/fsv.png',
    })
  })

  it('escopo sem fonte devolve null (chamador cai no tenant do layout)', () => {
    expect(resolverBrandPorEscopo('unidade', { ...fontes, unidade: null })).toBeNull()
    expect(resolverBrandPorEscopo('torcida', { ...fontes, torcidaReal: null })).toBeNull()
    expect(resolverBrandPorEscopo('nacional', { ...fontes, afiliacao: null })).toBeNull()
  })

  it('unidade sem torcida cai na cor nacional em vez de ficar sem marca', () => {
    expect(
      resolverBrandPorEscopo('unidade', { ...fontes, torcidaReal: null }),
    ).toEqual({ nome: 'Fiel São Vicente', corPrimaria: '#000', logoUrl: '/fsv.png' })
  })

  it('cookie de escopo nunca concede aba: passa pelo resolver antes da marca', () => {
    // O layout resolve o cookie contra os escopos reais — torcedor com
    // `comunidade_escopo=torcida` gravado cai em nacional, e a marca segue.
    const escoposTorcedor = { torcida: false, unidade: true }
    const escopo = resolverEscopoComunidadePorModo('nacional', escoposTorcedor, 'torcida')
    expect(escopo).toBe('nacional')
    expect(resolverBrandPorEscopo(escopo, fontes)?.nome).toBe('Timão')
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
