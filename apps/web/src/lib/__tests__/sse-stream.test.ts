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
    // Sem Content-Encoding — `none` não é coding válido e quebra HTTP/2 no Chrome.
    expect(res.headers.get('Content-Encoding')).toBeNull()
    // Hop-by-hop proibido em HTTP/2 — causa ERR_HTTP2_PROTOCOL_ERROR no Chrome.
    expect(res.headers.get('Connection')).toBeNull()
    expect(res.body).toBeTruthy()

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    const first = await reader.read()
    const firstText = decoder.decode(first.value)
    expect(firstText).toContain(': connected')
    expect(firstText).toContain('retry: 5000')

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

  it('fecha no abort do request.signal', async () => {
    const unsub = vi.fn()
    const ac = new AbortController()
    const res = createSsePingResponse(() => unsub, ac.signal)
    const reader = res.body!.getReader()
    await reader.read()
    ac.abort()
    // dá um tick para o listener rodar
    await Promise.resolve()
    expect(unsub).toHaveBeenCalled()
  })

  it('sinaliza reconnect antes do bye e fecha limpo', async () => {
    vi.useFakeTimers()
    const unsub = vi.fn()
    const res = createSsePingResponse(() => unsub)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    await reader.read() // connected

    vi.advanceTimersByTime(18_000)

    let sawReconnect = false
    for (let i = 0; i < 8; i++) {
      const chunk = await reader.read()
      if (chunk.done) break
      const text = decoder.decode(chunk.value)
      if (text.includes('data: reconnect')) {
        sawReconnect = true
        break
      }
    }
    expect(sawReconnect).toBe(true)

    vi.advanceTimersByTime(5_000)

    let text = ''
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      text += decoder.decode(chunk.value)
    }
    expect(text).toContain(': bye')
    expect(unsub).toHaveBeenCalled()
  })
})
