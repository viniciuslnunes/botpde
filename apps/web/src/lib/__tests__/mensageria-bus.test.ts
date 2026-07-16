import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  isRedisConfigured: () => false,
  getRedisUrl: () => {
    throw new Error('Redis não configurado')
  },
}))

describe('mensageria-bus', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('emite ping de conversa e inbox dos membros', async () => {
    const { emitMensagemNova, subscribeConversaMensagem, subscribeInboxMensagem } = await import(
      '@/lib/mensageria-bus'
    )
    const onThread = vi.fn()
    const onInboxA = vi.fn()
    const onInboxB = vi.fn()

    subscribeConversaMensagem('c1', onThread)
    subscribeInboxMensagem('u1', onInboxA)
    subscribeInboxMensagem('u2', onInboxB)

    emitMensagemNova('c1', ['u1', 'u2', 'u1'])

    expect(onThread).toHaveBeenCalledTimes(1)
    expect(onInboxA).toHaveBeenCalledTimes(1)
    expect(onInboxB).toHaveBeenCalledTimes(1)
  })
})
