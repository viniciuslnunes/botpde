import { afterEach, describe, expect, it, vi } from 'vitest'
import { SSE_IDLE_DATA, SSE_LONG_POLL_MS, SSE_PING_DATA } from '@/lib/sse-protocol'
import { createSsePingResponse, SSE_HEADERS } from '@/lib/sse-stream'

async function readAll(res: Response): Promise<string> {
  return res.text()
}

describe('createSsePingResponse', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('faz flush imediato e fecha com ping', async () => {
    const unsub = vi.fn()
    let emit: (() => void) | undefined

    const res = createSsePingResponse((onPing) => {
      emit = onPing
      return unsub
    })

    expect(res.headers.get('Content-Type')).toBe(SSE_HEADERS['Content-Type'])
    expect(res.headers.get('X-Accel-Buffering')).toBe('no')
    expect(res.headers.get('Content-Encoding')).toBeNull()
    expect(res.headers.get('Connection')).toBeNull()

    emit?.()
    const text = await readAll(res)
    expect(text).toContain(': connected')
    expect(text).toContain('retry: 5000')
    expect(text).toContain(`data: ${SSE_PING_DATA}`)
    expect(unsub).toHaveBeenCalled()
  })

  it('responde idle após o timeout do long-poll', async () => {
    vi.useFakeTimers()
    const unsub = vi.fn()
    const res = createSsePingResponse(() => unsub)

    const pending = readAll(res)
    await vi.advanceTimersByTimeAsync(SSE_LONG_POLL_MS)
    const text = await pending

    expect(text).toContain(': connected')
    expect(text).toContain(`data: ${SSE_IDLE_DATA}`)
    expect(unsub).toHaveBeenCalled()
  })

  it('não enfileira ping depois do idle', async () => {
    vi.useFakeTimers()
    let emit: (() => void) | undefined
    const res = createSsePingResponse((onPing) => {
      emit = onPing
      return () => {}
    })

    const pending = readAll(res)
    await vi.advanceTimersByTimeAsync(SSE_LONG_POLL_MS)
    const text = await pending
    expect(text).toContain(`data: ${SSE_IDLE_DATA}`)
    expect(text).not.toContain(`data: ${SSE_PING_DATA}`)

    expect(() => emit?.()).not.toThrow()
  })

  it('limpa no abort do request.signal', async () => {
    const unsub = vi.fn()
    const ac = new AbortController()
    const res = createSsePingResponse(() => unsub, ac.signal)
    ac.abort()
    // Stream fecha sem body obrigatório; unsubscribe deve rodar.
    await readAll(res).catch(() => undefined)
    expect(unsub).toHaveBeenCalled()
  })

  it('abort antes do start fecha na hora', async () => {
    const unsub = vi.fn()
    const ac = new AbortController()
    ac.abort()
    const res = createSsePingResponse(() => unsub, ac.signal)
    await readAll(res).catch(() => undefined)
    expect(unsub).not.toHaveBeenCalled()
  })
})
