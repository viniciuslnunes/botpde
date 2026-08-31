import { describe, expect, it } from 'vitest'
import {
  decidePodeVerCanal,
  deveTrocarTenantAoAbrirCanal,
  canalOficialTemPortalProprio,
  isConversaGrupoLike,
  labelCategoriaCanal,
  labelTipoUnidade,
  labelVisibilidadeCanal,
  linkUnidadeComunidade,
  linkCanalComunidade,
  linkTorcidaComunidadePublica,
  orPostsDoMuralCanal,
  decidirFeedInternoDoMural,
} from '../canais-shared'

describe('canais', () => {
  it('identifica conversas de grupo e canal', () => {
    expect(isConversaGrupoLike('GRUPO')).toBe(true)
    expect(isConversaGrupoLike('CANAL')).toBe(true)
    expect(isConversaGrupoLike('DIRETA')).toBe(false)
  })

  it('formata tipo de unidade', () => {
    expect(labelTipoUnidade('SEDE')).toBe('Sede')
    expect(labelTipoUnidade('SUBSEDE')).toBe('Subsede')
    expect(labelTipoUnidade('PONTO_ENCONTRO')).toBe('PDE')
  })

  it('formata visibilidade de canal', () => {
    expect(labelVisibilidadeCanal('HIERARQUIA')).toContain('Hierarquia')
    expect(labelVisibilidadeCanal('ALIADOS')).toContain('aliados')
  })

  it('gera links de navegação', () => {
    expect(linkUnidadeComunidade('abc')).toBe('/portal/comunidade/unidade/abc')
    expect(linkCanalComunidade('xyz')).toBe('/portal/comunidade/canais/xyz')
    expect(linkTorcidaComunidadePublica('abc')).toBe('/portal/comunidade/torcida/abc')
  })
})

describe('decidePodeVerCanal', () => {
  it('PUBLICO: sócio e torcedor no alcance comunidade', () => {
    expect(
      decidePodeVerCanal({ relation: 'self', visibilidade: 'PUBLICO', isSocio: false }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'PUBLICO', isSocio: false }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'unrelated', visibilidade: 'PUBLICO', isSocio: true }),
    ).toBe(false)
    expect(
      decidePodeVerCanal({ relation: 'rival', visibilidade: 'PUBLICO', isSocio: true }),
    ).toBe(false)
  })

  it('TENANT/HIERARQUIA/ALIADOS: exige sócio mesmo no self', () => {
    expect(
      decidePodeVerCanal({ relation: 'self', visibilidade: 'HIERARQUIA', isSocio: false }),
    ).toBe(false)
    expect(
      decidePodeVerCanal({ relation: 'self', visibilidade: 'TENANT', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'TENANT', isSocio: true }),
    ).toBe(false)
  })

  it('HIERARQUIA: hierarquia mas não aliados', () => {
    expect(
      decidePodeVerCanal({ relation: 'descendant', visibilidade: 'HIERARQUIA', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'ancestor', visibilidade: 'HIERARQUIA', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'HIERARQUIA', isSocio: true }),
    ).toBe(false)
  })

  it('ALIADOS: hierarquia + aliados', () => {
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'ALIADOS', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'descendant', visibilidade: 'ALIADOS', isSocio: true }),
    ).toBe(true)
    expect(
      decidePodeVerCanal({ relation: 'allied', visibilidade: 'ALIADOS', isSocio: false }),
    ).toBe(false)
  })
})

describe('orPostsDoMuralCanal', () => {
  const CANAL = 'canal-1'
  const TENANT = 'tenant-1'

  it('temático / sem feed interno: só posts do conversaId', () => {
    expect(orPostsDoMuralCanal(CANAL, null)).toEqual([{ conversaId: CANAL }])
  })

  it('oficial: canal + TENANT sem conversa só de sócio APROVADO', () => {
    expect(orPostsDoMuralCanal(CANAL, TENANT)).toEqual([
      { conversaId: CANAL },
      {
        conversaId: null,
        tenantId: TENANT,
        tipo: 'MEMBRO',
        visibilidade: 'TENANT',
        autor: {
          membros: {
            some: {
              tenantId: TENANT,
              tipo: 'SOCIO',
              status: 'APROVADO',
            },
          },
        },
      },
    ])
  })

  it('ramo do canal não amarra tenantId do post (Caso B / emprestado)', () => {
    const ramoCanal = orPostsDoMuralCanal(CANAL, TENANT).find((r) => r.conversaId === CANAL)
    expect(ramoCanal).toEqual({ conversaId: CANAL })
    expect(ramoCanal).not.toHaveProperty('tenantId')
  })

  it('paginação: OR do mural e OR do cursor convivem via AND (não no mesmo nível)', () => {
    // Espalhar `{ ...cursorWhere, OR: mural }` apaga o cursor — a página 2
    // repete a 1ª e o infinite scroll trava. Forma correta:
    const cursorWhere = {
      OR: [
        { criadoEm: { lt: new Date('2026-01-01') } },
        { criadoEm: new Date('2026-01-01'), id: { lt: 'post-z' } },
      ],
    }
    const where = {
      oculto: false,
      AND: [{ OR: orPostsDoMuralCanal(CANAL, TENANT) }, cursorWhere],
    }
    expect(where.AND).toHaveLength(2)
    expect(where.AND[0]).toEqual({ OR: orPostsDoMuralCanal(CANAL, TENANT) })
    expect(where.AND[1]).toBe(cursorWhere)
  })
})

describe('decidirFeedInternoDoMural', () => {
  const SEDE = 'canal-sede'
  const PDE = 'canal-pde'
  const MAE = 'tenant-gavioes'
  const UNIDADE = 'tenant-baixada'

  it('temático nunca mistura Só torcida', () => {
    expect(
      decidirFeedInternoDoMural({
        canalOficial: false,
        canalId: PDE,
        oficialSedeId: SEDE,
        vinculoTenantId: MAE,
        viewerTenantId: MAE,
      }),
    ).toEqual({ incluir: false, feedInternoTenantId: null })
  })

  it('mural da Sede mistura Só torcida do tenant do viewer', () => {
    expect(
      decidirFeedInternoDoMural({
        canalOficial: true,
        canalId: SEDE,
        oficialSedeId: SEDE,
        vinculoTenantId: MAE,
        viewerTenantId: MAE,
      }),
    ).toEqual({ incluir: true, feedInternoTenantId: MAE })
  })

  it('Caso B: viewer na Sede, vínculo na PDE — mistura o tenant da unidade', () => {
    expect(
      decidirFeedInternoDoMural({
        canalOficial: true,
        canalId: PDE,
        oficialSedeId: SEDE,
        vinculoTenantId: UNIDADE,
        viewerTenantId: MAE,
      }),
    ).toEqual({ incluir: true, feedInternoTenantId: UNIDADE })
  })

  it('Caso B no portal da unidade (sem canal SEDE neste tenant): mistura o da unidade', () => {
    expect(
      decidirFeedInternoDoMural({
        canalOficial: true,
        canalId: PDE,
        oficialSedeId: null,
        vinculoTenantId: UNIDADE,
        viewerTenantId: UNIDADE,
      }),
    ).toEqual({ incluir: true, feedInternoTenantId: UNIDADE })
  })

  it('Caso A: PDE no tenant da mãe NÃO mistura o feed da organizada', () => {
    expect(
      decidirFeedInternoDoMural({
        canalOficial: true,
        canalId: PDE,
        oficialSedeId: SEDE,
        vinculoTenantId: MAE,
        viewerTenantId: MAE,
      }),
    ).toEqual({ incluir: false, feedInternoTenantId: null })
  })
})

describe('deveTrocarTenantAoAbrirCanal', () => {
  it('só troca em canal oficial com slug diferente do atual', () => {
    expect(
      deveTrocarTenantAoAbrirCanal({
        canalOficial: false,
        slugAlvo: 'pde-taubate',
        slugAtual: 'subsede-rio-claro',
      }),
    ).toBe(false)
    expect(
      deveTrocarTenantAoAbrirCanal({
        canalOficial: true,
        slugAlvo: null,
        slugAtual: 'subsede-rio-claro',
      }),
    ).toBe(false)
    expect(
      deveTrocarTenantAoAbrirCanal({
        canalOficial: true,
        slugAlvo: 'subsede-rio-claro',
        slugAtual: 'subsede-rio-claro',
      }),
    ).toBe(false)
    expect(
      deveTrocarTenantAoAbrirCanal({
        canalOficial: true,
        slugAlvo: 'pde-taubate',
        slugAtual: 'subsede-rio-claro',
      }),
    ).toBe(true)
    expect(
      deveTrocarTenantAoAbrirCanal({
        canalOficial: true,
        slugAlvo: 'pde-taubate',
        slugAtual: null,
      }),
    ).toBe(true)
  })
})

describe('canalOficialTemPortalProprio', () => {
  const raiz = 'tenant-gavioes'
  const pde = 'tenant-rio-claro'

  it('Sede raiz e Caso B têm portal; Caso A (PDE na mãe) não', () => {
    expect(
      canalOficialTemPortalProprio({
        tipoSede: 'SEDE',
        tenantIdUnidade: raiz,
        tenantIdRaiz: raiz,
      }),
    ).toBe(true)
    expect(
      canalOficialTemPortalProprio({
        tipoSede: 'SUBSEDE',
        tenantIdUnidade: pde,
        tenantIdRaiz: raiz,
      }),
    ).toBe(true)
    expect(
      canalOficialTemPortalProprio({
        tipoSede: 'PONTO_ENCONTRO',
        tenantIdUnidade: raiz,
        tenantIdRaiz: raiz,
      }),
    ).toBe(false)
  })
})

describe('labelCategoriaCanal', () => {
  it('distingue oficial, departamento e temático', () => {
    expect(labelCategoriaCanal({ canalOficial: true, ehCanalDepartamento: false })).toBe(
      'Oficial',
    )
    expect(labelCategoriaCanal({ canalOficial: false, ehCanalDepartamento: true })).toBe(
      'Departamento',
    )
    expect(labelCategoriaCanal({ canalOficial: false, ehCanalDepartamento: false })).toBe(
      'Temático',
    )
  })
})
