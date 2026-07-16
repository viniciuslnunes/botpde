import { describe, expect, it, vi, beforeEach } from 'vitest'

const fanoutSeguidores = vi.fn(
  async (_seed: { postId: string; autorId: string; criadoEm: Date }) => undefined,
)
const emitFeedPingMock = vi.fn()

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

vi.mock('@/lib/feed-bus', () => ({
  emitFeedPing: (tenantId: string) => emitFeedPingMock(tenantId),
}))

vi.mock('@/lib/redis-client', () => ({
  getRedisCommandClient: async () => null,
}))

describe('feed-timeline-queue', () => {
  beforeEach(() => {
    vi.resetModules()
    fanoutSeguidores.mockClear()
    emitFeedPingMock.mockClear()
  })

  it('processa job na fila in-process e emite ping após fan-out', async () => {
    const { scheduleFanoutPostParaRede } = await import('@/lib/feed-timeline-queue')
    scheduleFanoutPostParaRede({
      postId: 'p1',
      autorId: 'a1',
      tenantId: 't1',
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

    await vi.waitFor(() => {
      expect(emitFeedPingMock).toHaveBeenCalledWith('t1')
    })
  })

  it('emite ping mesmo se o fan-out falhar', async () => {
    fanoutSeguidores.mockRejectedValueOnce(new Error('boom'))
    const { scheduleFanoutPostParaRede } = await import('@/lib/feed-timeline-queue')
    scheduleFanoutPostParaRede({
      postId: 'p2',
      autorId: 'a2',
      tenantId: 't2',
      criadoEm: new Date('2026-07-16T12:00:00.000Z'),
    })

    await vi.waitFor(() => {
      expect(emitFeedPingMock).toHaveBeenCalledWith('t2')
    })
  })
})
