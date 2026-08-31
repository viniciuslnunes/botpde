import { test } from '@playwright/test'
import { snapshot } from './snapshot'

/**
 * Varredura ampla: uma captura por rota estática (sem segmento [id], que
 * exige um registro real no banco — adicione manualmente quando precisar
 * revisar uma tela de detalhe específica). Fluxos com interação relevante
 * (composer, salas) têm spec próprio — ver comunidade.portal.spec.ts.
 */
const ROTAS: Array<{ fluxo: string; path: string }> = [
  // '/portal' já é coberto por portal-home.portal.spec.ts
  { fluxo: 'portal-carteirinha', path: '/portal/carteirinha' },
  { fluxo: 'portal-sedes', path: '/portal/sedes' },
  { fluxo: 'portal-perfil', path: '/portal/perfil' },
  { fluxo: 'portal-eventos', path: '/portal/eventos' },
  { fluxo: 'portal-cadastro', path: '/portal/cadastro' },
  { fluxo: 'portal-loja', path: '/portal/loja' },
  { fluxo: 'portal-loja-pedidos', path: '/portal/loja/pedidos' },
  { fluxo: 'portal-comunidade-seguindo', path: '/portal/comunidade/seguindo' },
  { fluxo: 'portal-comunidade-noticias', path: '/portal/comunidade/noticias' },
  { fluxo: 'portal-comunidade-forum', path: '/portal/comunidade/forum' },
  { fluxo: 'portal-associe-se', path: '/portal/associe-se' },
  { fluxo: 'portal-mapa-brasil', path: '/portal/mapa-brasil' },
  { fluxo: 'portal-memoria', path: '/portal/memoria' },

  { fluxo: 'admin-home', path: '/admin' },
  { fluxo: 'admin-torcedores', path: '/admin/torcedores' },
  { fluxo: 'admin-membros-importar', path: '/admin/membros/importar' },
  { fluxo: 'admin-socios', path: '/admin/socios' },
  { fluxo: 'admin-eventos', path: '/admin/eventos' },
  { fluxo: 'admin-sedes', path: '/admin/sedes' },
  { fluxo: 'admin-acessos', path: '/admin/acessos' },
  { fluxo: 'admin-hierarquia', path: '/admin/hierarquia' },
  { fluxo: 'admin-comunidade', path: '/admin/comunidade' },
  { fluxo: 'admin-comunidade-moderacao', path: '/admin/comunidade/moderacao' },
  { fluxo: 'admin-comunidade-noticias', path: '/admin/comunidade/noticias' },
  { fluxo: 'admin-aliancas', path: '/admin/aliancas' },
  { fluxo: 'admin-configuracoes', path: '/admin/configuracoes' },
  { fluxo: 'admin-loja', path: '/admin/loja' },
  { fluxo: 'admin-loja-pedidos', path: '/admin/loja/pedidos' },
]

for (const { fluxo, path } of ROTAS) {
  test(`captura: ${fluxo}`, async ({ page }) => {
    await page.goto(path)
    await snapshot(page, fluxo, '01-pagina')
  })
}
