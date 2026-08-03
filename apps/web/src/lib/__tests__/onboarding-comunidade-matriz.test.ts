/**
 * Matriz de negócio: onboarding → comunidades e permissões.
 *
 * Três caminhos após o wizard:
 *  A) TORCEDOR APROVADO
 *  B) SOCIO PENDENTE (solicitação / "já sou sócio" em análise)
 *  C) SOCIO APROVADO
 *
 * Spec: docs/data/spec-onboarding.md — até aprovação, só feed de torcedor;
 * aba da Sede (Gaviões) só com SOCIO APROVADO.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolverEscopoComunidadePorModo } from '@/lib/comunidade-escopo'

const findFirst = vi.hoisted(() => vi.fn())
const findUnique = vi.hoisted(() => vi.fn())
const findUniqueUser = vi.hoisted(() => vi.fn())
const isSuperAdminEmail = vi.hoisted(() => vi.fn(() => false))

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
    user: { findUnique: (...args: unknown[]) => findUniqueUser(...args) },
  },
}))

vi.mock('@/lib/comunidade', () => ({ getFeedComunidade: vi.fn() }))
vi.mock('@/lib/comunidade-contexto', () => ({ getTenantIdsPorAfiliacao: vi.fn() }))
vi.mock('@/lib/hierarquia', () => ({ getVisibleTenantIds: vi.fn() }))
vi.mock('@/lib/perfil-social', () => ({
  getAutoresSemAcesso: vi.fn(),
  getContagensSeguimento: vi.fn(),
  resolverAvatarSocial: vi.fn(),
  podeVerConteudoSocial: vi.fn(),
}))
vi.mock('@/lib/social', () => ({ getSeguimentoStatus: vi.fn() }))
vi.mock('@/lib/autor-badges', () => ({ enriquecerPostsComBadges: vi.fn() }))
vi.mock('@/lib/noticias', () => ({ getNoticiasAprovadas: vi.fn() }))
vi.mock('@/lib/tenant-context', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/tenant-context')>()
  return { ...real, isSuperAdminEmail }
})

import {
  resolveUserTenantSlugForUser,
  vinculoAutorizaContextoTenant,
  resolverTorcidaDoTorcedor,
} from '@/lib/tenant-context'
import { podeVerFeedSocios } from '@/lib/feed'

describe('matriz onboarding → comunidades (gates de tenant)', () => {
  beforeEach(() => {
    findFirst.mockReset()
    findUnique.mockReset()
    findUniqueUser.mockReset()
    isSuperAdminEmail.mockReset().mockReturnValue(false)
  })

  describe('A) TORCEDOR APROVADO', () => {
    it('não abre slug de tenant (fica na CN)', async () => {
      findFirst.mockResolvedValueOnce(null)
      await expect(resolveUserTenantSlugForUser('u-torcedor')).resolves.toBeNull()
    })

    it('cookie/contexto de SEDE não autoriza', async () => {
      findFirst.mockResolvedValueOnce(null)
      await expect(vinculoAutorizaContextoTenant('u-torcedor', 'pde-gavioes-fiel')).resolves.toBe(
        false,
      )
    })

    it('resolve unidade canônica (PDE) para aba Minha unidade', async () => {
      findFirst.mockResolvedValueOnce({
        tenant: {
          id: 't-pde',
          slug: 'fiel-baixada',
          nome: 'PDE Baixada',
          afiliacaoId: 'af-cor',
          logoUrl: null,
          corPrimaria: '#000',
          balancoFinanceiroVisivel: false,
        },
      })
      const t = await resolverTorcidaDoTorcedor('u-torcedor')
      expect(t?.slug).toBe('fiel-baixada')
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            espelhado: false,
            OR: [
              { status: 'APROVADO', tipo: 'TORCEDOR' },
              { status: 'PENDENTE', tipo: 'SOCIO' },
            ],
          }),
        }),
      )
    })

    it('escopos: nacional default; unidade ok; torcida NUNCA', () => {
      const escopos = { torcida: false, unidade: true }
      expect(resolverEscopoComunidadePorModo('nacional', escopos, undefined)).toBe('nacional')
      expect(resolverEscopoComunidadePorModo('nacional', escopos, 'unidade')).toBe('unidade')
      expect(resolverEscopoComunidadePorModo('nacional', escopos, 'torcida')).toBe('nacional')
    })

    it('não vê feed de sócios (mural TENANT)', async () => {
      findUnique.mockResolvedValue({ status: 'APROVADO', tipo: 'TORCEDOR' })
      findUniqueUser.mockResolvedValue({ email: 't@example.com' })
      await expect(podeVerFeedSocios('u-torcedor', 't-sede')).resolves.toBe(false)
    })
  })

  describe('B) SOCIO PENDENTE', () => {
    it('não abre slug — espelho SEDE também não conta', async () => {
      findFirst.mockResolvedValueOnce(null)
      await expect(resolveUserTenantSlugForUser('u-pendente')).resolves.toBeNull()
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'APROVADO',
            tipo: 'SOCIO',
            espelhado: false,
          }),
        }),
      )
    })

    it('não autoriza cookie nem na PDE nem na Sede enquanto PENDENTE', async () => {
      findFirst.mockResolvedValue(null)
      await expect(vinculoAutorizaContextoTenant('u-pendente', 'fiel-baixada')).resolves.toBe(false)
      await expect(vinculoAutorizaContextoTenant('u-pendente', 'pde-gavioes-fiel')).resolves.toBe(
        false,
      )
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'APROVADO',
            tipo: 'SOCIO',
          }),
        }),
      )
    })

    it('ainda resolve PDE canônica para aba Minha unidade (como torcedor)', async () => {
      findFirst.mockResolvedValueOnce({
        tenant: {
          id: 't-pde',
          slug: 'fiel-baixada',
          nome: 'PDE Baixada',
          afiliacaoId: 'af-cor',
          logoUrl: null,
          corPrimaria: '#000',
          balancoFinanceiroVisivel: false,
        },
      })
      await expect(resolverTorcidaDoTorcedor('u-pendente')).resolves.toMatchObject({
        slug: 'fiel-baixada',
      })
    })

    it('mesmos escopos do torcedor: Timão + PDE, sem Gaviões', () => {
      const escopos = { torcida: false, unidade: true }
      expect(resolverEscopoComunidadePorModo('nacional', escopos, undefined)).toBe('nacional')
      expect(resolverEscopoComunidadePorModo('nacional', escopos, 'unidade')).toBe('unidade')
      expect(resolverEscopoComunidadePorModo('nacional', escopos, 'torcida')).toBe('nacional')
    })

    it('não vê feed de sócios na Sede nem na PDE', async () => {
      findUnique.mockResolvedValue({ status: 'PENDENTE', tipo: 'SOCIO' })
      findUniqueUser.mockResolvedValue({ email: 'p@example.com' })
      await expect(podeVerFeedSocios('u-pendente', 't-sede')).resolves.toBe(false)
      await expect(podeVerFeedSocios('u-pendente', 't-pde')).resolves.toBe(false)
    })
  })

  describe('C) SOCIO APROVADO', () => {
    it('abre slug do vínculo canônico (modo Minha torcida)', async () => {
      findFirst.mockResolvedValueOnce({ tenant: { slug: 'fiel-baixada' } })
      await expect(resolveUserTenantSlugForUser('u-socio')).resolves.toBe('fiel-baixada')
    })

    it('autoriza cookie no tenant do vínculo aprovado (incl. espelho Caso B)', async () => {
      findFirst.mockResolvedValueOnce({ id: 'm1' })
      await expect(vinculoAutorizaContextoTenant('u-socio', 'pde-gavioes-fiel')).resolves.toBe(true)
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'APROVADO',
            tipo: 'SOCIO',
          }),
        }),
      )
    })

    it('escopos de sócio: default torcida; honra nacional e unidade', () => {
      const escopos = { torcida: true, unidade: true }
      expect(resolverEscopoComunidadePorModo('torcida', escopos, undefined)).toBe('torcida')
      expect(resolverEscopoComunidadePorModo('torcida', escopos, 'nacional')).toBe('nacional')
      expect(resolverEscopoComunidadePorModo('torcida', escopos, 'unidade')).toBe('unidade')
    })

    it('vê feed de sócios', async () => {
      findUnique.mockResolvedValue({ status: 'APROVADO', tipo: 'SOCIO' })
      await expect(podeVerFeedSocios('u-socio', 't-sede')).resolves.toBe(true)
    })
  })
})
