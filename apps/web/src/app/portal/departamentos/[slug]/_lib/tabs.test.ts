import { describe, expect, it } from 'vitest'
import {
  parseAcervoPage,
  parseDepartamentoTab,
  primeiroSearchParam,
  resolverTabDeHash,
  rotuloTabPainel,
  tabSugeridaPeloFoco,
} from './tabs'

const todas = { temFila: true, temPedidos: true }
const semExtras = { temFila: false, temPedidos: false }

describe('parseDepartamentoTab', () => {
  it('cai no painel sem query ou com valor desconhecido', () => {
    expect(parseDepartamentoTab(undefined, todas)).toBe('painel')
    expect(parseDepartamentoTab('', todas)).toBe('painel')
    expect(parseDepartamentoTab('nope', todas)).toBe('painel')
  })

  it('aceita as abas canônicas', () => {
    expect(parseDepartamentoTab('areas', todas)).toBe('areas')
    expect(parseDepartamentoTab('projetos', todas)).toBe('projetos')
    expect(parseDepartamentoTab('equipe', todas)).toBe('equipe')
    expect(parseDepartamentoTab('fila', todas)).toBe('fila')
    expect(parseDepartamentoTab('pedidos', todas)).toBe('pedidos')
  })

  it('mapeia âncoras antigas usadas em links já gravados', () => {
    expect(parseDepartamentoTab('dominio', todas)).toBe('painel')
    expect(parseDepartamentoTab('acervo', todas)).toBe('painel')
    expect(parseDepartamentoTab('instrumentos', todas)).toBe('painel')
    expect(parseDepartamentoTab('pedidos-area', todas)).toBe('pedidos')
    expect(parseDepartamentoTab('gestao', todas)).toBe('equipe')
  })

  it('não entrega fila/pedidos quando a aba não existe naquele cockpit (sem permissão ou fora do domínio)', () => {
    expect(parseDepartamentoTab('fila', semExtras)).toBe('painel')
    expect(parseDepartamentoTab('pedidos', semExtras)).toBe('painel')
    expect(parseDepartamentoTab('areas', semExtras)).toBe('areas')
  })
})

describe('tabSugeridaPeloFoco', () => {
  it('escolhe a aba do deep-link quando a query não trouxe tab', () => {
    expect(tabSugeridaPeloFoco({ area: 'a1' })).toBe('areas')
    expect(tabSugeridaPeloFoco({ projeto: 'p1' })).toBe('projetos')
    expect(tabSugeridaPeloFoco({ pessoa: 'u1' })).toBe('equipe')
    expect(tabSugeridaPeloFoco({})).toBeNull()
  })

  it('área vence projeto e pessoa na mesma query', () => {
    expect(tabSugeridaPeloFoco({ area: 'a1', projeto: 'p1', pessoa: 'u1' })).toBe('areas')
  })
})

describe('primeiroSearchParam', () => {
  it('normaliza string, array e vazio', () => {
    expect(primeiroSearchParam('areas')).toBe('areas')
    expect(primeiroSearchParam(['projetos', 'areas'])).toBe('projetos')
    expect(primeiroSearchParam('  ')).toBeUndefined()
    expect(primeiroSearchParam(undefined)).toBeUndefined()
  })
})

describe('parseAcervoPage', () => {
  it('aceita inteiro ≥ 1 e rejeita o resto', () => {
    expect(parseAcervoPage('2')).toBe(2)
    expect(parseAcervoPage('1')).toBe(1)
    expect(parseAcervoPage(undefined)).toBe(1)
    expect(parseAcervoPage('0')).toBe(1)
    expect(parseAcervoPage('-3')).toBe(1)
    expect(parseAcervoPage('abc')).toBe(1)
  })
})

describe('resolverTabDeHash', () => {
  it('converte hash legado para aba', () => {
    expect(resolverTabDeHash('#areas')).toBe('areas')
    expect(resolverTabDeHash('projetos')).toBe('projetos')
    expect(resolverTabDeHash('#pedidos-area')).toBe('pedidos')
    expect(resolverTabDeHash('#acervo')).toBe('painel')
    expect(resolverTabDeHash('#instrumentos')).toBe('painel')
    expect(resolverTabDeHash('#')).toBeNull()
    expect(resolverTabDeHash('#inexistente')).toBeNull()
  })
})

describe('rotuloTabPainel', () => {
  it('nomeia a primeira aba pelo domínio — departamentos deixam de parecer iguais', () => {
    expect(rotuloTabPainel('financeiro')).toBe('Caixa')
    expect(rotuloTabPainel('bateria')).toBe('Ensaios')
    expect(rotuloTabPainel('diretoria')).toBe('Governança')
    expect(rotuloTabPainel('generico')).toBe('Painel')
  })
})
