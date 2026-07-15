import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecomendacaoAliancaListItem } from '@/lib/aliancas'
import { buildCoIrmaRecomendacoes, confiancaRank, filterAndSortRecomendacoes } from '@/lib/aliancas'

function rec(
  overrides: Partial<RecomendacaoAliancaListItem> &
    Pick<RecomendacaoAliancaListItem, 'id' | 'nomeSugerido' | 'confianca'>,
): RecomendacaoAliancaListItem {
  return {
    tenantId: 'tenant-a',
    tenantSugeridoId: null,
    tenantSugeridoSlug: null,
    tenantSugeridoNome: overrides.nomeSugerido,
    fonte: 'teste',
    observacao: null,
    criadoEm: new Date('2026-01-01'),
    tipo: 'ALIADA',
    podePropor: overrides.confianca === 'ALTA' && Boolean(overrides.tenantSugeridoId),
    ...overrides,
  }
}

describe('confiancaRank', () => {
  it('ordena ALTA antes de MEDIA e BAIXA', () => {
    expect(confiancaRank('ALTA')).toBeLessThan(confiancaRank('MEDIA'))
    expect(confiancaRank('MEDIA')).toBeLessThan(confiancaRank('BAIXA'))
  })
})

describe('filterAndSortRecomendacoes', () => {
  it('omite recomendações cujo tenant já tem ATIVA/PENDENTE', () => {
    const items = [
      rec({
        id: '1',
        nomeSugerido: 'Remoçada',
        confianca: 'ALTA',
        tenantSugeridoId: 'remocada',
        podePropor: true,
      }),
      rec({
        id: '2',
        nomeSugerido: 'Outra',
        confianca: 'MEDIA',
        tenantSugeridoId: 'outra',
      }),
    ]
    const filtered = filterAndSortRecomendacoes(items, new Set(['remocada']))
    expect(filtered.map((i) => i.id)).toEqual(['2'])
  })

  it('mantém recomendações só por nome (sem tenant mapeado)', () => {
    const items = [rec({ id: '1', nomeSugerido: 'Remoçada', confianca: 'ALTA' })]
    expect(filterAndSortRecomendacoes(items, new Set(['outro'])).map((i) => i.id)).toEqual(['1'])
  })

  it('ordena ALTA → MEDIA → BAIXA', () => {
    const items = [
      rec({ id: 'b', nomeSugerido: 'Baixa', confianca: 'BAIXA', criadoEm: new Date('2026-03-01') }),
      rec({ id: 'a', nomeSugerido: 'Alta', confianca: 'ALTA', criadoEm: new Date('2026-01-01') }),
      rec({ id: 'm', nomeSugerido: 'Media', confianca: 'MEDIA', criadoEm: new Date('2026-02-01') }),
    ]
    expect(filterAndSortRecomendacoes(items, new Set()).map((i) => i.id)).toEqual(['a', 'm', 'b'])
  })

  it('prioriza co-irmãs antes de aliadas', () => {
    const items = [
      rec({ id: 'aliada', nomeSugerido: 'Remoçada', confianca: 'ALTA', tipo: 'ALIADA' }),
      {
        ...rec({ id: 'co', nomeSugerido: 'Camisa 12', confianca: 'ALTA', tipo: 'CO_IRMA' }),
        podePropor: false,
      },
    ]
    expect(filterAndSortRecomendacoes(items, new Set()).map((i) => i.id)).toEqual(['co', 'aliada'])
  })
})

describe('buildCoIrmaRecomendacoes', () => {
  it('marca ALTA, tipo CO_IRMA e não permite propor aliança', () => {
    const items = buildCoIrmaRecomendacoes('tenant-gavioes', [
      { id: 'c12', nome: 'Camisa 12', slug: 'camisa-12-corinthians', afiliacaoNome: 'Corinthians' },
    ])
    expect(items).toHaveLength(1)
    expect(items[0]?.tipo).toBe('CO_IRMA')
    expect(items[0]?.confianca).toBe('ALTA')
    expect(items[0]?.podePropor).toBe(false)
    expect(items[0]?.fonte).toBe('Mesmo time (Corinthians)')
    expect(items[0]?.observacao).toBeNull()
  })
})

const findFirstAlianca = vi.hoisted(() => vi.fn())
const createAlianca = vi.hoisted(() => vi.fn())
const updateAlianca = vi.hoisted(() => vi.fn())
const findFirstTenant = vi.hoisted(() => vi.fn())
const findUniqueTenant = vi.hoisted(() => vi.fn())
const findFirstRec = vi.hoisted(() => vi.fn())
const createAudit = vi.hoisted(() => vi.fn())
const assertPermission = vi.hoisted(() => vi.fn())
const invalidateHierarchyCache = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    alianca: {
      findFirst: findFirstAlianca,
      create: createAlianca,
      update: updateAlianca,
    },
    tenant: { findFirst: findFirstTenant, findUnique: findUniqueTenant },
    recomendacaoAlianca: { findFirst: findFirstRec },
    auditLog: { create: createAudit },
  },
}))

vi.mock('@/lib/authz', () => ({
  assertPermission,
}))

vi.mock('@/lib/hierarquia', () => ({
  invalidateHierarchyCache,
  getTorcidaLineageTenantIds: vi.fn(async (id: string) => [id]),
}))

vi.mock('next/cache', () => ({
  revalidatePath,
}))

import {
  aceitarAlianca,
  cancelarProposta,
  encerrarAlianca,
  proporAlianca,
  proporAliancaFromRecomendacao,
} from '@/app/admin/aliancas/actions'

describe('proporAlianca — co-irmã bloqueada', () => {
  beforeEach(() => {
    findFirstAlianca.mockReset()
    createAlianca.mockReset()
    findFirstTenant.mockReset()
    findUniqueTenant.mockReset()
    createAudit.mockReset()
    assertPermission.mockReset()
    invalidateHierarchyCache.mockReset()
    revalidatePath.mockReset()
  })

  it('recusa proposta entre organizadas do mesmo time', async () => {
    const gavioes = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const camisa12 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const afiliacao = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

    assertPermission.mockResolvedValue({
      session: { user: { id: 'user-1' } },
      tenant: { id: gavioes, nome: 'Gavioes', slug: 'pde-gavioes-fiel' },
    })
    findFirstTenant.mockResolvedValue({
      id: camisa12,
      nome: 'Camisa 12',
      slug: 'camisa-12-corinthians',
      afiliacaoId: afiliacao,
    })
    findUniqueTenant.mockResolvedValue({ afiliacaoId: afiliacao })

    await expect(proporAlianca(camisa12)).rejects.toThrow(/co-irmãs/i)
    expect(createAlianca).not.toHaveBeenCalled()
  })
})

describe('proporAlianca — semântica origem/aliado', () => {
  const proposerTenant = {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    nome: 'Proponente',
    slug: 'proponente',
  }
  const targetTenant = {
    id: '00000000-0000-0000-0000-000000000001',
    nome: 'Destinatario',
    slug: 'destino',
    afiliacaoId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  }

  beforeEach(() => {
    findFirstAlianca.mockReset()
    createAlianca.mockReset()
    updateAlianca.mockReset()
    findFirstTenant.mockReset()
    findUniqueTenant.mockReset()
    findFirstRec.mockReset()
    createAudit.mockReset()
    assertPermission.mockReset()
    invalidateHierarchyCache.mockReset()
    revalidatePath.mockReset()

    assertPermission.mockResolvedValue({
      session: { user: { id: 'user-1' } },
      tenant: proposerTenant,
    })
    findFirstTenant.mockResolvedValue(targetTenant)
    findUniqueTenant.mockResolvedValue({ afiliacaoId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' })
    findFirstAlianca.mockResolvedValue(null)
    createAlianca.mockResolvedValue({ id: 'alianca-1' })
    createAudit.mockResolvedValue({})
  })

  it('grava origem=proponente e aliado=destinatário mesmo com UUID do proponente maior', async () => {
    await proporAlianca(targetTenant.id)

    expect(createAlianca).toHaveBeenCalledWith({
      data: {
        tenantOrigemId: proposerTenant.id,
        tenantAliadoId: targetTenant.id,
        propostaPorId: 'user-1',
        status: 'PENDENTE',
      },
    })
  })

  it('reabre ENCERRADA na direção correta do proponente atual', async () => {
    findFirstAlianca.mockResolvedValue({
      id: 'alianca-old',
      tenantOrigemId: targetTenant.id,
      tenantAliadoId: proposerTenant.id,
      status: 'ENCERRADA',
      propostaPorId: 'user-old',
      confirmadaPorId: null,
      confirmadaEm: null,
    })
    updateAlianca.mockResolvedValue({ id: 'alianca-old' })

    await proporAlianca(targetTenant.id)

    expect(createAlianca).not.toHaveBeenCalled()
    expect(updateAlianca).toHaveBeenCalledWith({
      where: { id: 'alianca-old' },
      data: {
        tenantOrigemId: proposerTenant.id,
        tenantAliadoId: targetTenant.id,
        status: 'PENDENTE',
        propostaPorId: 'user-1',
        confirmadaPorId: null,
        confirmadaEm: null,
      },
    })
  })
})

describe('aceitarAlianca', () => {
  beforeEach(() => {
    findFirstAlianca.mockReset()
    updateAlianca.mockReset()
    createAudit.mockReset()
    assertPermission.mockReset()
    invalidateHierarchyCache.mockReset()
    revalidatePath.mockReset()
  })

  it('só o destinatário (tenantAliadoId) pode aceitar', async () => {
    assertPermission.mockResolvedValue({
      session: { user: { id: 'user-2' } },
      tenant: { id: 'tenant-origem', nome: 'A', slug: 'a' },
    })
    findFirstAlianca.mockResolvedValue({
      id: 'alianca-1',
      tenantOrigemId: 'tenant-origem',
      tenantAliadoId: 'tenant-destino',
      status: 'PENDENTE',
    })

    await expect(aceitarAlianca('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      /destinatário/i,
    )
    expect(updateAlianca).not.toHaveBeenCalled()
  })

  it('aceita quando o tenant atual é o aliado', async () => {
    assertPermission.mockResolvedValue({
      session: { user: { id: 'user-2' } },
      tenant: { id: 'tenant-destino', nome: 'B', slug: 'b' },
    })
    findFirstAlianca.mockResolvedValue({
      id: 'alianca-1',
      tenantOrigemId: 'tenant-origem',
      tenantAliadoId: 'tenant-destino',
      status: 'PENDENTE',
    })
    updateAlianca.mockResolvedValue({})
    createAudit.mockResolvedValue({})

    await aceitarAlianca('11111111-1111-1111-1111-111111111111')

    expect(updateAlianca).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alianca-1' },
        data: expect.objectContaining({ status: 'ATIVA', confirmadaPorId: 'user-2' }),
      }),
    )
  })
})

describe('proporAliancaFromRecomendacao', () => {
  beforeEach(() => {
    findFirstAlianca.mockReset()
    createAlianca.mockReset()
    findFirstTenant.mockReset()
    findUniqueTenant.mockReset()
    findFirstRec.mockReset()
    createAudit.mockReset()
    assertPermission.mockReset()
    invalidateHierarchyCache.mockReset()
    revalidatePath.mockReset()

    assertPermission.mockResolvedValue({
      session: { user: { id: 'user-1' } },
      tenant: { id: 'tenant-a', nome: 'Gavioes', slug: 'pde-gavioes-fiel' },
    })
  })

  it('rejeita recomendação MEDIA', async () => {
    findFirstRec.mockResolvedValue({
      id: 'rec-1',
      tenantId: 'tenant-a',
      tenantSugeridoId: 'tenant-b',
      nomeSugerido: 'Furia',
      confianca: 'MEDIA',
    })

    await expect(
      proporAliancaFromRecomendacao('11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow(/alta confiança/i)
  })

  it('rejeita ALTA sem tenant mapeado', async () => {
    findFirstRec.mockResolvedValue({
      id: 'rec-1',
      tenantId: 'tenant-a',
      tenantSugeridoId: null,
      nomeSugerido: 'Remoçada',
      confianca: 'ALTA',
    })

    await expect(
      proporAliancaFromRecomendacao('11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow(/ainda não está na plataforma/i)
  })

  it('propõe quando ALTA com tenant mapeado', async () => {
    const remocadaId = '22222222-2222-2222-2222-222222222222'
    const gavioesId = '33333333-3333-3333-3333-333333333333'
    assertPermission.mockResolvedValue({
      session: { user: { id: 'user-1' } },
      tenant: { id: gavioesId, nome: 'Gavioes', slug: 'pde-gavioes-fiel' },
    })
    findFirstRec.mockResolvedValue({
      id: 'rec-1',
      tenantId: gavioesId,
      tenantSugeridoId: remocadaId,
      nomeSugerido: 'Remoçada',
      confianca: 'ALTA',
    })
    findFirstTenant.mockResolvedValue({
      id: remocadaId,
      nome: 'Remoçada',
      slug: 'remocada',
      afiliacaoId: 'aaaaaaaa-1111-1111-1111-111111111111',
    })
    findUniqueTenant.mockResolvedValue({ afiliacaoId: 'bbbbbbbb-2222-2222-2222-222222222222' })
    findFirstAlianca.mockResolvedValue(null)
    createAlianca.mockResolvedValue({ id: 'alianca-1' })
    createAudit.mockResolvedValue({})

    await proporAliancaFromRecomendacao('11111111-1111-1111-1111-111111111111')

    expect(createAlianca).toHaveBeenCalledWith({
      data: {
        tenantOrigemId: gavioesId,
        tenantAliadoId: remocadaId,
        propostaPorId: 'user-1',
        status: 'PENDENTE',
      },
    })
  })
})

describe('cancelarProposta', () => {
  const origemId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const aliadoId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const aliancaId = '11111111-1111-1111-1111-111111111111'

  beforeEach(() => {
    findFirstAlianca.mockReset()
    updateAlianca.mockReset()
    createAudit.mockReset()
    assertPermission.mockReset()
    invalidateHierarchyCache.mockReset()
    revalidatePath.mockReset()
  })

  it('cancela quando o remetente tem proposta PENDENTE', async () => {
    assertPermission.mockResolvedValue({
      session: { user: { id: 'user-1' } },
      tenant: { id: origemId, nome: 'A', slug: 'a' },
    })
    findFirstAlianca.mockResolvedValue({
      id: aliancaId,
      tenantOrigemId: origemId,
      tenantAliadoId: aliadoId,
      status: 'PENDENTE',
    })
    updateAlianca.mockResolvedValue({})
    createAudit.mockResolvedValue({})

    await cancelarProposta(aliancaId)

    expect(updateAlianca).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: aliancaId },
        data: expect.objectContaining({ status: 'ENCERRADA', confirmadaPorId: 'user-1' }),
      }),
    )
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'ALIANCA_CANCELADA' }),
      }),
    )
  })

  it('bloqueia cancelamento pelo destinatário', async () => {
    assertPermission.mockResolvedValue({
      session: { user: { id: 'user-2' } },
      tenant: { id: aliadoId, nome: 'B', slug: 'b' },
    })
    findFirstAlianca.mockResolvedValue({
      id: aliancaId,
      tenantOrigemId: origemId,
      tenantAliadoId: aliadoId,
      status: 'PENDENTE',
    })

    await expect(cancelarProposta(aliancaId)).rejects.toThrow(/quem enviou/i)
    expect(updateAlianca).not.toHaveBeenCalled()
  })
})

describe('encerrarAlianca', () => {
  const aliancaId = '11111111-1111-1111-1111-111111111111'

  beforeEach(() => {
    findFirstAlianca.mockReset()
    updateAlianca.mockReset()
    createAudit.mockReset()
    assertPermission.mockReset()
    invalidateHierarchyCache.mockReset()
    revalidatePath.mockReset()
  })

  it('só encerra alianças ATIVAS', async () => {
    assertPermission.mockResolvedValue({
      session: { user: { id: 'user-1' } },
      tenant: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', nome: 'A', slug: 'a' },
    })
    findFirstAlianca.mockResolvedValue({
      id: aliancaId,
      tenantOrigemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      tenantAliadoId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      status: 'PENDENTE',
    })

    await expect(encerrarAlianca(aliancaId)).rejects.toThrow(/ativa/i)
    expect(updateAlianca).not.toHaveBeenCalled()
  })
})
