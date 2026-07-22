import { describe, expect, it } from 'vitest'
import { deveExibirBadgeTorcidaNoFeed } from '@/lib/feed-live-refresh'

describe('deveExibirBadgeTorcidaNoFeed', () => {
  const viewerTenantId = 'tenant-viewer'
  const outroTenantId = 'tenant-outro'

  it('sempre exibe no escopo nacional', () => {
    expect(
      deveExibirBadgeTorcidaNoFeed({
        postTenantId: viewerTenantId,
        viewerTenantId,
        visibilidade: 'TENANT',
        escopoNacional: true,
      }),
    ).toBe(true)
  })

  it('exibe em post público da própria torcida', () => {
    expect(
      deveExibirBadgeTorcidaNoFeed({
        postTenantId: viewerTenantId,
        viewerTenantId,
        visibilidade: 'PUBLICO',
      }),
    ).toBe(true)
  })

  it('oculta em post interno da própria torcida', () => {
    expect(
      deveExibirBadgeTorcidaNoFeed({
        postTenantId: viewerTenantId,
        viewerTenantId,
        visibilidade: 'TENANT',
      }),
    ).toBe(false)
  })

  it('exibe em post de outra torcida', () => {
    expect(
      deveExibirBadgeTorcidaNoFeed({
        postTenantId: outroTenantId,
        viewerTenantId,
        visibilidade: 'TENANT',
      }),
    ).toBe(true)
  })
})
