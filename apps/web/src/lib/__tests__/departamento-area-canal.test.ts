import { describe, it, expect } from 'vitest'
import { validarVinculoCanalArea } from '@torcida/types'

describe('validarVinculoCanalArea', () => {
  it('null conversa = desvincular, sempre ok', () => {
    expect(
      validarVinculoCanalArea({
        conversaId: null,
        areaId: 'a1',
        usadoPorDepartamentoId: 'd1',
      }),
    ).toBeNull()
  })

  it('recusa canal de sede / departamento / outra área', () => {
    expect(
      validarVinculoCanalArea({
        conversaId: 'c1',
        areaId: 'a1',
        usadoPorSedeId: 's1',
      }),
    ).toMatch(/unidade/)
    expect(
      validarVinculoCanalArea({
        conversaId: 'c1',
        areaId: 'a1',
        usadoPorDepartamentoId: 'd1',
      }),
    ).toMatch(/departamento/)
    expect(
      validarVinculoCanalArea({
        conversaId: 'c1',
        areaId: 'a1',
        usadoPorAreaId: 'a2',
      }),
    ).toMatch(/outra área/)
  })

  it('permite re-vincular o mesmo canal à própria área', () => {
    expect(
      validarVinculoCanalArea({
        conversaId: 'c1',
        areaId: 'a1',
        usadoPorAreaId: 'a1',
      }),
    ).toBeNull()
  })
})
