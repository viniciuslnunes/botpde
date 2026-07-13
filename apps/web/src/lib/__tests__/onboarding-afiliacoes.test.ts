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
        torcedoresEstimadosFonte: 'IBOPE Repucom',
        torcedoresEstimadosTipo: 'IBOPE_DIGITAL',
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
        torcedoresEstimadosTipo: null,
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
        torcedoresEstimadosTipo: null,
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
        torcedoresEstimadosFonte: 'IBOPE Repucom',
        torcedoresEstimadosTipo: 'IBOPE_DIGITAL',
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
          AND: [
            {
              OR: [
                { nome: { startsWith: 'co', mode: 'insensitive' } },
                { apelido: { startsWith: 'co', mode: 'insensitive' } },
              ],
            },
          ],
        },
      }),
    )
  })

  it('ordena clubes por inscritos digitais decrescente', async () => {
    afiliacaoFindMany.mockResolvedValue([
      {
        id: 'sem-dado',
        nome: 'ABC (RN)',
        apelido: 'ABC',
        escudoUrl: 'https://res.cloudinary.com/demo/abc.png',
        cidade: 'Natal',
        estado: 'RN',
        serie: 'C',
        torcedoresEstimados: 471_612,
        torcedoresEstimadosFonte: 'Fora do Top 50',
        torcedoresEstimadosTipo: 'LIMITE_ATE',
        _count: { tenants: 0 },
      },
      {
        id: 'medio',
        nome: 'Goiás (GO)',
        apelido: 'Goiás',
        escudoUrl: null,
        cidade: 'Goiânia',
        estado: 'GO',
        serie: 'B',
        torcedoresEstimados: 2_000_000,
        torcedoresEstimadosFonte: 'IBOPE Repucom',
        torcedoresEstimadosTipo: 'IBOPE_DIGITAL',
        _count: { tenants: 0 },
      },
      {
        id: 'top',
        nome: 'Flamengo (RJ)',
        apelido: 'Flamengo',
        escudoUrl: 'https://res.cloudinary.com/demo/flamengo.png',
        cidade: 'Rio de Janeiro',
        estado: 'RJ',
        serie: 'A',
        torcedoresEstimados: 30_000_000,
        torcedoresEstimadosFonte: 'IBOPE Repucom',
        torcedoresEstimadosTipo: 'IBOPE_DIGITAL',
        _count: { tenants: 1 },
      },
    ])

    const { getAfiliacoesParaOnboarding } = await import('@/lib/onboarding')
    const lista = await getAfiliacoesParaOnboarding('ordem-inscritos')

    expect(lista.map((a) => a.id)).toEqual(['top', 'medio', 'sem-dado'])
  })

  it('filtra por UF quando informada', async () => {
    afiliacaoFindMany.mockResolvedValue([])

    const { getAfiliacoesParaOnboarding } = await import('@/lib/onboarding')
    await getAfiliacoesParaOnboarding(undefined, 'BA')

    expect(afiliacaoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ estado: 'BA' }] },
      }),
    )
  })
})
