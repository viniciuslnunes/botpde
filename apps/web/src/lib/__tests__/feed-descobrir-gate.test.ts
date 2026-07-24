import { describe, expect, it, vi } from 'vitest'

// Stubs dos módulos vizinhos importados por feed.ts que puxam next/cache, prisma etc.
vi.mock('@torcida/db', () => ({ db: {}, Prisma: {} }))
vi.mock('@/lib/comunidade', () => ({ getFeedComunidade: vi.fn() }))
vi.mock('@/lib/comunidade-contexto', () => ({ getTenantIdsPorAfiliacao: vi.fn() }))
vi.mock('@/lib/hierarquia', () => ({ getVisibleTenantIds: vi.fn() }))
vi.mock('@/lib/perfil-social', () => ({
  getAutoresSemAcesso: vi.fn(),
  getContagensSeguimentoEmLote: vi.fn(),
  resolverAvatarSocial: vi.fn(),
  podeVerConteudoSocial: vi.fn(),
  resolverPerfilPrivadoEfetivo: vi.fn(),
}))
vi.mock('@/lib/social', () => ({ getSeguimentoStatus: vi.fn() }))
vi.mock('@/lib/autor-badges', () => ({ enriquecerPostsComBadges: vi.fn() }))
vi.mock('@/lib/noticias', () => ({ getNoticiasAprovadas: vi.fn() }))

import { deveAplicarGatePrivacidadeAutorDescobrir } from '@/lib/feed'

describe('deveAplicarGatePrivacidadeAutorDescobrir', () => {
  it('não aplica o gate a comunicado oficial (INSTITUCIONAL + comunicadoOrigemId)', () => {
    expect(
      deveAplicarGatePrivacidadeAutorDescobrir({
        tipo: 'INSTITUCIONAL',
        comunicadoOrigemId: 'comunicado-1',
        visibilidade: 'PUBLICO',
      }),
    ).toBe(false)
  })

  it('não aplica o gate a post "Só torcida" (TENANT), mesmo de sócio', () => {
    expect(
      deveAplicarGatePrivacidadeAutorDescobrir({
        tipo: 'MEMBRO',
        comunicadoOrigemId: null,
        visibilidade: 'TENANT',
      }),
    ).toBe(false)
  })

  it('aplica o gate a post MEMBRO PUBLICO comum', () => {
    expect(
      deveAplicarGatePrivacidadeAutorDescobrir({
        tipo: 'MEMBRO',
        comunicadoOrigemId: null,
        visibilidade: 'PUBLICO',
      }),
    ).toBe(true)
  })

  it('aplica o gate a INSTITUCIONAL sem comunicadoOrigemId (não deveria existir, mas defensivo)', () => {
    expect(
      deveAplicarGatePrivacidadeAutorDescobrir({
        tipo: 'INSTITUCIONAL',
        comunicadoOrigemId: null,
        visibilidade: 'PUBLICO',
      }),
    ).toBe(true)
  })
})
