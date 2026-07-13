import { describe, expect, it, vi, beforeEach } from 'vitest'
import { inicialClubeEscudo } from '@/components/onboarding/escudo-clube'

const afiliacaoFindMany = vi.hoisted(() => vi.fn())
const saasMembroFindMany = vi.hoisted(() => vi.fn())
const perfilTorcedorFindMany = vi.hoisted(() => vi.fn())

vi.mock('@/lib/tenant', () => ({
  torcidaAcessivelNoHost: () => true,
}))

vi.mock('@torcida/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@torcida/db')>()
  return {
    ...actual,
    db: {
      afiliacao: { findMany: afiliacaoFindMany },
      saasMembro: { findMany: saasMembroFindMany },
      perfilTorcedor: { findMany: perfilTorcedorFindMany },
    },
  }
})

describe('inicialClubeEscudo', () => {
  it('usa apelido quando disponível', () => {
    expect(inicialClubeEscudo('Fluminense Football Club (RJ)', 'Flu')).toBe('F')
  })

  it('remove sufixo (UF) do nome longo', () => {
    expect(inicialClubeEscudo('Grêmio Foot-Ball Porto Alegrense (RS)', null)).toBe('G')
  })
})

describe('getAfiliacoesParaOnboarding', () => {
  beforeEach(() => {
    vi.resetModules()
    afiliacaoFindMany.mockReset()
    saasMembroFindMany.mockResolvedValue([])
    perfilTorcedorFindMany.mockResolvedValue([])
  })

  it('deduplica clubes e herda escudoUrl de duplicata do grupo', async () => {
    afiliacaoFindMany.mockResolvedValue([
      {
        id: 'longa',
        nome: 'Sport Club Corinthians Paulista',
        apelido: null,
        escudoUrl: null,
        cidade: 'São Paulo',
        estado: 'SP',
        serie: 'A',
        torcedoresEstimados: 30_000_000,
        torcedoresEstimadosFonte: 'Wikipedia PT',
        _count: { tenants: 0 },
      },
      {
        id: 'canonica',
        nome: 'Corinthians (SP)',
        apelido: 'Corinthians',
        escudoUrl: 'https://res.cloudinary.com/demo/corinthians.png',
        cidade: 'São Paulo',
        estado: 'SP',
        serie: 'A',
        torcedoresEstimados: null,
        torcedoresEstimadosFonte: null,
        _count: { tenants: 2 },
      },
    ])

    const { getAfiliacoesParaOnboarding } = await import('@/lib/onboarding')
    const lista = await getAfiliacoesParaOnboarding('corinthians-dedup')

    expect(lista).toHaveLength(1)
    expect(lista[0]?.id).toBe('canonica')
    expect(lista[0]?.escudoUrl).toBe('https://res.cloudinary.com/demo/corinthians.png')
  })

  it('herda escudo de duplicata quando a canônica não tem imagem', async () => {
    afiliacaoFindMany.mockResolvedValue([
      {
        id: 'canonica',
        nome: 'Corinthians (SP)',
        apelido: 'Corinthians',
        escudoUrl: null,
        cidade: 'São Paulo',
        estado: 'SP',
        serie: 'A',
        torcedoresEstimados: null,
        torcedoresEstimadosFonte: null,
        _count: { tenants: 3 },
      },
      {
        id: 'com-escudo',
        nome: 'Sport Club Corinthians Paulista',
        apelido: null,
        escudoUrl: 'https://res.cloudinary.com/demo/corinthians.png',
        cidade: 'São Paulo',
        estado: 'SP',
        serie: 'A',
        torcedoresEstimados: 30_000_000,
        torcedoresEstimadosFonte: 'Wikipedia PT',
        _count: { tenants: 0 },
      },
    ])

    const { getAfiliacoesParaOnboarding } = await import('@/lib/onboarding')
    const lista = await getAfiliacoesParaOnboarding('corinthians-escudo')

    expect(lista).toHaveLength(1)
    expect(lista[0]?.id).toBe('canonica')
    expect(lista[0]?.escudoUrl).toBe('https://res.cloudinary.com/demo/corinthians.png')
  })

  it('filtra por prefixo do nome ou apelido (startsWith)', async () => {
    afiliacaoFindMany.mockResolvedValue([])

    const { getAfiliacoesParaOnboarding } = await import('@/lib/onboarding')
    await getAfiliacoesParaOnboarding('co')

    expect(afiliacaoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { nome: { startsWith: 'co', mode: 'insensitive' } },
            { apelido: { startsWith: 'co', mode: 'insensitive' } },
          ],
        },
      }),
    )
  })

  it('ordena clubes com escudo antes dos sem escudo', async () => {
    afiliacaoFindMany.mockResolvedValue([
      {
        id: 'sem',
        nome: 'ABC (RN)',
        apelido: 'ABC',
        escudoUrl: null,
        cidade: 'Natal',
        estado: 'RN',
        serie: 'C',
        torcedoresEstimados: null,
        torcedoresEstimadosFonte: null,
        _count: { tenants: 0 },
      },
      {
        id: 'com',
        nome: 'Atlético-MG',
        apelido: 'Galo',
        escudoUrl: 'https://res.cloudinary.com/demo/atletico-mg.png',
        cidade: 'Belo Horizonte',
        estado: 'MG',
        serie: 'A',
        torcedoresEstimados: null,
        torcedoresEstimadosFonte: null,
        _count: { tenants: 1 },
      },
    ])

    const { getAfiliacoesParaOnboarding } = await import('@/lib/onboarding')
    const lista = await getAfiliacoesParaOnboarding('ordem-test')

    expect(lista.map((a) => a.id)).toEqual(['com', 'sem'])
  })
})
