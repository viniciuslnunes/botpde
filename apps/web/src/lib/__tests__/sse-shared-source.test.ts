import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pauseSseForSoftNav, resetSseNavGateForTests } from '@/lib/sse-nav-gate'
import {
  consumeSseDataFrames,
  resetSharedSseForTests,
  subscribeSharedSse,
} from '@/lib/sse-shared-source'

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[i]))
      i += 1
    },
  })
}

describe('consumeSseDataFrames', () => {
  it('parseia data: e ignora comentários', () => {
    const { rest, payloads } = consumeSseDataFrames(
      ': keep-alive\n\ndata: ping\n\ndata: idle\n\npartial',
    )
    expect(payloads).toEqual(['ping', 'idle'])
    expect(rest).toBe('partial')
  })
})

describe('subscribeSharedSse', () => {
  beforeEach(() => {
    resetSseNavGateForTests()
    resetSharedSseForTests()
  })

  afterEach(() => {
    resetSharedSseForTests()
    resetSseNavGateForTests()
    vi.unstubAllGlobals()
  })

  it('reusa um fetch para o mesmo endpoint', async () => {
    let release!: (chunks: string[]) => void
    const fetchMock = vi.fn().mockImplementation(() => {
      return new Promise<{ ok: boolean; body: ReadableStream<Uint8Array> }>((resolve) => {
        release = (chunks) => {
          resolve({ ok: true, body: sseBody(chunks) })
        }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const a = vi.fn()
    const b = vi.fn()
    const unsubA = subscribeSharedSse('/api/conversas/stream', a)
    const unsubB = subscribeSharedSse('/api/conversas/stream', b)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // Hold aberto: A e B compartilham o mesmo fetch antes do body chegar.
    expect(fetchMock).toHaveBeenCalledTimes(1)

    release(['retry: 5000\n: connected\n\ndata: ping\n\n'])
    await vi.waitFor(() => expect(a).toHaveBeenCalledTimes(1))
    expect(b).toHaveBeenCalledTimes(1)

    unsubA()
    unsubB()
  })

  it('fecha no soft-nav gate (abort) e não deixa stream órfão', async () => {
    let signal: AbortSignal | undefined
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return Promise.resolve({
        ok: true,
        body: sseBody([': connected\n\n']),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const onPing = vi.fn()
    const unsub = subscribeSharedSse('/api/notificacoes/stream', onPing)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(signal?.aborted).toBe(false)

    pauseSseForSoftNav(1_000)
    expect(signal?.aborted).toBe(true)
    unsub()
  })

  it('reconecta limpo ao receber data: idle', async () => {
    let calls = 0
    const fetchMock = vi.fn().mockImplementation(() => {
      calls += 1
      if (calls === 1) {
        return Promise.resolve({
          ok: true,
          body: sseBody(['data: idle\n\n']),
        })
      }
      return Promise.resolve({
        ok: true,
        body: sseBody(['data: ping\n\n']),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const onPing = vi.fn()
    const unsub = subscribeSharedSse('/api/notificacoes/stream', onPing)
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2))
    await vi.waitFor(() => expect(onPing).toHaveBeenCalled())
    unsub()
  })

  it('notifica ping e reconecta sem contar falha', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: sseBody(['data: ping\n\n']),
    })
    vi.stubGlobal('fetch', fetchMock)

    const onPing = vi.fn()
    const unsub = subscribeSharedSse('/api/comunidade/feed/stream', onPing)
    await vi.waitFor(() => expect(onPing).toHaveBeenCalled())
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2))
    unsub()
  })
})
