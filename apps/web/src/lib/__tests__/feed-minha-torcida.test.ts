import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Invariante da aba "Minha torcida": o feed é a organização, não a praça.
 *
 * O tenant sintético da Comunidade Nacional já vazou para cá uma vez (entrava
 * como "sugestão" no feed do sócio) e a aba virou uma segunda CN, com post de
 * torcedor global no meio dos posts da torcida. Este teste trava a regra: só a
 * própria torcida e a hierarquia dela — sem CN, sem aliadas.
 */

const getAncestorTenantIds = vi.hoisted(() => vi.fn())
const getDescendantTenantIds = vi.hoisted(() => vi.fn())
const getVisibleTenantIds = vi.hoisted(() => vi.fn())
const isTenantRestrito = vi.hoisted(() => vi.fn())
const filtrarTenantsRestritos = vi.hoisted(() => vi.fn())

// Stubs dos módulos vizinhos importados por feed.ts que puxam prisma etc.
vi.mock('@torcida/db', () => ({ db: {}, Prisma: {} }))
vi.mock('@/lib/comunidade', () => ({ getFeedComunidade: vi.fn() }))
vi.mock('@/lib/comunidade-contexto', () => ({ getTenantIdsPorAfiliacao: vi.fn() }))
vi.mock('@/lib/hierarquia', () => ({
  getAncestorTenantIds,
  getDescendantTenantIds,
  getVisibleTenantIds,
}))
vi.mock('@/lib/isolamento', () => ({
  ISOLAMENTO_CACHE_TAG: 'isolamento',
  isTenantRestrito,
  filtrarTenantsRestritos,
}))
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

import { orFeedInternoDoTenant, orFeedVisibilidadeSeguindo, resolveTenantIdsMinhaTorcida } from '@/lib/feed'

const SEDE = 'sede-1'
const SUBSEDE = 'subsede-1'
const PDE = 'pde-1'

describe('resolveTenantIdsMinhaTorcida', () => {
  beforeEach(() => {
    getAncestorTenantIds.mockReset()
    getDescendantTenantIds.mockReset()
    isTenantRestrito.mockReset()
    filtrarTenantsRestritos.mockReset()
    // Sem unidade restrita, o filtro é identidade.
    filtrarTenantsRestritos.mockImplementation(async (ids: string[]) => ids)
  })

  it('devolve a própria torcida e a hierarquia dela', async () => {
    getAncestorTenantIds.mockResolvedValue([SEDE])
    getDescendantTenantIds.mockResolvedValue([PDE])
    isTenantRestrito.mockResolvedValue(false)

    const ids = await resolveTenantIdsMinhaTorcida(SUBSEDE)

    expect([...ids].sort()).toEqual([PDE, SEDE, SUBSEDE].sort())
  })

  it('nunca chama a resolução de aliados — aliada não entra em Minha torcida', async () => {
    getAncestorTenantIds.mockResolvedValue([])
    getDescendantTenantIds.mockResolvedValue([])
    isTenantRestrito.mockResolvedValue(false)

    const ids = await resolveTenantIdsMinhaTorcida(SEDE)

    // `getVisibleTenantIds` é o conjunto que inclui aliados; o feed da aba
    // não pode passar por ele.
    expect(getVisibleTenantIds).not.toHaveBeenCalled()
    expect(ids).toEqual([SEDE])
  })

  it('R5 — unidade com canal restrito não enxerga o ancestral', async () => {
    getAncestorTenantIds.mockResolvedValue([SEDE])
    getDescendantTenantIds.mockResolvedValue([])
    isTenantRestrito.mockResolvedValue(true)

    const ids = await resolveTenantIdsMinhaTorcida(PDE)

    expect(ids).toEqual([PDE])
    expect(ids).not.toContain(SEDE)
  })

  it('preserva o próprio tenant ao filtrar unidades restritas', async () => {
    getAncestorTenantIds.mockResolvedValue([])
    getDescendantTenantIds.mockResolvedValue([PDE])
    isTenantRestrito.mockResolvedValue(false)

    await resolveTenantIdsMinhaTorcida(SEDE)

    // `manter = tenantId`: a comunidade interna da própria unidade segue viva
    // mesmo que ela apareça como restrita para terceiros.
    expect(filtrarTenantsRestritos).toHaveBeenCalledWith(expect.arrayContaining([SEDE, PDE]), SEDE)
  })
})

/**
 * "Só torcida" (TENANT) tem casa na aba, mas o balde interno é o ponto exato
 * onde um post interno de OUTRA torcida da hierarquia vazaria: basta trocar
 * `tenantId` por `{ in: visibleTenantIds }`. O teste trava esse contrato.
 */
describe('orFeedInternoDoTenant', () => {
  it('admite TENANT só do tenant ativo, nunca da hierarquia inteira', () => {
    expect(orFeedInternoDoTenant(SUBSEDE)).toEqual({
      tenantId: SUBSEDE,
      tipo: 'MEMBRO',
      visibilidade: 'TENANT',
    })
  })

  it('não admite PRIVADO — "Só seguidores" continua fora do Descobrir via balde interno', () => {
    expect(orFeedInternoDoTenant(SEDE).visibilidade).toBe('TENANT')
  })
})

/**
 * Seguindo: PUBLICO + TENANT do tenant ativo + PRIVADO (gate = timeline /
 * follow APROVADO). TENANT de outra unidade da hierarquia não entra pelo ramo
 * interno — só com tenantId explícito do viewer.
 */
describe('orFeedVisibilidadeSeguindo', () => {
  it('admite PUBLICO, TENANT do tenant ativo e PRIVADO', () => {
    expect(orFeedVisibilidadeSeguindo(SUBSEDE)).toEqual([
      { visibilidade: 'PUBLICO' },
      { tenantId: SUBSEDE, visibilidade: 'TENANT' },
      { visibilidade: 'PRIVADO' },
    ])
  })

  it('TENANT de outro tenant da hierarquia não entra pelo ramo interno', () => {
    const ramos = orFeedVisibilidadeSeguindo(SEDE)
    const ramoTenant = ramos.find((r) => r.visibilidade === 'TENANT')
    expect(ramoTenant).toEqual({ tenantId: SEDE, visibilidade: 'TENANT' })
    expect(ramoTenant).not.toEqual({ tenantId: PDE, visibilidade: 'TENANT' })
  })
})
