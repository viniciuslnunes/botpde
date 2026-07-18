import { afterEach, describe, expect, it, vi } from 'vitest'
import { SSE_IDLE_DATA, SSE_LONG_POLL_MS, SSE_PING_DATA } from '@/lib/sse-protocol'
import { createSsePingResponse, SSE_HEADERS } from '@/lib/sse-stream'

describe('createSsePingResponse', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('responde com ping e headers anti-buffer', async () => {
    const unsub = vi.fn()
    let emit: (() => void) | undefined

    const pending = createSsePingResponse((onPing) => {
      emit = onPing
      return unsub
    })

    emit?.()
    const res = await pending

    expect(res.headers.get('Content-Type')).toBe(SSE_HEADERS['Content-Type'])
    expect(res.headers.get('X-Accel-Buffering')).toBe('no')
    expect(res.headers.get('Content-Encoding')).toBeNull()
    expect(res.headers.get('Connection')).toBeNull()

    const text = await res.text()
    expect(text).toContain(': connected')
    expect(text).toContain('retry: 5000')
    expect(text).toContain(`data: ${SSE_PING_DATA}`)
    expect(unsub).toHaveBeenCalled()
  })

  it('responde idle após o timeout do long-poll', async () => {
    vi.useFakeTimers()
    const unsub = vi.fn()
    const pending = createSsePingResponse(() => unsub)

    vi.advanceTimersByTime(SSE_LONG_POLL_MS)
    const res = await pending
    const text = await res.text()

    expect(text).toContain(`data: ${SSE_IDLE_DATA}`)
    expect(unsub).toHaveBeenCalled()
  })

  it('não resolve ping depois do idle', async () => {
    vi.useFakeTimers()
    let emit: (() => void) | undefined
    const pending = createSsePingResponse((onPing) => {
      emit = onPing
      return () => {}
    })

    vi.advanceTimersByTime(SSE_LONG_POLL_MS)
    const res = await pending
    expect(await res.text()).toContain(`data: ${SSE_IDLE_DATA}`)

    expect(() => emit?.()).not.toThrow()
  })

  it('limpa no abort do request.signal', async () => {
    const unsub = vi.fn()
    const ac = new AbortController()
    const pending = createSsePingResponse(() => unsub, ac.signal)
    ac.abort()
    const res = await pending
    expect(unsub).toHaveBeenCalled()
    expect(await res.text()).toContain(': aborted')
  })

  it('abort antes do start resolve na hora', async () => {
    const unsub = vi.fn()
    const ac = new AbortController()
    ac.abort()
    const res = await createSsePingResponse(() => unsub, ac.signal)
    expect(await res.text()).toContain(': aborted')
  })
})
