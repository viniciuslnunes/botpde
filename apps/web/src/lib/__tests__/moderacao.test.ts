import { describe, expect, it } from 'vitest'
import {
  CATEGORIAS_DENUNCIA_UI,
  CATEGORIAS_VIOLACAO,
  GRAVIDADES,
  escalaParaPlataforma,
  gravidadeDaCategoria,
  ordenarPorPrioridade,
  prazoSlaDe,
  slaVencido,
} from '@torcida/types'

const AGORA = new Date('2026-09-01T12:00:00.000Z')

describe('gravidadeDaCategoria', () => {
  it('classifica cada faixa da política', () => {
    expect(gravidadeDaCategoria('CSAM')).toBe('S4')
    expect(gravidadeDaCategoria('AMEACA_CRIVEL')).toBe('S4')
    expect(gravidadeDaCategoria('RACISMO')).toBe('S3')
    expect(gravidadeDaCategoria('INCITACAO_VIOLENCIA')).toBe('S3')
    expect(gravidadeDaCategoria('SPAM')).toBe('S2')
    expect(gravidadeDaCategoria('PALAVRAO_LEVE')).toBe('S1')
  })

  it('lança em código desconhecido — nunca degrada para S0 em silêncio', () => {
    expect(() => gravidadeDaCategoria('NAO_EXISTE')).toThrow(/desconhecida/i)
    expect(() => gravidadeDaCategoria('')).toThrow()
  })

  it('toda categoria declara uma gravidade válida', () => {
    for (const [codigo, entrada] of Object.entries(CATEGORIAS_VIOLACAO)) {
      expect(GRAVIDADES, codigo).toContain(entrada.gravidade)
      expect(entrada.label.length, codigo).toBeGreaterThan(0)
    }
  })
})

describe('CATEGORIAS_DENUNCIA_UI', () => {
  it('todo código da lista do usuário existe na taxonomia', () => {
    for (const opcao of CATEGORIAS_DENUNCIA_UI) {
      expect(CATEGORIAS_VIOLACAO[opcao.codigo], opcao.codigo).toBeDefined()
    }
  })

  it('é subconjunto curto e sem repetição', () => {
    const codigos = CATEGORIAS_DENUNCIA_UI.map((c) => c.codigo)
    expect(new Set(codigos).size).toBe(codigos.length)
    expect(codigos.length).toBeLessThan(Object.keys(CATEGORIAS_VIOLACAO).length)
  })
})

describe('prazoSlaDe', () => {
  it('S4 em 2h, S3 em 24h, S2 em 72h', () => {
    expect(prazoSlaDe('S4', AGORA)?.toISOString()).toBe('2026-09-01T14:00:00.000Z')
    expect(prazoSlaDe('S3', AGORA)?.toISOString()).toBe('2026-09-02T12:00:00.000Z')
    expect(prazoSlaDe('S2', AGORA)?.toISOString()).toBe('2026-09-04T12:00:00.000Z')
  })

  it('S1 e S0 não têm prazo', () => {
    expect(prazoSlaDe('S1', AGORA)).toBeNull()
    expect(prazoSlaDe('S0', AGORA)).toBeNull()
  })
})

describe('escalaParaPlataforma', () => {
  it('só S4 escala — o tenant nunca encerra crítico', () => {
    expect(escalaParaPlataforma('S4')).toBe(true)
    expect(escalaParaPlataforma('S3')).toBe(false)
    expect(escalaParaPlataforma('S2')).toBe(false)
    expect(escalaParaPlataforma('S1')).toBe(false)
    expect(escalaParaPlataforma('S0')).toBe(false)
  })
})

describe('slaVencido', () => {
  it('sem prazo nunca vence', () => {
    expect(slaVencido(null, AGORA)).toBe(false)
  })

  it('vencido só quando o prazo já passou', () => {
    expect(slaVencido(new Date('2026-09-01T11:59:00.000Z'), AGORA)).toBe(true)
    expect(slaVencido(new Date('2026-09-01T12:01:00.000Z'), AGORA)).toBe(false)
  })
})

describe('ordenarPorPrioridade', () => {
  function item(
    gravidade: 'S0' | 'S1' | 'S2' | 'S3' | 'S4',
    prazoSla: string | null,
    criadoEm: string,
  ) {
    return {
      gravidade,
      prazoSla: prazoSla ? new Date(prazoSla) : null,
      criadoEm: new Date(criadoEm),
    }
  }

  it('gravidade mais alta primeiro, mesmo com denúncia mais antiga na fila', () => {
    const leve = item('S1', null, '2026-08-01T00:00:00.000Z')
    const critico = item('S4', '2026-09-01T14:00:00.000Z', '2026-09-01T12:00:00.000Z')
    expect([leve, critico].sort(ordenarPorPrioridade)[0]).toBe(critico)
  })

  it('mesma gravidade: SLA mais próximo sobe', () => {
    const depois = item('S3', '2026-09-03T00:00:00.000Z', '2026-09-01T00:00:00.000Z')
    const antes = item('S3', '2026-09-02T00:00:00.000Z', '2026-09-01T06:00:00.000Z')
    expect([depois, antes].sort(ordenarPorPrioridade)[0]).toBe(antes)
  })

  it('sem prazo vai depois de quem tem prazo, na mesma gravidade', () => {
    const semPrazo = item('S2', null, '2026-08-01T00:00:00.000Z')
    const comPrazo = item('S2', '2026-09-10T00:00:00.000Z', '2026-09-01T00:00:00.000Z')
    expect([semPrazo, comPrazo].sort(ordenarPorPrioridade)[0]).toBe(comPrazo)
  })

  it('empate total de gravidade e prazo: mais antigo primeiro', () => {
    const novo = item('S1', null, '2026-09-01T00:00:00.000Z')
    const velho = item('S1', null, '2026-08-01T00:00:00.000Z')
    expect([novo, velho].sort(ordenarPorPrioridade)[0]).toBe(velho)
  })

  it('ordena a fila inteira de forma estável e previsível', () => {
    const fila = [
      item('S2', '2026-09-04T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
      item('S1', null, '2026-08-20T12:00:00.000Z'),
      item('S4', '2026-09-01T14:00:00.000Z', '2026-09-01T12:00:00.000Z'),
      item('S3', '2026-09-02T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
    ]
    expect([...fila].sort(ordenarPorPrioridade).map((i) => i.gravidade)).toEqual([
      'S4',
      'S3',
      'S2',
      'S1',
    ])
  })
})
