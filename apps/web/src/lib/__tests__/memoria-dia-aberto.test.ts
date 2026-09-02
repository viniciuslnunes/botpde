import { describe, expect, it } from 'vitest'
import { MEMORIA_ESCOPO } from '@torcida/types'
import { hrefMemoriaDia } from '@/lib/memoria-dia-aberto'
import { tituloMemoriaDia } from '@/lib/memoria-meta'
import { montarMemoria } from '@/lib/memoria-dia'

describe('hrefMemoriaDia', () => {
  it('monta deep link com escopo', () => {
    expect(hrefMemoriaDia('2026-08-19', MEMORIA_ESCOPO.CLUBE)).toBe(
      '/portal/memoria?dia=2026-08-19&escopo=clube',
    )
  })
})

describe('tituloMemoriaDia', () => {
  it('rotula por escopo', () => {
    expect(tituloMemoriaDia('2026-08-19', MEMORIA_ESCOPO.TORCIDA)).toMatch(/torcida/i)
  })
})

describe('montarMemoria coirmã', () => {
  it('marca post de aliado', () => {
    const { porDia } = montarMemoria(
      {
        posts: [
          {
            id: 'p1',
            conteudo: 'Da coirmã',
            criadoEm: '2026-08-19T16:00:00.000Z',
            imagemUrl: null,
            midiaUrls: [],
            autorId: 'u1',
            autorNome: 'Aliado',
            autorAvatar: null,
            tenantId: 't-aliado',
            tenantNome: 'Camisa 12',
          },
        ],
        eventos: [],
        partidas: [],
      },
      { homeTenantId: 't-home', idsAliados: ['t-aliado'] },
    )
    expect(porDia['2026-08-19']?.posts[0]?.deCoirma).toBe(true)
  })
})
