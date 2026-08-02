import { describe, expect, it } from 'vitest'
import { decidirPassoInicialConvite } from '@/lib/convite'

describe('decidirPassoInicialConvite', () => {
  it('uma sede → vínculo com essa unidade', () => {
    expect(
      decidirPassoInicialConvite({
        sedes: [{ id: 's1', tipo: 'SEDE' }],
        conviteDaSedeRaiz: true,
      }),
    ).toEqual({ unidadeId: 's1', passoInicial: 'vinculo' })
  })

  it('sede raiz com SEDE + SUBSEDE → vínculo na sede territorial', () => {
    expect(
      decidirPassoInicialConvite({
        sedes: [
          { id: 'sede', tipo: 'SEDE' },
          { id: 'campinas', tipo: 'SUBSEDE' },
        ],
        conviteDaSedeRaiz: true,
      }),
    ).toEqual({ unidadeId: 'sede', passoInicial: 'vinculo' })
  })

  it('unidade Caso B com várias sedes locais → ainda pede Unidade', () => {
    expect(
      decidirPassoInicialConvite({
        sedes: [
          { id: 'a', tipo: 'SEDE' },
          { id: 'b', tipo: 'PDE' },
        ],
        conviteDaSedeRaiz: false,
      }),
    ).toEqual({ unidadeId: null, passoInicial: 'unidade' })
  })

  it('sem sedes → vínculo (deixa o submit tratar)', () => {
    expect(
      decidirPassoInicialConvite({ sedes: [], conviteDaSedeRaiz: true }),
    ).toEqual({ unidadeId: null, passoInicial: 'vinculo' })
  })
})
