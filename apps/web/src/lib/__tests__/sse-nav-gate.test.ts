import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isInternalSoftNavHref,
  isSsePausedForNav,
  pauseSseForSoftNav,
  registerSseCloser,
  resetSseNavGateForTests,
  subscribeSseNavGate,
} from '@/lib/sse-nav-gate'

describe('sse-nav-gate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    resetSseNavGateForTests()
  })

  afterEach(() => {
    resetSseNavGateForTests()
    vi.useRealTimers()
  })

  it('fecha closers de forma síncrona no pause', () => {
    const close = vi.fn()
    const unregister = registerSseCloser(close)
    pauseSseForSoftNav(1_000)
    expect(close).toHaveBeenCalledTimes(1)
    expect(isSsePausedForNav()).toBe(true)
    unregister()
  })

  it('notifica subscribers e libera após o quiet period', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSseNavGate(listener)
    pauseSseForSoftNav(500)
    expect(listener).toHaveBeenCalled()
    expect(isSsePausedForNav()).toBe(true)

    listener.mockClear()
    vi.advanceTimersByTime(520)
    expect(isSsePausedForNav()).toBe(false)
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it('reconhece hrefs de soft-nav interna', () => {
    expect(
      isInternalSoftNavHref(
        '/portal/comunidade/perfil/abc',
        'https://app.example',
        '/portal/comunidade',
        '',
      ),
    ).toBe(true)
    expect(
      isInternalSoftNavHref(
        '/portal/comunidade',
        'https://app.example',
        '/portal/comunidade',
        '',
      ),
    ).toBe(false)
    expect(
      isInternalSoftNavHref('https://other.example/x', 'https://app.example', '/', ''),
    ).toBe(false)
    expect(isInternalSoftNavHref('#topo', 'https://app.example', '/', '')).toBe(false)
  })
})
