import { describe, expect, it } from 'vitest'
import {
  abrirCanalNaOrdem,
  aplicarOrdemArrastavel,
  idsCanaisHierarquiaFixosNaBarra,
  moverItem,
  moverSlugArrastavel,
  ordemArrastavelSemFixos,
  reordenarCanaisOperador,
  slugsHierarquiaFixos,
  slugUnidadePrefixoBarra,
  temUnidadeFixaOperador,
} from '@/lib/operador-canais-ordem'

describe('abrirCanalNaOrdem', () => {
  it('não traz para a frente um canal já aberto', () => {
    expect(abrirCanalNaOrdem(['a', 'b', 'c'], 'b')).toEqual(['a', 'b', 'c'])
  })

  it('anexa canal novo ao fim', () => {
    expect(abrirCanalNaOrdem(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
  })

  it('estoura o teto removendo o mais antigo à esquerda', () => {
    expect(abrirCanalNaOrdem(['a', 'b'], 'c', 2)).toEqual(['b', 'c'])
  })
})

describe('reordenarCanaisOperador', () => {
  it('aceita permutação válida', () => {
    expect(reordenarCanaisOperador(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('reordena subconjunto e preserva ids omitidos na UI (ex.: lineage)', () => {
    expect(reordenarCanaisOperador(['a', 'b', 'hidden', 'c'], ['c', 'a', 'b'])).toEqual([
      'c',
      'a',
      'hidden',
      'b',
    ])
  })

  it('ignora id só da barra (ainda sem cookie) e aplica o resto', () => {
    expect(reordenarCanaisOperador(['a', 'b', 'c'], ['b', 'a', 'c', 'ephemeral'])).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('rejeita duplicata na proposta; cookie vazio / proposta vazia = no-op', () => {
    expect(reordenarCanaisOperador(['a', 'b'], ['a', 'a'])).toBeNull()
    expect(reordenarCanaisOperador(['a', 'b'], [])).toEqual(['a', 'b'])
    expect(reordenarCanaisOperador([], ['a'])).toEqual([])
  })
})

describe('moverItem', () => {
  it('move índice na lista', () => {
    expect(moverItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moverItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
})

describe('slugsHierarquiaFixos', () => {
  it('sem unidade: só torcida', () => {
    expect(
      slugsHierarquiaFixos({
        slugTorcida: 'gavioes',
        slugUnidade: null,
        temTorcida: true,
        temUnidade: false,
      }),
    ).toEqual(['gavioes'])
  })

  it('com unidade distinta: torcida + unidade', () => {
    expect(
      slugsHierarquiaFixos({
        slugTorcida: 'gavioes',
        slugUnidade: 'gavioes-pde-leste',
        temTorcida: true,
        temUnidade: true,
      }),
    ).toEqual(['gavioes', 'gavioes-pde-leste'])
  })

  it('unidade = torcida (Caso A): não duplica', () => {
    expect(
      slugsHierarquiaFixos({
        slugTorcida: 'gavioes',
        slugUnidade: 'gavioes',
        temTorcida: true,
        temUnidade: true,
      }),
    ).toEqual(['gavioes'])
  })
})

describe('slugUnidadePrefixoBarra', () => {
  const pde = { slug: 'pde-fiel-baixada', ehUnidade: true, raizId: 'gavioes-id' }
  const camisa = { slug: 'camisa-12', ehUnidade: false, raizId: 'camisa-id' }
  const outraPde = { slug: 'pde-leste', ehUnidade: true, raizId: 'gavioes-id' }

  it('contexto (vínculo / tenant ativo) ganha da cookie', () => {
    expect(
      slugUnidadePrefixoBarra({
        slugUnidadeContexto: 'pde-fiel-baixada',
        slugTorcida: 'gavioes',
        canaisAbertos: [camisa, outraPde],
        raizIdTorcida: 'gavioes-id',
      }),
    ).toBe('pde-fiel-baixada')
  })

  it('sem vínculo: 3º slot é a primeira unidade da worktree na cookie', () => {
    expect(
      slugUnidadePrefixoBarra({
        slugUnidadeContexto: null,
        slugTorcida: 'gavioes',
        canaisAbertos: [camisa, pde, outraPde],
        raizIdTorcida: 'gavioes-id',
      }),
    ).toBe('pde-fiel-baixada')
  })

  it('unidade de outra torcida não vira 3º slot da worktree ativa', () => {
    expect(
      slugUnidadePrefixoBarra({
        slugUnidadeContexto: null,
        slugTorcida: 'gavioes',
        canaisAbertos: [{ slug: 'pde-camisa', ehUnidade: true, raizId: 'camisa-id' }],
        raizIdTorcida: 'gavioes-id',
      }),
    ).toBeNull()
  })
})

describe('temUnidadeFixaOperador', () => {
  it('sócio: fixa quando há escopo unidade', () => {
    expect(
      temUnidadeFixaOperador({
        superAdmin: false,
        temEscopoUnidade: true,
        slugUnidade: 'sub-sede-rio-claro',
        atualSlug: 'gavioes',
      }),
    ).toBe(true)
  })

  it('super-admin na Sede: unidade permanece no 3º slot', () => {
    expect(
      temUnidadeFixaOperador({
        superAdmin: true,
        temEscopoUnidade: true,
        slugUnidade: 'sub-sede-rio-claro',
        atualSlug: 'gavioes',
      }),
    ).toBe(true)
  })

  it('super-admin na própria unidade: fixa', () => {
    expect(
      temUnidadeFixaOperador({
        superAdmin: true,
        temEscopoUnidade: true,
        slugUnidade: 'sub-sede-rio-claro',
        atualSlug: 'sub-sede-rio-claro',
      }),
    ).toBe(true)
  })

  it('sem escopo ou slug: nunca fixa', () => {
    expect(
      temUnidadeFixaOperador({
        superAdmin: true,
        temEscopoUnidade: false,
        slugUnidade: 'sub-sede-rio-claro',
        atualSlug: 'sub-sede-rio-claro',
      }),
    ).toBe(false)
    expect(
      temUnidadeFixaOperador({
        superAdmin: false,
        temEscopoUnidade: true,
        slugUnidade: null,
        atualSlug: 'gavioes',
      }),
    ).toBe(false)
  })
})

describe('idsCanaisHierarquiaFixosNaBarra', () => {
  it('super-admin na Sede: sede + unidade do 3º slot ficam fora da 4+', () => {
    expect(
      idsCanaisHierarquiaFixosNaBarra({
        canalIdTorcida: 'canal-gavioes',
        canalIdUnidade: 'canal-rio-claro',
        superAdmin: true,
        temEscopoUnidade: true,
        slugUnidade: 'sub-sede-rio-claro',
        atualSlug: 'gavioes',
      }),
    ).toEqual(['canal-gavioes', 'canal-rio-claro'])
  })

  it('sócio: sede + unidade do vínculo ficam fora da 4+', () => {
    expect(
      idsCanaisHierarquiaFixosNaBarra({
        canalIdTorcida: 'canal-gavioes',
        canalIdUnidade: 'canal-rio-claro',
        superAdmin: false,
        temEscopoUnidade: true,
        slugUnidade: 'sub-sede-rio-claro',
        atualSlug: 'gavioes',
      }),
    ).toEqual(['canal-gavioes', 'canal-rio-claro'])
  })
})

describe('ordem arrastável com hierarquia', () => {
  const fixos = ['sede', 'unidade']

  it('exclui fixos da zona móvel', () => {
    expect(ordemArrastavelSemFixos(['sede', 'unidade', 'a', 'b'], fixos)).toEqual([
      'a',
      'b',
    ])
  })

  it('drag só permuta extras; mantém prefixo hierárquico', () => {
    expect(moverSlugArrastavel(['sede', 'unidade', 'a', 'b'], 'b', 'a', fixos)).toEqual([
      'sede',
      'unidade',
      'b',
      'a',
    ])
  })

  it('não move fixo nem usa fixo como alvo', () => {
    expect(moverSlugArrastavel(['sede', 'a', 'b'], 'sede', 'a', ['sede'])).toEqual([
      'sede',
      'a',
      'b',
    ])
    expect(moverSlugArrastavel(['sede', 'a', 'b'], 'a', 'sede', ['sede'])).toEqual([
      'sede',
      'a',
      'b',
    ])
  })

  it('aplicarOrdemArrastavel reconstrói cookie com fixos no início', () => {
    expect(aplicarOrdemArrastavel(['sede', 'a', 'b'], ['b', 'a'], ['sede'])).toEqual([
      'sede',
      'b',
      'a',
    ])
    // Subconjunto: 'a' sozinho só permuta o slot de a; 'b' permanece.
    expect(aplicarOrdemArrastavel(['sede', 'a', 'b'], ['a'], ['sede'])).toEqual([
      'sede',
      'a',
      'b',
    ])
  })

  it('fixo ausente do cookie não é inventado', () => {
    expect(aplicarOrdemArrastavel(['a', 'b'], ['b', 'a'], ['sede'])).toEqual(['b', 'a'])
  })
})
