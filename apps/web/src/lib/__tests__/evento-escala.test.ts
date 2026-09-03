import { describe, it, expect } from 'vitest'
import {
  FUNCOES_ESCALA,
  funcoesParaTipo,
  isFuncaoEscala,
  pendenciasEscala,
  resumirEscala,
} from '@torcida/types'

/** Linha mínima de escala para os cálculos puros. */
function linha(
  funcao: string,
  status: string,
  extra?: { checkedInAt?: Date | null },
) {
  return { funcao, status, checkedInAt: extra?.checkedInAt ?? null }
}

describe('resumirEscala', () => {
  it('escala vazia não tem posto nem coordenação', () => {
    const r = resumirEscala([])
    expect(r.total).toBe(0)
    expect(r.temCoordenacao).toBe(false)
    expect(r.funcoes).toEqual([])
  })

  it('convocado e aceito ocupam posto; recusado e substituído não', () => {
    const r = resumirEscala([
      linha('COORDENACAO', 'ACEITO'),
      linha('EMBARQUE', 'CONVOCADO'),
      linha('BANDEIRA', 'RECUSADO'),
      linha('BAR', 'SUBSTITUIDO'),
    ])
    expect(r.total).toBe(2)
    expect(r.aceitos).toBe(1)
    expect(r.aguardando).toBe(1)
    expect(r.recusados).toBe(1)
  })

  it('recusa deixa o buraco visível na função', () => {
    const r = resumirEscala([linha('CONDUCAO', 'RECUSADO')])
    const conducao = r.funcoes.find((f) => f.funcao === 'CONDUCAO')
    expect(conducao?.ocupados).toBe(0)
    expect(conducao?.recusados).toBe(1)
  })

  it('presença só conta para quem ainda ocupa o posto', () => {
    const agora = new Date()
    const r = resumirEscala([
      linha('BATERIA', 'ACEITO', { checkedInAt: agora }),
      linha('COBERTURA', 'SUBSTITUIDO', { checkedInAt: agora }),
    ])
    expect(r.presentes).toBe(1)
  })

  it('coordenação recusada não conta como coordenação', () => {
    expect(resumirEscala([linha('COORDENACAO', 'RECUSADO')]).temCoordenacao).toBe(false)
    expect(resumirEscala([linha('COORDENACAO', 'CONVOCADO')]).temCoordenacao).toBe(true)
  })

  it('função fora do catálogo (dado legado) não some do resumo', () => {
    const r = resumirEscala([linha('FUNCAO_ANTIGA', 'ACEITO')])
    expect(r.total).toBe(1)
    expect(r.funcoes.map((f) => f.funcao)).toContain('FUNCAO_ANTIGA')
  })
})

describe('pendenciasEscala', () => {
  const resumoCheio = resumirEscala([
    { funcao: 'COORDENACAO', status: 'ACEITO' },
    { funcao: 'EMBARQUE', status: 'ACEITO' },
  ])

  it('evento passado não gera pendência', () => {
    const r = pendenciasEscala({ resumo: resumirEscala([]), horasAteEvento: -2 })
    expect(r).toEqual([])
  })

  it('operação sem coordenação é a pendência mais grave', () => {
    const r = pendenciasEscala({
      resumo: resumirEscala([{ funcao: 'BAR', status: 'ACEITO' }]),
      horasAteEvento: 100,
    })
    expect(r[0]?.chave).toBe('sem-coordenacao')
    expect(r[0]?.severidade).toBe('alta')
  })

  it('escala completa e respondida não gera pendência', () => {
    expect(pendenciasEscala({ resumo: resumoCheio, horasAteEvento: 10 })).toEqual([])
  })

  it('silêncio só vira pendência dentro da janela', () => {
    const resumo = resumirEscala([
      { funcao: 'COORDENACAO', status: 'ACEITO' },
      { funcao: 'EMBARQUE', status: 'CONVOCADO' },
    ])
    expect(pendenciasEscala({ resumo, horasAteEvento: 200 })).toEqual([])
    const perto = pendenciasEscala({ resumo, horasAteEvento: 10 })
    expect(perto.some((p) => p.chave === 'sem-resposta')).toBe(true)
  })

  it('recusa vira pendência de cobertura', () => {
    const resumo = resumirEscala([
      { funcao: 'COORDENACAO', status: 'ACEITO' },
      { funcao: 'CONDUCAO', status: 'RECUSADO' },
    ])
    const r = pendenciasEscala({ resumo, horasAteEvento: 300 })
    expect(r.some((p) => p.chave === 'recusas')).toBe(true)
  })
})

describe('funcoesParaTipo', () => {
  it('devolve o catálogo inteiro, só reordenado', () => {
    for (const tipo of ['CARAVANA', 'ENSAIO', 'GERAL', 'DESCONHECIDO']) {
      const lista = funcoesParaTipo(tipo)
      expect([...lista].sort()).toEqual([...FUNCOES_ESCALA].sort())
    }
  })

  it('caravana começa por coordenação e condução', () => {
    const lista = funcoesParaTipo('CARAVANA')
    expect(lista[0]).toBe('COORDENACAO')
    expect(lista.slice(0, 3)).toContain('CONDUCAO')
  })

  it('ensaio prioriza bateria', () => {
    expect(funcoesParaTipo('ENSAIO').slice(0, 2)).toContain('BATERIA')
  })

  it('tipo nulo cai no perfil geral', () => {
    expect(funcoesParaTipo(null)[0]).toBe('COORDENACAO')
  })
})

describe('isFuncaoEscala', () => {
  it('aceita só o catálogo', () => {
    expect(isFuncaoEscala('BANDEIRA')).toBe(true)
    expect(isFuncaoEscala('bandeira')).toBe(false)
    expect(isFuncaoEscala('QUALQUER')).toBe(false)
  })
})
