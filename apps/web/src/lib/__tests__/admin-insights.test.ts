import { describe, expect, it } from 'vitest'
import {
  bucketPorDia,
  bucketPorMes,
  bucketSomaPorDia,
  calcularDelta,
  chaveMesSP,
  resolverIntervaloPeriodo,
  ultimosMesesSP,
} from '../admin-insights'
import { buildAdminHref } from '../admin-href'

const DIA_MS = 24 * 60 * 60 * 1000

describe('resolverIntervaloPeriodo', () => {
  it('30d: janela de 30 dias com período anterior contíguo e sem sobreposição', () => {
    const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervaloPeriodo('30d')
    expect(fim.getTime() - inicio.getTime()).toBe(30 * DIA_MS)
    expect(inicio.getTime() - inicioAnterior.getTime()).toBe(30 * DIA_MS)
    expect(fimAnterior.getTime()).toBe(inicio.getTime() - 1)
  })

  it('12m cobre 365 dias', () => {
    const { inicio, fim } = resolverIntervaloPeriodo('12m')
    expect(fim.getTime() - inicio.getTime()).toBe(365 * DIA_MS)
  })
})

describe('bucketPorDia', () => {
  it('gera um bucket por dia (São Paulo), com dias vazios zerados e ordem cronológica', () => {
    const inicio = new Date('2026-03-10T12:00:00-03:00')
    const fim = new Date('2026-03-14T12:00:00-03:00')
    const datas = [
      new Date('2026-03-10T08:00:00-03:00'),
      new Date('2026-03-12T09:00:00-03:00'),
      // 23h30 em SP = 02h30 UTC do dia seguinte — precisa cair no dia 12 (SP), não no 13 (UTC).
      new Date('2026-03-12T23:30:00-03:00'),
    ]

    const serie = bucketPorDia(datas, inicio, fim)

    expect(serie).toHaveLength(5)
    expect(serie.map((p) => p.rotulo)).toEqual(['10/03', '11/03', '12/03', '13/03', '14/03'])
    expect(serie.map((p) => p.valor)).toEqual([1, 0, 2, 0, 0])
  })

  it('ignora datas fora do intervalo', () => {
    const inicio = new Date('2026-03-10T12:00:00-03:00')
    const fim = new Date('2026-03-11T12:00:00-03:00')
    const serie = bucketPorDia([new Date('2026-04-01T12:00:00-03:00')], inicio, fim)
    expect(serie.every((p) => p.valor === 0)).toBe(true)
  })
})

describe('bucketSomaPorDia', () => {
  it('soma valores no dia certo (São Paulo), zerando dias vazios', () => {
    const inicio = new Date('2026-03-10T12:00:00-03:00')
    const fim = new Date('2026-03-12T12:00:00-03:00')
    const serie = bucketSomaPorDia(
      [
        { data: new Date('2026-03-10T08:00:00-03:00'), valor: 25.5 },
        { data: new Date('2026-03-10T20:00:00-03:00'), valor: 10 },
        // 23h em SP = 02h UTC do dia 13 — precisa somar no dia 12 (SP).
        { data: new Date('2026-03-12T23:00:00-03:00'), valor: 7 },
      ],
      inicio,
      fim,
    )
    expect(serie.map((p) => p.valor)).toEqual([35.5, 0, 7])
  })
})

describe('ultimosMesesSP / chaveMesSP', () => {
  it('gera N meses cronológicos terminando no mês corrente, com chave casando com chaveMesSP', () => {
    const meses = ultimosMesesSP(3)
    expect(meses).toHaveLength(3)
    expect(meses[2].chave).toBe(chaveMesSP(new Date()))
    expect(meses.every((m) => /^\d{4}-\d{2}$/.test(m.chave))).toBe(true)
    expect(meses.every((m) => /^[a-z]{3}\/\d{2}$/.test(m.rotulo))).toBe(true)
    // `inicio` do mês corrente cai dentro do próprio mês (00:00 SP).
    expect(chaveMesSP(meses[2].inicio)).toBe(meses[2].chave)
  })
})

describe('bucketPorMes', () => {
  it('soma valores no mês corrente e devolve exatamente N meses', () => {
    const agora = new Date()
    const serie = bucketPorMes(
      [
        { data: agora, valor: 10 },
        { data: agora, valor: 5 },
      ],
      3,
    )
    expect(serie).toHaveLength(3)
    expect(serie[2].valor).toBe(15)
    expect(serie[0].valor).toBe(0)
    // Rótulo pt-BR curto com ano: "jul/26"
    expect(serie[2].rotulo).toMatch(/^[a-z]{3}\/\d{2}$/)
  })
})

describe('calcularDelta', () => {
  it('variação percentual vs período anterior', () => {
    expect(calcularDelta(150, 100)).toBe(50)
    expect(calcularDelta(50, 100)).toBe(-50)
    expect(calcularDelta(100, 100)).toBe(0)
  })

  it('null sem base de comparação (anterior = 0)', () => {
    expect(calcularDelta(10, 0)).toBeNull()
    expect(calcularDelta(0, 0)).toBeNull()
  })

  it('base negativa usa valor absoluto (saldo)', () => {
    expect(calcularDelta(50, -100)).toBe(150)
  })
})

describe('buildAdminHref', () => {
  it('monta query string omitindo undefined e vazio', () => {
    expect(buildAdminHref('/admin/relatorios', { periodo: '90d' })).toBe(
      '/admin/relatorios?periodo=90d',
    )
    expect(buildAdminHref('/admin/relatorios', { periodo: undefined, q: '' })).toBe(
      '/admin/relatorios',
    )
    expect(buildAdminHref('/admin/membros', { status: 'PENDENTE', pagina: 2 })).toBe(
      '/admin/membros?status=PENDENTE&pagina=2',
    )
  })
})
