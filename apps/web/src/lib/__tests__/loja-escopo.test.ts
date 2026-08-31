import { describe, expect, it } from 'vitest'
import {
  blocoLoja,
  compararLojasListagem,
  escoparLojaAoPortalAtivo,
  type EscopoLojaInput,
  type LojaListagemSortable,
} from '@/lib/loja-escopo'

const GAVIOES = 't-gavioes'
const FIEL_SV = 't-fiel-sv'
const MANCHA = 't-mancha'
const RIO_CLARO = 't-rio-claro'
const ALIADA_MANCHA = 't-aliada-mancha'

function base(over: Partial<EscopoLojaInput> = {}): EscopoLojaInput {
  return {
    vinculoIds: [GAVIOES, FIEL_SV],
    ativoId: MANCHA,
    worktreeIds: [MANCHA, RIO_CLARO],
    visiveisDoAtivo: [MANCHA, RIO_CLARO, ALIADA_MANCHA],
    aliadosDoAtivo: [ALIADA_MANCHA],
    raizId: MANCHA,
    socioNaWorktree: false,
    isSuperAdmin: true,
    lojaVisivelNasUnidades: true,
    ...over,
  }
}

describe('escoparLojaAoPortalAtivo — Super Admin no canal da rival', () => {
  it('presidente dos Gaviões em portal da Mancha não vê loja nem destaque da casa', () => {
    const r = escoparLojaAoPortalAtivo(base())
    expect([...r.visiveis].sort()).toEqual([MANCHA, RIO_CLARO].sort())
    expect(r.visiveis.has(GAVIOES)).toBe(false)
    expect(r.visiveis.has(FIEL_SV)).toBe(false)
    expect(r.comprar.size).toBe(0)
  })

  it('no portal dos Gaviões, o mesmo Super Admin vê a worktree da casa e compra onde tem vínculo', () => {
    const r = escoparLojaAoPortalAtivo(
      base({
        ativoId: GAVIOES,
        worktreeIds: [GAVIOES, FIEL_SV],
        visiveisDoAtivo: [GAVIOES, FIEL_SV],
        aliadosDoAtivo: [],
        raizId: GAVIOES,
        socioNaWorktree: true,
      }),
    )
    expect(r.visiveis.has(GAVIOES)).toBe(true)
    expect(r.visiveis.has(FIEL_SV)).toBe(true)
    expect(r.visiveis.has(MANCHA)).toBe(false)
    expect(r.comprar.has(GAVIOES)).toBe(true)
    expect(r.comprar.has(FIEL_SV)).toBe(true)
  })

  it('vínculo na rival nunca entra, mesmo se vier misturado em visiveisDoAtivo por bug do chamador', () => {
    const r = escoparLojaAoPortalAtivo(
      base({
        visiveisDoAtivo: [MANCHA, RIO_CLARO],
        vinculoIds: [GAVIOES, FIEL_SV, MANCHA],
      }),
    )
    expect(r.visiveis.has(GAVIOES)).toBe(false)
    expect(r.comprar.has(GAVIOES)).toBe(false)
    expect(r.comprar.has(MANCHA)).toBe(true)
  })

  it('Super Admin sem nenhum vínculo ainda vê a worktree do portal que opera', () => {
    const r = escoparLojaAoPortalAtivo(
      base({
        vinculoIds: [],
        socioNaWorktree: false,
        isSuperAdmin: true,
      }),
    )
    expect([...r.visiveis].sort()).toEqual([MANCHA, RIO_CLARO].sort())
    expect(r.comprar.size).toBe(0)
  })
})

describe('escoparLojaAoPortalAtivo — sócio e torcedor', () => {
  it('sócio da worktree vê unidades afiliadas e aliadas, e compra em todas as listadas', () => {
    const r = escoparLojaAoPortalAtivo(
      base({
        vinculoIds: [MANCHA],
        isSuperAdmin: false,
        socioNaWorktree: true,
      }),
    )
    expect([...r.visiveis].sort()).toEqual([ALIADA_MANCHA, MANCHA, RIO_CLARO].sort())
    expect(r.comprar.has(RIO_CLARO)).toBe(true)
    expect(r.comprar.has(ALIADA_MANCHA)).toBe(true)
  })

  it('torcedor (não sócio) vê unidades da torcida e não vê loja aliada', () => {
    const r = escoparLojaAoPortalAtivo(
      base({
        vinculoIds: [RIO_CLARO],
        isSuperAdmin: false,
        socioNaWorktree: false,
      }),
    )
    expect(r.visiveis.has(ALIADA_MANCHA)).toBe(false)
    expect(r.visiveis.has(MANCHA)).toBe(true)
    expect(r.visiveis.has(RIO_CLARO)).toBe(true)
  })

  it('membro de outra família, sem Super Admin, não vê o portal alheio', () => {
    const r = escoparLojaAoPortalAtivo(
      base({
        isSuperAdmin: false,
        socioNaWorktree: false,
      }),
    )
    expect(r.visiveis.size).toBe(0)
    expect(r.comprar.size).toBe(0)
  })
})

describe('escoparLojaAoPortalAtivo — ponte da Sede e CN', () => {
  it('unidade não vê a loja da Sede quando lojaVisivelNasUnidades é false', () => {
    const r = escoparLojaAoPortalAtivo(
      base({
        ativoId: RIO_CLARO,
        vinculoIds: [RIO_CLARO],
        isSuperAdmin: false,
        socioNaWorktree: false,
        lojaVisivelNasUnidades: false,
      }),
    )
    expect(r.visiveis.has(MANCHA)).toBe(false)
    expect(r.visiveis.has(RIO_CLARO)).toBe(true)
  })

  it('na Sede a loja da raiz continua mesmo com a ponte desligada', () => {
    const r = escoparLojaAoPortalAtivo(
      base({
        vinculoIds: [MANCHA],
        isSuperAdmin: false,
        socioNaWorktree: true,
        lojaVisivelNasUnidades: false,
      }),
    )
    expect(r.visiveis.has(MANCHA)).toBe(true)
  })

  it('sem portal ativo (CN) cai nos vínculos — Super Admin não infla o conjunto', () => {
    const r = escoparLojaAoPortalAtivo(
      base({
        ativoId: null,
        worktreeIds: [],
        visiveisDoAtivo: [MANCHA, RIO_CLARO],
        raizId: null,
      }),
    )
    expect([...r.visiveis].sort()).toEqual([FIEL_SV, GAVIOES].sort())
    expect(r.visiveis.has(MANCHA)).toBe(false)
  })
})

describe('compararLojasListagem', () => {
  it('principal, depois subsede e PDE da worktree, aliados por último', () => {
    const baixada = 't-baixada'
    const furia = 't-furia'
    const remista = 't-remista'
    const worktree = new Set([GAVIOES, FIEL_SV, RIO_CLARO, baixada])
    const aliados = new Set([furia, remista])

    function item(tenantId: string, nome: string, tipo: string): LojaListagemSortable {
      return {
        tenantId,
        nome,
        tipo,
        bloco: blocoLoja({
          tenantId,
          raizId: GAVIOES,
          worktreeIds: worktree,
          aliadosIds: aliados,
        }),
      }
    }

    const lojas = [
      item(furia, 'Fúria Jovem do Botafogo', 'SEDE'),
      item(FIEL_SV, 'Fiel São Vicente', 'PONTO_ENCONTRO'),
      item(remista, 'Remista', 'SEDE'),
      item(RIO_CLARO, 'Subsede Rio Claro', 'SUBSEDE'),
      item(GAVIOES, 'Gaviões da Fiel', 'SEDE'),
      item(baixada, 'PDE Fiel Baixada - Praia Grande', 'PONTO_ENCONTRO'),
    ]

    expect([...lojas].sort(compararLojasListagem).map((l) => l.nome)).toEqual([
      'Gaviões da Fiel',
      'Subsede Rio Claro',
      'Fiel São Vicente',
      'PDE Fiel Baixada - Praia Grande',
      'Fúria Jovem do Botafogo',
      'Remista',
    ])
  })
})
