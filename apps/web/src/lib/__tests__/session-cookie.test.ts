import { describe, expect, it, afterEach } from 'vitest'
import { resolveSharedCookieDomain } from '@/lib/session-cookie'

describe('resolveSharedCookieDomain', () => {
  const envBackup = { ...process.env }

  afterEach(() => {
    process.env = { ...envBackup }
  })

  it('retorna undefined sem ROOT_DOMAIN', () => {
    delete process.env.ROOT_DOMAIN
    expect(resolveSharedCookieDomain()).toBeUndefined()
  })

  it('usa ROOT_DOMAIN quando AUTH_URL bate com o domínio raiz', () => {
    process.env.ROOT_DOMAIN = 'torcida.app'
    process.env.AUTH_URL = 'https://torcida.app'
    delete process.env.RAILWAY_PUBLIC_DOMAIN
    expect(resolveSharedCookieDomain()).toBe('.torcida.app')
  })

  it('não força ROOT_DOMAIN em deploy Railway (*.up.railway.app)', () => {
    process.env.ROOT_DOMAIN = 'torcida.app'
    process.env.RAILWAY_PUBLIC_DOMAIN = 'torcidaweb-production.up.railway.app'
    delete process.env.AUTH_URL
    expect(resolveSharedCookieDomain()).toBeUndefined()
  })
})
