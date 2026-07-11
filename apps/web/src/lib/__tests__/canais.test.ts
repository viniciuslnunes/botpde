import { describe, expect, it } from 'vitest'
import {
  isConversaGrupoLike,
  labelTipoUnidade,
  labelVisibilidadeCanal,
  linkUnidadeComunidade,
  linkCanalComunidade,
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
  })
})
