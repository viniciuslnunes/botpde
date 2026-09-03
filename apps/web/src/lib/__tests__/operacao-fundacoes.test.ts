import { describe, it, expect } from 'vitest'
import {
  toggleProcedimentoRecord,
  procedimentoItemsFromCatalog,
  procedimentoProgress,
} from '@torcida/types'
import {
  CARAVANA_PROCEDIMENTO_CATALOGO,
  caravanaProcedimentoEmUrgencia,
  caravanaProcedimentoFromMeta,
  caravanaProcedimentoProgress,
  toggleCaravanaProcedimento,
} from '@torcida/types'
import { filtrarMembrosPorAudiencia } from '@torcida/types'
import {
  calcularPrevisaoConsumoBar,
  previsaoBarComRuptura,
} from '@torcida/types'
import {
  competenciaMensalAtual,
  deveDispararRegua,
  deveGerarCobrancasHoje,
  parseFinanceiroCiclo,
} from '@torcida/types'
import { pendenciasLgeMembro, resumirConformidadeLge } from '@torcida/types'

describe('procedimento primitiva', () => {
  const catalog = [
    { id: 'a', label: 'Item A' },
    { id: 'b', label: 'Item B' },
  ]

  it('toggle em catálogo persiste em meta[path].items', () => {
    let meta: object = {}
    meta = toggleProcedimentoRecord(meta, 'teste', 'a', true)
    const items = procedimentoItemsFromCatalog(meta, 'teste', catalog)
    expect(items.find((i) => i.id === 'a')?.done).toBe(true)
    expect(procedimentoProgress(items)).toEqual({ total: 2, done: 1 })
  })
})

describe('caravana procedimento', () => {
  it('catálogo fixo com estado em Evento.meta.procedimento', () => {
    const meta = toggleCaravanaProcedimento({}, 'documento-onibus', true)
    const items = caravanaProcedimentoFromMeta(meta)
    expect(items.some((i) => i.id === 'documento-onibus' && i.done)).toBe(true)
    expect(caravanaProcedimentoProgress(meta).done).toBe(1)
  })

  it('urgência só a ≤72h com checklist incompleto', () => {
    const meta = {}
    const em3dias = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000)
    expect(caravanaProcedimentoEmUrgencia(meta, em3dias)).toBe(true)
    expect(caravanaProcedimentoEmUrgencia(meta, new Date(Date.now() + 10 * 24 * 60 * 60 * 1000))).toBe(
      false,
    )
    const completo = CARAVANA_PROCEDIMENTO_CATALOGO.reduce(
      (m, item) => toggleCaravanaProcedimento(m, item.id, true),
      {} as object,
    )
    expect(caravanaProcedimentoEmUrgencia(completo, em3dias)).toBe(false)
  })
})

describe('comunicado audiência', () => {
  const membros = [
    { userId: '1', tipo: 'SOCIO', adimplente: true, departamentoId: 'd1' },
    { userId: '2', tipo: 'TORCEDOR', adimplente: true, departamentoId: null },
    { userId: '3', tipo: 'SOCIO', adimplente: false, departamentoId: 'd2' },
  ]

  it('filtra por escopo', () => {
    expect(filtrarMembrosPorAudiencia({ escopo: 'SOCIOS' }, membros)).toEqual(['1', '3'])
    expect(filtrarMembrosPorAudiencia({ escopo: 'ADIMPLENTES' }, membros)).toEqual(['1', '2'])
    expect(
      filtrarMembrosPorAudiencia({ escopo: 'DEPARTAMENTO', departamentoId: 'd1' }, membros),
    ).toEqual(['1'])
  })
})

describe('bar previsão', () => {
  it('média por produto nos últimos jogos', () => {
    const linhas = [
      { produtoId: 'p1', nome: 'Cerveja', quantidade: 10, eventoId: 'e1' },
      { produtoId: 'p1', nome: 'Cerveja', quantidade: 20, eventoId: 'e2' },
    ]
    const out = calcularPrevisaoConsumoBar(linhas, 3)
    expect(out[0]?.mediaUnidades).toBe(15)
  })

  it('ruptura quando estoque abaixo da previsão', () => {
    const previsao = [{ produtoId: 'p1', nome: 'Cerveja', mediaUnidades: 12, jogosBase: 2 }]
    const ruptura = previsaoBarComRuptura(previsao, [{ produtoId: 'p1', estoque: 5 }])
    expect(ruptura[0]?.falta).toBe(7)
  })
})

describe('financeiro ciclo', () => {
  it('gera só no dia configurado', () => {
    const ciclo = parseFinanceiroCiclo({ ativo: true, diaGeracao: 5 })
    expect(deveGerarCobrancasHoje(ciclo, new Date('2026-03-05T12:00:00'))).toBe(true)
    expect(deveGerarCobrancasHoje(ciclo, new Date('2026-03-06T12:00:00'))).toBe(false)
  })

  it('régua dispara nos marcos', () => {
    const ciclo = parseFinanceiroCiclo({ ativo: true, diasRegua: [0, 7] })
    const venc = new Date('2026-03-01T12:00:00')
    expect(deveDispararRegua(ciclo, venc, new Date('2026-03-08T12:00:00'))).toBe(true)
    expect(deveDispararRegua(ciclo, venc, new Date('2026-03-05T12:00:00'))).toBe(false)
  })

  it('competência mensal YYYY-MM', () => {
    expect(competenciaMensalAtual(new Date('2026-09-02'))).toBe('2026-09')
  })
})

describe('LGE conformidade', () => {
  it('sócio sem CPF entra no resumo', () => {
    const resumo = resumirConformidadeLge([
      { userId: '1', nome: 'A', tipo: 'SOCIO', cpf: null, rg: '123' },
      { userId: '2', nome: 'B', tipo: 'TORCEDOR' },
    ])
    expect(resumo.incompletos).toBe(1)
    expect(resumo.semCpf).toBe(1)
    expect(pendenciasLgeMembro({ userId: '1', nome: 'A', tipo: 'SOCIO', cpf: null })).toContain('cpf')
  })
})
