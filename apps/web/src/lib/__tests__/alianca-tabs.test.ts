import { describe, expect, it } from 'vitest'
import {
  montarAliancaTabItems,
  parseAliancaTabId,
  resolverAliancaTabPadrao,
  type AliancaTabContagens,
} from '@/lib/alianca-tabs'

const vazio: AliancaTabContagens = {
  recomendacoes: 0,
  recomendacoesVisiveis: 0,
  recomendacoesAlta: 0,
  recebidas: 0,
  enviadas: 0,
  ativas: 0,
  encerradas: 0,
}

describe('parseAliancaTabId', () => {
  it('aceita ids conhecidos e rejeita o resto', () => {
    expect(parseAliancaTabId('ativas')).toBe('ativas')
    expect(parseAliancaTabId('foo')).toBeNull()
    expect(parseAliancaTabId(undefined)).toBeNull()
  })
})

describe('resolverAliancaTabPadrao', () => {
  it('em modo leitura abre nas ativas', () => {
    expect(resolverAliancaTabPadrao(true, { ...vazio, recebidas: 3 })).toBe('ativas')
  })

  it('prioriza a fila acionável', () => {
    expect(resolverAliancaTabPadrao(false, { ...vazio, recebidas: 1 })).toBe('recebidas')
    expect(resolverAliancaTabPadrao(false, { ...vazio, recomendacoes: 2 })).toBe(
      'recomendacoes',
    )
    expect(resolverAliancaTabPadrao(false, { ...vazio, ativas: 1 })).toBe('ativas')
    expect(resolverAliancaTabPadrao(false, { ...vazio, enviadas: 1 })).toBe('enviadas')
    expect(resolverAliancaTabPadrao(false, vazio)).toBe('propor')
  })
})

describe('montarAliancaTabItems', () => {
  it('no modo leitura só mostra co-irmãs e ativas', () => {
    const ids = montarAliancaTabItems(true, {
      ...vazio,
      recomendacoesVisiveis: 2,
      ativas: 1,
      encerradas: 4,
    }).map((t) => t.id)
    expect(ids).toEqual(['recomendacoes', 'ativas'])
  })

  it('esconde histórico até haver encerrada', () => {
    expect(montarAliancaTabItems(false, vazio).map((t) => t.id)).not.toContain('historico')
    expect(
      montarAliancaTabItems(false, { ...vazio, encerradas: 1 }).map((t) => t.id),
    ).toContain('historico')
  })
})
