import { describe, expect, it } from 'vitest'
import { hrefAdminEvento, linksEventoParaReconciliar } from '@/lib/eventos-admin-href'

describe('hrefAdminEvento', () => {
  it('manda caravana para o hub de Caravanas', () => {
    expect(hrefAdminEvento({ id: 'e1', tipo: 'CARAVANA' })).toBe('/admin/caravanas/e1')
  })

  it('manda ensaio para Bateria, salvo carnaval', () => {
    expect(hrefAdminEvento({ id: 'e1', tipo: 'ENSAIO' })).toBe('/admin/bateria/e1')
    expect(hrefAdminEvento({ id: 'e1', tipo: 'ENSAIO', departamentoSlug: 'carnaval' })).toBe(
      '/admin/carnaval/e1',
    )
  })

  it('slug do departamento vence tipo GERAL', () => {
    expect(hrefAdminEvento({ id: 'e1', tipo: 'GERAL', departamentoSlug: 'social-e-eventos' })).toBe(
      '/admin/social/e1',
    )
    expect(hrefAdminEvento({ id: 'e1', tipo: 'GERAL', departamentoSlug: 'feminino' })).toBe(
      '/admin/feminino/e1',
    )
    expect(hrefAdminEvento({ id: 'e1', tipo: 'GERAL' })).toBe('/admin/eventos/e1')
  })
})

describe('linksEventoParaReconciliar', () => {
  it('cobre portal e todos os hubs admin', () => {
    const links = linksEventoParaReconciliar('e1')
    expect(links).toContain('/portal/eventos/e1')
    expect(links).toContain('/admin/caravanas/e1')
    expect(links).toContain('/admin/carnaval/e1')
  })
})
