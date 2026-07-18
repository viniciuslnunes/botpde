import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pauseSseForSoftNav, resetSseNavGateForTests } from '@/lib/sse-nav-gate'
import {
  resetSharedSseForTests,
  subscribeSharedSse,
} from '@/lib/sse-shared-source'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((ev: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  url: string

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  emit(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>)
  }
}

describe('subscribeSharedSse', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource)
    FakeEventSource.instances = []
    resetSseNavGateForTests()
    resetSharedSseForTests()
  })

  afterEach(() => {
    resetSharedSseForTests()
    resetSseNavGateForTests()
    vi.unstubAllGlobals()
  })

  it('reusa um EventSource para o mesmo endpoint', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = subscribeSharedSse('/api/conversas/stream', a)
    const unsubB = subscribeSharedSse('/api/conversas/stream', b)
    expect(FakeEventSource.instances).toHaveLength(1)

    FakeEventSource.instances[0]!.emit('ping')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)

    unsubA()
    expect(FakeEventSource.instances[0]!.closed).toBe(false)
    unsubB()
    expect(FakeEventSource.instances[0]!.closed).toBe(true)
  })

  it('fecha no soft-nav gate e não deixa stream órfão', () => {
    const onPing = vi.fn()
    const unsub = subscribeSharedSse('/api/notificacoes/stream', onPing)
    expect(FakeEventSource.instances).toHaveLength(1)
    pauseSseForSoftNav(1_000)
    expect(FakeEventSource.instances[0]!.closed).toBe(true)
    unsub()
  })
})
