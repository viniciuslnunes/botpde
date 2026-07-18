import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSsePingResponse, SSE_HEADERS } from '@/lib/sse-stream'

describe('createSsePingResponse', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('envia connected + ping e headers anti-buffer', async () => {
    const unsub = vi.fn()
    let emit: (() => void) | undefined

    const res = createSsePingResponse((onPing) => {
      emit = onPing
      return unsub
    })

    expect(res.headers.get('Content-Type')).toBe(SSE_HEADERS['Content-Type'])
    expect(res.headers.get('X-Accel-Buffering')).toBe('no')
    expect(res.body).toBeTruthy()

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    const first = await reader.read()
    expect(decoder.decode(first.value)).toContain(': connected')

    emit?.()
    const second = await reader.read()
    expect(decoder.decode(second.value)).toContain('data: ping')

    await reader.cancel()
    expect(unsub).toHaveBeenCalled()
  })

  it('não explode enqueue após cancel', async () => {
    vi.useFakeTimers()
    let emit: (() => void) | undefined
    const res = createSsePingResponse((onPing) => {
      emit = onPing
      return () => {}
    })
    const reader = res.body!.getReader()
    await reader.read() // connected
    await reader.cancel()

    expect(() => emit?.()).not.toThrow()
    expect(() => {
      vi.advanceTimersByTime(20_000)
    }).not.toThrow()
  })
})
