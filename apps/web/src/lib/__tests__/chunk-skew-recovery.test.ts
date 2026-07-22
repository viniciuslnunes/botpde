import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimChunkSkewReload,
  installChunkSkewRecovery,
  isChunkLoadError,
} from '../chunk-skew-recovery'
import { beforeSend } from '../sentry-filter'
import type { ErrorEvent, EventHint } from '@sentry/nextjs'

describe('isChunkLoadError', () => {
  it('detecta ChunkLoadError por name', () => {
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(
      true,
    )
  })

  it('detecta mensagens Turbopack / webpack / dynamic import', () => {
    expect(
      isChunkLoadError('Failed to load chunk /_next/static/chunks/3tj-fx3u4kop2.js from module 18402'),
    ).toBe(true)
    expect(isChunkLoadError(new Error('Loading chunk 5760 failed'))).toBe(true)
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/a.js')),
    ).toBe(true)
  })

  it('ignora erros comuns', () => {
    expect(isChunkLoadError(new Error('NetworkError'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('claimChunkSkewReload', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('permite o primeiro reload e bloqueia dentro do cooldown', () => {
    expect(claimChunkSkewReload(1_000)).toBe(true)
    expect(claimChunkSkewReload(5_000)).toBe(false)
    expect(claimChunkSkewReload(40_000)).toBe(true)
  })
})

describe('installChunkSkewRecovery', () => {
  const store = new Map<string, string>()
  let errorHandler: ((e: ErrorEvent) => void) | undefined
  let rejectionHandler: ((e: PromiseRejectionEvent) => void) | undefined

  beforeEach(() => {
    store.clear()
    errorHandler = undefined
    rejectionHandler = undefined
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
    vi.stubGlobal('window', {
      addEventListener: (type: string, handler: EventListener) => {
        if (type === 'error') errorHandler = handler as (e: ErrorEvent) => void
        if (type === 'unhandledrejection') {
          rejectionHandler = handler as (e: PromiseRejectionEvent) => void
        }
      },
      removeEventListener: () => {},
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('recarrega em unhandledrejection de ChunkLoadError', () => {
    const reload = vi.fn()
    installChunkSkewRecovery(reload)
    rejectionHandler?.({
      reason: Object.assign(new Error('Failed to load chunk a.js'), { name: 'ChunkLoadError' }),
    } as PromiseRejectionEvent)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('não recarrega em erro sem relação com chunk', () => {
    const reload = vi.fn()
    installChunkSkewRecovery(reload)
    errorHandler?.({ error: new Error('boom'), message: 'boom' } as ErrorEvent)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('beforeSend ChunkLoadError', () => {
  it('descarta ChunkLoadError do hint', () => {
    const event = { exception: { values: [] } } as unknown as ErrorEvent
    const hint = {
      originalException: Object.assign(new Error('Failed to load chunk'), {
        name: 'ChunkLoadError',
      }),
    } as EventHint
    expect(beforeSend(event, hint)).toBeNull()
  })

  it('descarta por type no event', () => {
    const event = {
      exception: { values: [{ type: 'ChunkLoadError', value: 'Failed to load chunk' }] },
    } as unknown as ErrorEvent
    expect(beforeSend(event, {} as EventHint)).toBeNull()
  })
})
