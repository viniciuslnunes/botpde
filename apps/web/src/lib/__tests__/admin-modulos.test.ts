import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_MENU,
  ADMIN_MENU_SECOES,
  ADMIN_MODULOS,
  PERMISSIONS,
  primeiraTabPermitida,
  resolverMenuIdDeRota,
  tabsPermitidasDoModulo,
} from '@torcida/types'

const APP_DIR = join(process.cwd(), 'src', 'app')

/**
 * Resolve a rota para o arquivo de página, tolerando route groups `(x)` —
 * o segmento existe na árvore de arquivos mas não na URL.
 */
function gruposEm(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('(') && e.name.endsWith(')'))
    .map((e) => e.name)
}

function rotaTemPagina(rota: string): boolean {
  const segmentos = rota.replace(/^\//, '').split('/')

  function busca(dir: string, restantes: string[]): boolean {
    if (!existsSync(dir)) return false

    if (restantes.length === 0 && existsSync(join(dir, 'page.tsx'))) return true

    if (restantes.length > 0) {
      const [atual, ...resto] = restantes
      if (busca(join(dir, atual!), resto)) return true
    }

    // Route group não existe na URL: atravessa sem consumir segmento.
    return gruposEm(dir).some((grupo) => busca(join(dir, grupo), restantes))
  }

  return busca(APP_DIR, segmentos)
}

/** Diretório da rota existe (mesmo sem `page.tsx` próprio, como pai de `[id]`). */
function segmentoExiste(rota: string): boolean {
  const segmentos = rota.replace(/^\//, '').split('/')

  function busca(dir: string, restantes: string[]): boolean {
    if (!existsSync(dir)) return false
    if (restantes.length === 0) return true

    const [atual, ...resto] = restantes
    if (busca(join(dir, atual!), resto)) return true

    return gruposEm(dir).some((grupo) => busca(join(dir, grupo), restantes))
  }

  return busca(APP_DIR, segmentos)
}

describe('ADMIN_MODULOS — invariantes de navegação', () => {
  it('toda tab aponta para uma rota que existe', () => {
    for (const modulo of ADMIN_MODULOS) {
      for (const tab of modulo.tabs) {
        expect(rotaTemPagina(tab.href), `${modulo.id}/${tab.id}: rota inexistente ${tab.href}`).toBe(
          true,
        )
      }
    }
  })

  it('todo matchPath corresponde a um segmento real da árvore', () => {
    // matchPath é prefixo de ativação, não destino: pode apontar para o pai de
    // uma rota dinâmica (`/admin/torcida/unidade` → `unidade/[tenantId]`).
    for (const modulo of ADMIN_MODULOS) {
      for (const tab of modulo.tabs) {
        for (const rota of tab.matchPaths ?? []) {
          expect(
            rotaTemPagina(rota) || segmentoExiste(rota),
            `${modulo.id}/${tab.id}: matchPath sem segmento ${rota}`,
          ).toBe(true)
        }
      }
    }
  })

  it('o módulo tem exatamente uma entrada no menu lateral', () => {
    for (const modulo of ADMIN_MODULOS) {
      const item = ADMIN_MENU.find((m) => m.id === modulo.menuId)
      expect(item, `módulo ${modulo.id} sem entrada de menu`).toBeDefined()
      expect(item!.href).toBe(modulo.href)

      // Nenhuma tab pode ter entrada própria no menu: o menu guarda o módulo,
      // as etapas vivem na barra de tabs.
      for (const tab of modulo.tabs) {
        if (tab.href === modulo.href) continue
        const duplicada = ADMIN_MENU.find((m) => m.href === tab.href)
        expect(duplicada, `tab ${modulo.id}/${tab.id} duplicada no menu`).toBeUndefined()
      }
    }
  })

  it('a rota raiz do módulo é a primeira tab', () => {
    for (const modulo of ADMIN_MODULOS) {
      expect(modulo.tabs[0]?.href, `módulo ${modulo.id}`).toBe(modulo.href)
    }
  })

  it('toda rota de tab resolve para o menu do próprio módulo', () => {
    for (const modulo of ADMIN_MODULOS) {
      for (const tab of modulo.tabs) {
        expect(resolverMenuIdDeRota(tab.href), `${modulo.id}/${tab.id}`).toBe(modulo.menuId)
      }
    }
  })

  it('nenhum cabeçalho de seção repete o nome do seu único item', () => {
    // Resíduo do menu por módulo: enquanto Loja ocupava 5 linhas, a seção
    // "Loja" agrupava; virando uma linha, virou "Loja › Loja".
    const porSecao = new Map<string, string[]>()
    for (const item of ADMIN_MENU) {
      const secao = item.secao ?? 'geral'
      porSecao.set(secao, [...(porSecao.get(secao) ?? []), item.label])
    }

    for (const secao of ADMIN_MENU_SECOES) {
      const labels = porSecao.get(secao.id) ?? []
      if (!secao.label || labels.length !== 1) continue
      expect(labels[0]!.toLowerCase(), `seção ${secao.id} repete o item`).not.toBe(
        secao.label.toLowerCase(),
      )
    }
  })

  it('todo item aponta para uma seção declarada', () => {
    const ids = new Set(ADMIN_MENU_SECOES.map((s) => s.id))
    for (const item of ADMIN_MENU) {
      expect(ids.has(item.secao ?? 'geral'), `${item.id}: seção ${item.secao}`).toBe(true)
    }
  })

  it('respeita o teto de 6 etapas por módulo', () => {
    for (const modulo of ADMIN_MODULOS) {
      expect(modulo.tabs.length, `módulo ${modulo.id} passou de 6 etapas`).toBeLessThanOrEqual(6)
    }
  })
})

describe('tabsPermitidasDoModulo', () => {
  it('esconde etapas sem permissão e mantém a ordem declarada', () => {
    const tabs = tabsPermitidasDoModulo('loja', [PERMISSIONS.STORE_VIEW_ORDERS])
    expect(tabs.map((t) => t.id)).toEqual(['pedidos'])
  })

  it('dá ao gestor o módulo inteiro', () => {
    const tabs = tabsPermitidasDoModulo('loja', [PERMISSIONS.STORE_MANAGE])
    expect(tabs.map((t) => t.id)).toEqual(['catalogo', 'pedidos', 'categorias', 'cupons', 'desempenho'])
  })

  it('trata permissao null como herdada do gate do módulo', () => {
    const tabs = tabsPermitidasDoModulo('bar', [PERMISSIONS.BAR_OPERATE])
    // balcao/vendas: permissao null; comandas: BAR_OPERATE (§5.10 lista)
    expect(tabs.map((t) => t.id)).toEqual(['balcao', 'vendas', 'comandas'])
  })

  it('abre Desempenho do bar para quem lê o financeiro sem gerir o bar', () => {
    const tabs = tabsPermitidasDoModulo('bar', [PERMISSIONS.BAR_OPERATE, PERMISSIONS.FINANCE_VIEW])
    expect(tabs.map((t) => t.id)).toContain('desempenho')
    expect(tabs.map((t) => t.id)).not.toContain('estoque')
  })

  it('curador de notícias entra na Comunidade pela própria etapa', () => {
    // Sem isso ele seria expulso para /admin ao abrir a raiz do módulo.
    expect(primeiraTabPermitida('comunidade', [PERMISSIONS.NEWS_CURATE])).toBe(
      '/admin/comunidade/noticias',
    )
  })

  it('gestor de cargos entra na Estrutura pela Hierarquia', () => {
    expect(primeiraTabPermitida('estrutura', [PERMISSIONS.ROLES_MANAGE])).toBe('/admin/hierarquia')
  })

  it('gestor de afiliação entra na Estrutura pelas Solicitações', () => {
    expect(primeiraTabPermitida('estrutura', [PERMISSIONS.AFFILIATION_MANAGE])).toBe(
      '/admin/afiliacoes',
    )
  })

  it('controle de acesso entra na Plataforma por Acessos', () => {
    expect(primeiraTabPermitida('plataforma', [PERMISSIONS.ROLES_MANAGE])).toBe('/admin/acessos')
  })

  it('leitura de auditoria entra na Plataforma pela Auditoria', () => {
    expect(primeiraTabPermitida('plataforma', [PERMISSIONS.AUDIT_VIEW])).toBe('/admin/auditoria')
  })

  it('sem nenhuma permissão do módulo não sobra etapa', () => {
    expect(tabsPermitidasDoModulo('comunidade', [])).toEqual([])
    expect(primeiraTabPermitida('comunidade', [])).toBeNull()
  })

  it('wildcard do super admin vê tudo', () => {
    expect(tabsPermitidasDoModulo('comunidade', ['*'])).toHaveLength(5)
  })

  it('módulo inexistente não explode', () => {
    expect(tabsPermitidasDoModulo('inexistente', ['*'])).toEqual([])
  })
})
