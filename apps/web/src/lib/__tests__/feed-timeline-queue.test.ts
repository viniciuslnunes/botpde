import { describe, expect, it, vi, beforeEach } from 'vitest'

const fanoutSeguidores = vi.fn(
  async (_seed: { postId: string; autorId: string; criadoEm: Date }) => undefined,
)

vi.mock('@/lib/env', () => ({
  isRedisConfigured: () => false,
  getRedisUrl: () => {
    throw new Error('no redis')
  },
}))

vi.mock('@/lib/feed-timeline', () => ({
  fanoutSeguidoresPostParaRede: (seed: {
    postId: string
    autorId: string
    criadoEm: Date
  }) => fanoutSeguidores(seed),
}))

vi.mock('@/lib/redis-client', () => ({
  getRedisCommandClient: async () => null,
}))

describe('feed-timeline-queue', () => {
  beforeEach(() => {
    vi.resetModules()
    fanoutSeguidores.mockClear()
  })

  it('processa job na fila in-process sem Redis', async () => {
    const { scheduleFanoutPostParaRede } = await import('@/lib/feed-timeline-queue')
    scheduleFanoutPostParaRede({
      postId: 'p1',
      autorId: 'a1',
      criadoEm: new Date('2026-07-16T12:00:00.000Z'),
    })

    await vi.waitFor(() => {
      expect(fanoutSeguidores).toHaveBeenCalledTimes(1)
    })

    expect(fanoutSeguidores).toHaveBeenCalledWith({
      postId: 'p1',
      autorId: 'a1',
      criadoEm: new Date('2026-07-16T12:00:00.000Z'),
    })
  })
})
