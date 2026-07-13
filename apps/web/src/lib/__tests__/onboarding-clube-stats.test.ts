import { describe, expect, it, vi, beforeEach } from 'vitest'

const saasMembroFindMany = vi.hoisted(() => vi.fn())
const perfilTorcedorFindMany = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@torcida/db')>()
  return {
    ...actual,
    db: {
      saasMembro: { findMany: saasMembroFindMany },
      perfilTorcedor: { findMany: perfilTorcedorFindMany },
    },
  }
})

describe('calcularStatsClubesOnboarding', () => {
  beforeEach(() => {
    vi.resetModules()
    saasMembroFindMany.mockReset()
    perfilTorcedorFindMany.mockReset()
  })

  it('agrega sócios e torcedores por grupo canônico', async () => {
    const agora = Date.now()
    const online = new Date(agora - 60_000)

    saasMembroFindMany.mockImplementation(({ where }: { where: { tipo: string } }) => {
      if (where.tipo === 'SOCIO') {
        return Promise.resolve([
          {
            userId: 'u1',
            user: { ultimoAcessoEm: online },
            tenant: { afiliacaoId: 'dup-a' },
          },
          {
            userId: 'u2',
            user: { ultimoAcessoEm: null },
            tenant: { afiliacaoId: 'dup-b' },
          },
        ])
      }
      return Promise.resolve([
        {
          userId: 'u3',
          user: { ultimoAcessoEm: online },
          tenant: { afiliacaoId: 'dup-a' },
        },
      ])
    })

    perfilTorcedorFindMany.mockResolvedValue([
      {
        userId: 'u4',
        afiliacaoId: 'dup-b',
        user: { ultimoAcessoEm: online },
      },
      {
        userId: 'u3',
        afiliacaoId: 'dup-a',
        user: { ultimoAcessoEm: online },
      },
    ])

    const { calcularStatsClubesOnboarding } = await import('@/lib/onboarding-clube-stats')
    const stats = await calcularStatsClubesOnboarding([
      { canonicalId: 'canon', afiliacaoIds: ['dup-a', 'dup-b'] },
    ])

    expect(stats.get('canon')).toEqual({
      sociosTotal: 2,
      sociosOnline: 1,
      torcedoresTotal: 2,
      torcedoresOnline: 2,
    })
  })
})
