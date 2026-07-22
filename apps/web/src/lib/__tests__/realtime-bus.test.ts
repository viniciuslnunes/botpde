import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  isRedisConfigured: () => false,
  getRedisUrl: () => {
    throw new Error('Redis não configurado')
  },
}))

describe('realtime-bus (in-memory)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('emite e entrega ping local no feed', async () => {
    const { emitFeedPing, subscribeFeedPing } = await import('@/lib/feed-bus')
    const onPing = vi.fn()
    const unsub = subscribeFeedPing('tenant-a', onPing)
    emitFeedPing('tenant-a')
    emitFeedPing('tenant-b')
    expect(onPing).toHaveBeenCalledTimes(1)
    unsub()
    emitFeedPing('tenant-a')
    expect(onPing).toHaveBeenCalledTimes(1)
  })

  it('emite ping de notificação por usuário', async () => {
    const { emitNotificacaoPing, subscribeNotificacaoPing } = await import(
      '@/lib/notificacoes-bus'
    )
    const onPing = vi.fn()
    subscribeNotificacaoPing('t1', 'u1', onPing)
    emitNotificacaoPing('t1', 'u1')
    emitNotificacaoPing('t1', 'u2')
    expect(onPing).toHaveBeenCalledTimes(1)
  })

  it('emite e entrega ping local no feed nacional', async () => {
    const { emitFeedNacionalPing, subscribeFeedNacionalPing } = await import('@/lib/feed-bus')
    const onPing = vi.fn()
    const unsub = subscribeFeedNacionalPing('aff-1', onPing)
    emitFeedNacionalPing('aff-1')
    emitFeedNacionalPing('aff-2')
    expect(onPing).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('gera chaves de canal estáveis', async () => {
    const { feedBusKey, feedNacionalBusKey, notificacaoBusKey } = await import('@/lib/realtime-bus')
    expect(feedBusKey('abc')).toBe('feed:abc')
    expect(feedNacionalBusKey('aff')).toBe('feed-nacional:aff')
    expect(notificacaoBusKey('t', 'u')).toBe('notif:t:u')
  })
})
