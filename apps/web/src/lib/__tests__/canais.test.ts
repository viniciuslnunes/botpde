import { describe, expect, it } from 'vitest'
import {
  decidePodeVerCanal,
  isConversaGrupoLike,
  labelTipoUnidade,
  labelVisibilidadeCanal,
  linkUnidadeComunidade,
  linkCanalComunidade,
  linkTorcidaComunidadePublica,
} from '../canais-shared'

describe('canais', () => {
  it('identifica conversas de grupo e canal', () => {
    expect(isConversaGrupoLike('GRUPO')).toBe(true)
    expect(isConversaGrupoLike('CANAL')).toBe(true)
    expect(isConversaGrupoLike('DIRETA')).toBe(false)
  })

  it('formata tipo de unidade', () => {
    expect(labelTipoUnidade('SEDE')).toBe('Sede')
    expect(labelTipoUnidade('SUBSEDE')).toBe('Subsede')
    expect(labelTipoUnidade('PONTO_ENCONTRO')).toBe('PDE')
  })

  it('formata visibilidade de canal', () => {
    expect(labelVisibilidadeCanal('HIERARQUIA')).toContain('Hierarquia')
    expect(labelVisibilidadeCanal('ALIADOS')).toContain('aliados')
  })

  it('gera links de navegação', () => {
    expect(linkUnidadeComunidade('abc')).toBe('/portal/comunidade/unidade/abc')
    expect(linkCanalComunidade('xyz')).toBe('/portal/comunidade/canais/xyz')
    expect(linkTorcidaComunidadePublica('abc')).toBe('/portal/comunidade/torcida/abc')
  })
})

describe('decidePodeVerCanal', () => {
  it('PUBLICO: sócio e torcedor no alcance comunidade', () => {
    expect(
      decidePodeVerCanal({ relation: 'self', visibilidade: 'PUBLICO', isSocio: false }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'PUBLICO', isSocio: false }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'unrelated', visibilidade: 'PUBLICO', isSocio: true }),
    ).toBe(false)
    expect(
      decidePodeVerCanal({ relation: 'rival', visibilidade: 'PUBLICO', isSocio: true }),
    ).toBe(false)
  })

  it('TENANT/HIERARQUIA/ALIADOS: exige sócio mesmo no self', () => {
    expect(
      decidePodeVerCanal({ relation: 'self', visibilidade: 'HIERARQUIA', isSocio: false }),
    ).toBe(false)
    expect(
      decidePodeVerCanal({ relation: 'self', visibilidade: 'TENANT', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'TENANT', isSocio: true }),
    ).toBe(false)
  })

  it('HIERARQUIA: hierarquia mas não aliados', () => {
    expect(
      decidePodeVerCanal({ relation: 'descendant', visibilidade: 'HIERARQUIA', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'ancestor', visibilidade: 'HIERARQUIA', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'HIERARQUIA', isSocio: true }),
    ).toBe(false)
  })

  it('ALIADOS: hierarquia + aliados', () => {
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'ALIADOS', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'descendant', visibilidade: 'ALIADOS', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'ALIADOS', isSocio: false }),
    ).toBe(false)
  })
})
