import { describe, expect, it } from 'vitest'
import { agruparSedesPorRegiao, sedeCombinaRegiao } from '@/lib/onboarding-unidade'
import type { SedeOnboarding } from '@/lib/onboarding'

const base = {
  endereco: null,
  sedePaiId: null,
  lat: null,
  lng: null,
  fotoUrl: null,
} satisfies Partial<SedeOnboarding>

const sedes: SedeOnboarding[] = [
  {
    id: '1',
    nome: 'Sede Nacional',
    tipo: 'SEDE',
    cidade: 'São Paulo',
    estado: 'SP',
    ...base,
  },
  {
    id: '2',
    nome: 'Zona Leste',
    tipo: 'PONTO_ENCONTRO',
    cidade: 'São Paulo',
    estado: 'SP',
    ...base,
    sedePaiId: '3',
  },
  {
    id: '3',
    nome: 'Grande SP',
    tipo: 'SUBSEDE',
    cidade: 'São Paulo',
    estado: 'SP',
    ...base,
    sedePaiId: '1',
  },
  {
    id: '4',
    nome: 'Interior',
    tipo: 'SUBSEDE',
    cidade: 'Campinas',
    estado: 'SP',
    ...base,
    sedePaiId: '1',
  },
]

describe('onboarding-unidade', () => {
  it('combina cidade e UF', () => {
    expect(sedeCombinaRegiao(sedes[1]!, 'SP', 'São Paulo')).toBe(true)
    expect(sedeCombinaRegiao(sedes[3]!, 'SP', 'São Paulo')).toBe(false)
  })

  it('prioriza região e inclui sede principal nas recomendadas', () => {
    const { recomendadas, outras } = agruparSedesPorRegiao(sedes, 'SP', 'São Paulo')
    expect(recomendadas.map((s) => s.id)).toEqual(['2', '3', '1'])
    expect(outras.map((s) => s.id)).toEqual(['4'])
  })
})
