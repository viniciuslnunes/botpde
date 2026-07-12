import { describe, expect, it } from 'vitest'
import { getPublicOrigin, publicUrl } from '@/lib/request-origin'

describe('getPublicOrigin', () => {
  it('usa x-forwarded-host e x-forwarded-proto do proxy', () => {
    const request = new Request('http://localhost:3000/auth/contexto', {
      headers: {
        host: 'localhost:3000',
        'x-forwarded-host': 'torcida.app',
        'x-forwarded-proto': 'https',
      },
    })
    expect(getPublicOrigin(request)).toBe('https://torcida.app')
  })

  it('monta URL pública a partir do host encaminhado', () => {
    const request = new Request('http://127.0.0.1:8080/entrar', {
      headers: {
        host: '127.0.0.1:8080',
        'x-forwarded-host': 'torcida.app',
        'x-forwarded-proto': 'https',
      },
    })
    expect(publicUrl('/auth/contexto', request).href).toBe('https://torcida.app/auth/contexto')
  })
})
