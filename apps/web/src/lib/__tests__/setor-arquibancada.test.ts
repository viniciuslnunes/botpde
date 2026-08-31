import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SETORES_ARQUIBANCADA,
  SETOR_ARQUIBANCADA_LABEL,
  SalvarSetorArquibancadaSchema,
  formatarSetorArquibancada,
  rotuloSetorArquibancada,
  setorAceitaGeral,
} from '@torcida/types'

const tenantFindUnique = vi.hoisted(() => vi.fn())
const resolverTenantRaizIdFn = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: { tenant: { findUnique: tenantFindUnique } },
}))

vi.mock('@/lib/membros-sede', () => ({
  resolverTenantRaizId: (...args: unknown[]) => resolverTenantRaizIdFn(...args),
}))


describe('setor na arquibancada', () => {
  it('rótulos canônicos são Setor Norte/Sul/Leste/Oeste — nunca Gol', () => {
    expect(SETORES_ARQUIBANCADA).toEqual(['NORTE', 'SUL', 'LESTE', 'OESTE'])
    for (const cardeal of SETORES_ARQUIBANCADA) {
      const label = SETOR_ARQUIBANCADA_LABEL[cardeal]
      expect(label.startsWith('Setor ')).toBe(true)
      expect(label.toLowerCase()).not.toContain('gol')
    }
    expect(rotuloSetorArquibancada('NORTE')).toBe('Setor Norte')
    expect(rotuloSetorArquibancada('SUL')).toBe('Setor Sul')
  })

  it('formata Geral e portão sem substituir o cardeal', () => {
    expect(
      formatarSetorArquibancada({
        cardeal: 'NORTE',
        geral: true,
        nomeLocal: 'Arquibancada Norte',
        portao: 'Portão O',
      }),
    ).toBe('Setor Norte · Geral · Arquibancada Norte · Portão O')
  })

  it('omite nome local quando é o mesmo que o rótulo canônico', () => {
    expect(
      formatarSetorArquibancada({
        cardeal: 'NORTE',
        geral: false,
        nomeLocal: 'Setor Norte',
        portao: null,
      }),
    ).toBe('Setor Norte')
  })

  it('Geral só vale na cabeceira', () => {
    expect(setorAceitaGeral('NORTE')).toBe(true)
    expect(setorAceitaGeral('SUL')).toBe(true)
    expect(setorAceitaGeral('LESTE')).toBe(false)
    expect(setorAceitaGeral('OESTE')).toBe(false)
  })

  it('schema força Geral=false em Leste/Oeste', () => {
    const leste = SalvarSetorArquibancadaSchema.safeParse({
      cardeal: 'LESTE',
      geral: 'on',
      nomeLocal: '',
      portao: '',
    })
    expect(leste.success).toBe(true)
    if (leste.success) expect(leste.data.geral).toBe(false)

    const norte = SalvarSetorArquibancadaSchema.safeParse({
      cardeal: 'NORTE',
      geral: 'on',
      nomeLocal: '  ',
      portao: 'Portão O',
    })
    expect(norte.success).toBe(true)
    if (norte.success) {
      expect(norte.data.geral).toBe(true)
      expect(norte.data.nomeLocal).toBe(null)
      expect(norte.data.portao).toBe('Portão O')
    }
  })

  it('rejeita cardeal vazio ou “Gol Norte”', () => {
    expect(SalvarSetorArquibancadaSchema.safeParse({ cardeal: '' }).success).toBe(false)
    expect(SalvarSetorArquibancadaSchema.safeParse({ cardeal: 'GOL_NORTE' }).success).toBe(false)
  })
})

describe('resolverSetorArquibancada — herança da Sede', () => {
  beforeEach(() => {
    tenantFindUnique.mockReset()
    resolverTenantRaizIdFn.mockReset()
  })

  it('lê o setor no tenant raiz, não na unidade', async () => {
    resolverTenantRaizIdFn.mockResolvedValue('sede-raiz')
    tenantFindUnique.mockResolvedValue({
      id: 'sede-raiz',
      setorArquibancada: 'NORTE',
      setorArquibancadaGeral: true,
      setorArquibancadaNome: null,
      setorArquibancadaPortao: 'Portão O',
    })

    const { resolverSetorArquibancada } = await import('@/lib/setor-arquibancada')
    const view = await resolverSetorArquibancada('unidade-pde')

    expect(resolverTenantRaizIdFn).toHaveBeenCalledWith('unidade-pde')
    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: 'sede-raiz' },
      select: {
        id: true,
        setorArquibancada: true,
        setorArquibancadaGeral: true,
        setorArquibancadaNome: true,
        setorArquibancadaPortao: true,
      },
    })
    expect(view).toEqual({
      cardeal: 'NORTE',
      geral: true,
      nomeLocal: null,
      portao: 'Portão O',
      tenantRaizId: 'sede-raiz',
    })
  })
})
