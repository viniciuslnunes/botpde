import { describe, expect, it } from 'vitest'
import { exigeDepartamentoDaSede } from '@/lib/onboarding-unidade'
import { departamentoSedeParaEspelho } from '@/lib/membros-sede'
import { areaPendenteDeEfetivacao } from '@/lib/area-efetivada'
import { resolverDepartamentoBadge } from '@/lib/autor-badges'

const SEDE = 'tenant-sede'
const UNIDADE = 'tenant-subsede-promovida'

describe('área na sede × área na unidade (onboarding)', () => {
  it('só pede departamento da sede quando a unidade tem portal próprio', () => {
    expect(exigeDepartamentoDaSede(UNIDADE, SEDE)).toBe(true)
  })

  it('não pede quando o sócio entra direto pela sede', () => {
    expect(exigeDepartamentoDaSede(SEDE, SEDE)).toBe(false)
  })

  it('não pede para unidade que não virou tenant (mesmo conjunto de áreas)', () => {
    // Subsede/PDE não promovida: `Sede.tenantId` é o da própria torcida.
    expect(exigeDepartamentoDaSede(SEDE, SEDE)).toBe(false)
    expect(exigeDepartamentoDaSede(null, SEDE)).toBe(false)
    expect(exigeDepartamentoDaSede(undefined, SEDE)).toBe(false)
    expect(exigeDepartamentoDaSede('   ', SEDE)).toBe(false)
  })
})

describe('propagação da área da sede para o espelho', () => {
  it('semeia o espelho novo com a área declarada na sede', () => {
    expect(departamentoSedeParaEspelho({ departamentoSedeId: 'dep-bateria-sede' }, null)).toEqual({
      departamentoId: 'dep-bateria-sede',
    })
  })

  it('nunca sobrescreve área já definida no espelho', () => {
    // A diretoria da Sede já decidiu; uma re-sincronização não pode reverter.
    expect(
      departamentoSedeParaEspelho(
        { departamentoSedeId: 'dep-bateria-sede' },
        { departamentoId: 'dep-carros-alegoricos' },
      ),
    ).toEqual({})
  })

  it('não mexe no espelho quando o sócio não declarou área na sede', () => {
    expect(departamentoSedeParaEspelho({ departamentoSedeId: null }, null)).toEqual({})
    expect(departamentoSedeParaEspelho({ departamentoSedeId: undefined }, null)).toEqual({})
  })
})

describe('área pretendida × área em vigor (first-wins não propaga área)', () => {
  it('marca pendente quando o outro nível aprovou e este ainda não efetivou', () => {
    // Sócio aprovado pela Sede: o vínculo já vale nos dois lados, mas a área da
    // unidade só entra em vigor quando a unidade decidir.
    expect(areaPendenteDeEfetivacao('dep-bateria-unidade', new Set())).toBe(true)
  })

  it('não marca pendente quando a área já está em vigor neste nível', () => {
    expect(areaPendenteDeEfetivacao('dep-bateria-unidade', new Set(['dep-bateria-unidade']))).toBe(
      false,
    )
  })

  it('área de outro nível não conta como efetivada aqui', () => {
    // Ids de departamento são por tenant: ter a área na sede não efetiva a da
    // unidade, nem o contrário.
    expect(areaPendenteDeEfetivacao('dep-bateria-unidade', new Set(['dep-bateria-sede']))).toBe(
      true,
    )
  })

  it('sem área pretendida não há o que efetivar', () => {
    expect(areaPendenteDeEfetivacao(null, new Set())).toBe(false)
    expect(areaPendenteDeEfetivacao(undefined, undefined)).toBe(false)
  })

  it('sem dados de efetivação carregados trata como pendente, não como em vigor', () => {
    // Conservador de propósito: melhor oferecer a ação (idempotente) do que
    // esconder uma área que nunca entrou em vigor.
    expect(areaPendenteDeEfetivacao('dep-bateria-unidade', undefined)).toBe(true)
  })
})

describe('badge resolve por tenant do post, não por usuário', () => {
  it('mostra a área da unidade a partir da preferência da linha de origem', () => {
    expect(
      resolverDepartamentoBadge({
        memberships: [],
        roleDepartamento: null,
        preferencia: 'Bateria',
      }),
    ).toBe('Bateria')
  })

  it('cargo real na unidade vence a preferência — gestor lá, membro na sede', () => {
    // Mesma pessoa, tenants diferentes: na unidade tem membership de área
    // efetivada; na sede só a preferência semeada no espelho.
    const naUnidade = resolverDepartamentoBadge({
      memberships: ['Bateria'],
      roleDepartamento: 'Bateria',
      preferencia: null,
    })
    const naSede = resolverDepartamentoBadge({
      memberships: [],
      roleDepartamento: null,
      preferencia: 'Bateria',
    })
    expect(naUnidade).toBe('Bateria')
    expect(naSede).toBe('Bateria')
  })

  it('sem área em nenhum dos lados o badge fica vazio', () => {
    expect(
      resolverDepartamentoBadge({ memberships: [], roleDepartamento: null, preferencia: null }),
    ).toBeNull()
  })
})
