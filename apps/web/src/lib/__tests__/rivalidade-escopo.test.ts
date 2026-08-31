import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ESCOPOS_RIVALIDADE_ISOLANTE, escopoIsola } from '@torcida/types'

const countRivalClube = vi.hoisted(() => vi.fn())
const findManyMembro = vi.hoisted(() => vi.fn())
const findManyCargo = vi.hoisted(() => vi.fn())
const findUniquePerfil = vi.hoisted(() => vi.fn())
const findFirstMembro = vi.hoisted(() => vi.fn())
const findUniqueTenant = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: { findMany: findManyMembro, findFirst: findFirstMembro },
    userRole: { findMany: findManyCargo },
    perfilTorcedor: { findUnique: findUniquePerfil },
    rivalidadeClube: { count: countRivalClube },
    tenant: { findUnique: findUniqueTenant },
  },
}))

vi.mock('@/lib/hierarquia', () => ({ getTenantRelation: vi.fn() }))

import { saoUsuariosRivais } from '@/lib/perfil-visibilidade'

/**
 * O escopo da rivalidade decide o isolamento: clássico interestadual
 * (Flamengo × São Paulo) fica gravado como contexto e NÃO some da malha.
 * Regra medida em docs/data/auditoria-catalogo-clubes.md §4.
 */
describe('escopo de rivalidade', () => {
  it('isola rivalidade municipal e estadual, não a interestadual', () => {
    expect(escopoIsola('MUNICIPAL')).toBe(true)
    expect(escopoIsola('ESTADUAL')).toBe(true)
    expect(escopoIsola('INTERESTADUAL')).toBe(false)
    expect(escopoIsola(null)).toBe(false)
    expect(ESCOPOS_RIVALIDADE_ISOLANTE).not.toContain('INTERESTADUAL')
  })

  describe('consulta de rivalidade entre usuários', () => {
    const userA = '11111111-1111-1111-1111-111111111111'
    const userB = '22222222-2222-2222-2222-222222222222'
    const clubeA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const clubeB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

    beforeEach(() => {
      countRivalClube.mockReset()
      findManyMembro.mockReset()
      findManyCargo.mockReset()
      findUniquePerfil.mockReset()
      countRivalClube.mockResolvedValue(0)
      findManyMembro.mockResolvedValue([])
      findManyCargo.mockResolvedValue([])
      findUniquePerfil
        .mockResolvedValueOnce({ afiliacaoId: clubeA })
        .mockResolvedValueOnce({ afiliacaoId: clubeB })
    })

    it('filtra por escopo isolante ao consultar rivalidade de clube', async () => {
      await saoUsuariosRivais(userA, userB)

      expect(countRivalClube).toHaveBeenCalledTimes(1)
      const where = countRivalClube.mock.calls[0]![0]!.where as {
        escopo: { in: string[] }
      }
      expect(where.escopo.in).toEqual([...ESCOPOS_RIVALIDADE_ISOLANTE])
      expect(where.escopo.in).not.toContain('INTERESTADUAL')
    })
  })
})
