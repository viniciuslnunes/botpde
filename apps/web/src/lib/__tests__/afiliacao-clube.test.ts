import { describe, expect, it } from 'vitest'
import {
  CAMPOS_COMPLETUDE_CLUBE,
  ClubeSchema,
  apelidoClube,
  bloqueiosExclusaoClube,
  completudeClube,
  rotuloSerieClube,
  slugClube,
} from '@torcida/types'

describe('slugClube', () => {
  it('normaliza nome + UF no mesmo formato do seed', () => {
    expect(slugClube('Sport Club Corinthians Paulista', 'SP')).toBe(
      'sport-club-corinthians-paulista-sp',
    )
  })

  it('cai em "clube" quando o nome não gera slug', () => {
    expect(slugClube('???', null)).toBe('clube')
  })
})

describe('apelidoClube', () => {
  it('tira o jargão jurídico e fica com o nome curto', () => {
    expect(apelidoClube('Sport Club Corinthians Paulista')).toBe('Corinthians')
    expect(apelidoClube('Guarany Sporting Club de Sobral')).toBe('Guarany')
    expect(apelidoClube('Sociedade Esportiva Palmeiras')).toBe('Palmeiras')
    expect(apelidoClube('Santos Futebol Clube')).toBe('Santos')
  })

  it('mantém o segundo token quando o primeiro é genérico', () => {
    expect(apelidoClube('Clube Atlético Mineiro')).toBe('Atlético Mineiro')
    expect(apelidoClube('América Futebol Clube')).toBe('América')
  })

  it('volta vazio sem nome útil', () => {
    expect(apelidoClube('')).toBe('')
    expect(apelidoClube('Clube de Regatas')).toBe('')
  })
})

describe('ClubeSchema', () => {
  const base = {
    nome: 'Sport Club Corinthians Paulista',
    slug: 'sport-club-corinthians-paulista-sp',
    serie: 'A' as const,
    estado: 'SP' as const,
  }

  it('aceita cadastro mínimo válido', () => {
    const r = ClubeSchema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it('exige o trio de estimativa junto', () => {
    const soNumero = ClubeSchema.safeParse({ ...base, torcedoresEstimados: 30_000_000 })
    expect(soNumero.success).toBe(false)
    if (!soNumero.success) {
      const paths = soNumero.error.issues.map((i) => i.path.join('.'))
      expect(paths).toEqual(
        expect.arrayContaining(['torcedoresEstimadosFonte', 'torcedoresEstimadosTipo']),
      )
    }

    const completo = ClubeSchema.safeParse({
      ...base,
      torcedoresEstimados: 30_000_000,
      torcedoresEstimadosFonte: 'IBOPE Repucom 2024',
      torcedoresEstimadosTipo: 'IBOPE_DIGITAL',
    })
    expect(completo.success).toBe(true)
  })

  it('rejeita slug inválido', () => {
    expect(ClubeSchema.safeParse({ ...base, slug: 'Corinthians SP' }).success).toBe(false)
  })
})

describe('completudeClube', () => {
  it('marca 100% quando todos os campos de impacto estão preenchidos', () => {
    const r = completudeClube({
      slug: 'foo-sp',
      serie: 'A',
      estado: 'SP',
      escudoUrl: 'https://cdn.example/escudo.png',
      cidade: 'São Paulo',
      torcedoresEstimados: 1,
    })
    expect(r).toEqual({ completo: true, faltando: [], percentual: 100 })
  })

  it('lista só o que falta e calcula percentual', () => {
    const r = completudeClube({
      slug: 'foo-sp',
      serie: 'A',
      estado: 'SP',
      escudoUrl: null,
      cidade: '',
      torcedoresEstimados: 0,
    })
    expect(r.completo).toBe(false)
    expect(r.faltando).toEqual(['escudoUrl', 'cidade', 'torcedoresEstimados'])
    expect(r.percentual).toBe(
      Math.round(((CAMPOS_COMPLETUDE_CLUBE.length - 3) / CAMPOS_COMPLETUDE_CLUBE.length) * 100),
    )
  })

  it('cada campo de completude tem filtro batendo com a listagem', () => {
    for (const campo of CAMPOS_COMPLETUDE_CLUBE) {
      expect(campo.filtro).toMatch(/^sem-/)
    }
  })
})

describe('bloqueiosExclusaoClube', () => {
  it('libera exclusão só com contagens zeradas', () => {
    expect(bloqueiosExclusaoClube({}).podeExcluir).toBe(true)
    const { podeExcluir, bloqueios } = bloqueiosExclusaoClube({
      tenants: 2,
      partidas: 1,
      torcedores: 0,
    })
    expect(podeExcluir).toBe(false)
    expect(bloqueios.map((b) => b.chave)).toEqual(['tenants', 'partidas'])
  })
})

describe('rotuloSerieClube', () => {
  it('tolera nulo e valor desconhecido', () => {
    expect(rotuloSerieClube(null)).toBe('Sem série')
    expect(rotuloSerieClube('A')).toBe('Série A')
    expect(rotuloSerieClube('XYZ')).toBe('XYZ')
  })
})
