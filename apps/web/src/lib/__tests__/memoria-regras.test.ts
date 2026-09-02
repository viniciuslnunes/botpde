import { describe, expect, it } from 'vitest'
import {
  aliadoPodeVerMemoria,
  CriarMemoriaFatoSchema,
  diaValidoParaFatoAtrasado,
  diaValidoParaPublicarMemoria,
  itemEntraNoEscopoClube,
  MEMORIA_ALIADOS_DEFAULT,
  MEMORIA_PRESENCA_DEFAULT,
  partidaAbreEspinha,
  podeListarPresenca,
  resolverEscopoMemoriaPadrao,
  escoposMemoriaDoCanal,
  slugMemoriaCapitulo,
  filtrarDiasPorCapitulo,
  interpretarEntradaMemoria,
  resolverEntradaMemoria,
  MEMORIA_INTENCAO,
} from '@torcida/types'

describe('escopo padrão', () => {
  it('canal da Comunidade manda — CN nunca cai na unidade', () => {
    expect(resolverEscopoMemoriaPadrao({ canal: 'nacional', temUnidade: true })).toBe('clube')
    expect(resolverEscopoMemoriaPadrao({ canal: 'torcida' })).toBe('torcida')
    expect(resolverEscopoMemoriaPadrao({ canal: 'unidade' })).toBe('unidade')
  })

  it('legado sem canal: CN sem unidade cai no clube; unidade permanece unidade', () => {
    expect(resolverEscopoMemoriaPadrao({ modoNacional: true, temUnidade: false })).toBe(
      'clube',
    )
    expect(resolverEscopoMemoriaPadrao({ modoNacional: false, temUnidade: true })).toBe(
      'unidade',
    )
    expect(resolverEscopoMemoriaPadrao({ modoNacional: true, temUnidade: true })).toBe(
      'unidade',
    )
  })
})

describe('recortes por canal', () => {
  it('CN só oferece clube; unidade oferece chip da torcida', () => {
    expect(escoposMemoriaDoCanal({ canal: 'nacional', temTorcida: true })).toEqual(['clube'])
    expect(escoposMemoriaDoCanal({ canal: 'torcida' })).toEqual(['torcida'])
    expect(escoposMemoriaDoCanal({ canal: 'unidade', temTorcida: true })).toEqual([
      'unidade',
      'torcida',
    ])
    expect(escoposMemoriaDoCanal({ canal: 'unidade', temTorcida: false })).toEqual(['unidade'])
  })
})

describe('partida na espinha', () => {
  it('clube abre o dia do jogo mesmo sem post da unidade', () => {
    expect(partidaAbreEspinha('clube', false)).toBe(true)
  })
  it('unidade/torcida ignoram partida órfã', () => {
    expect(partidaAbreEspinha('unidade', false)).toBe(false)
    expect(partidaAbreEspinha('torcida', true)).toBe(true)
  })
})

describe('escopo clube', () => {
  it('aceita alcance nacional público e tenant sintético público', () => {
    expect(itemEntraNoEscopoClube({ alcanceNacional: true, visibilidade: 'PUBLICO' })).toBe(
      true,
    )
    expect(itemEntraNoEscopoClube({ tenantSintetico: true, visibilidade: 'PUBLICO' })).toBe(
      true,
    )
  })
  it('recusa interno da torcida', () => {
    expect(itemEntraNoEscopoClube({ visibilidade: 'TENANT' })).toBe(false)
    expect(itemEntraNoEscopoClube({ alcanceNacional: true, visibilidade: 'TENANT' })).toBe(
      false,
    )
    expect(itemEntraNoEscopoClube({ tenantSintetico: true, visibilidade: 'PRIVADO' })).toBe(
      false,
    )
  })
})

describe('aliados', () => {
  it('default desligado', () => {
    expect(MEMORIA_ALIADOS_DEFAULT).toBe(false)
  })
  it('exige as duas flags + relação allied + conteúdo público', () => {
    expect(
      aliadoPodeVerMemoria({
        relation: 'allied',
        flagOrigem: true,
        flagAliado: true,
        visibilidade: 'PUBLICO',
      }),
    ).toBe(true)
    expect(
      aliadoPodeVerMemoria({
        relation: 'allied',
        flagOrigem: true,
        flagAliado: false,
        visibilidade: 'PUBLICO',
      }),
    ).toBe(false)
    expect(
      aliadoPodeVerMemoria({
        relation: 'allied',
        flagOrigem: true,
        flagAliado: true,
        visibilidade: 'TENANT',
      }),
    ).toBe(false)
    expect(
      aliadoPodeVerMemoria({
        relation: 'rival',
        flagOrigem: true,
        flagAliado: true,
        visibilidade: 'PUBLICO',
      }),
    ).toBe(false)
  })
})

describe('fato atrasado', () => {
  it('rejeita hoje, futuro e além de 5 anos', () => {
    expect(diaValidoParaFatoAtrasado('2026-08-29', '2026-08-30')).toBe(true)
    expect(diaValidoParaFatoAtrasado('2026-08-30', '2026-08-30')).toBe(false)
    expect(diaValidoParaFatoAtrasado('2026-08-31', '2026-08-30')).toBe(false)
    expect(diaValidoParaFatoAtrasado('2020-08-30', '2026-08-30')).toBe(false)
    expect(diaValidoParaFatoAtrasado('2021-08-30', '2026-08-30')).toBe(true)
  })
  it('publicar na data aceita hoje e o futuro do calendário', () => {
    expect(diaValidoParaPublicarMemoria('2026-08-29', '2026-08-30')).toBe(true)
    expect(diaValidoParaPublicarMemoria('2026-08-30', '2026-08-30')).toBe(true)
    expect(diaValidoParaPublicarMemoria('2026-11-28', '2026-08-30')).toBe(true)
    expect(diaValidoParaPublicarMemoria('2026-11-29', '2026-08-30')).toBe(false)
    expect(diaValidoParaPublicarMemoria('2020-08-30', '2026-08-30')).toBe(false)
  })
  it('schema exige dia e texto', () => {
    expect(CriarMemoriaFatoSchema.safeParse({ dia: '2026-08-01', conteudo: 'Lá' }).success).toBe(
      true,
    )
    expect(CriarMemoriaFatoSchema.safeParse({ dia: '01/08/2026', conteudo: 'Lá' }).success).toBe(
      false,
    )
  })
})

describe('presença', () => {
  it('default opt-in desligado; só check-in no mesmo tenant', () => {
    expect(MEMORIA_PRESENCA_DEFAULT).toBe(false)
    expect(
      podeListarPresenca({
        optIn: true,
        mesmoTenant: true,
        temCheckIn: true,
        escopo: 'unidade',
        relation: 'self',
      }),
    ).toBe(true)
    expect(
      podeListarPresenca({
        optIn: true,
        mesmoTenant: true,
        temCheckIn: false,
        escopo: 'unidade',
        relation: 'self',
      }),
    ).toBe(false)
    expect(
      podeListarPresenca({
        optIn: true,
        mesmoTenant: true,
        temCheckIn: true,
        escopo: 'clube',
        relation: 'self',
      }),
    ).toBe(false)
    expect(
      podeListarPresenca({
        optIn: true,
        mesmoTenant: false,
        temCheckIn: true,
        escopo: 'unidade',
        relation: 'allied',
      }),
    ).toBe(false)
  })
})

describe('capítulos do acervo', () => {
  it('normaliza slug a partir do título', () => {
    expect(slugMemoriaCapitulo('Libertadores 2026')).toBe('libertadores-2026')
    expect(slugMemoriaCapitulo('  Ação & Reação  ')).toBe('acao-reacao')
    expect(slugMemoriaCapitulo('')).toBeNull()
  })

  it('filtra espinha mantendo ordem e só dias do capítulo', () => {
    const espinha = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']
    expect(filtrarDiasPorCapitulo(['2026-01-02', '2026-01-04'], espinha)).toEqual([
      '2026-01-02',
      '2026-01-04',
    ])
    expect(filtrarDiasPorCapitulo([], espinha)).toEqual(espinha)
  })
})

describe('composer unificado', () => {
  it('prefixo marco separa título e corpo', () => {
    const r = interpretarEntradaMemoria('marco: Fundação da subsede\nPrimeiro barracão.')
    expect(r.intencao).toBe(MEMORIA_INTENCAO.MARCO)
    expect(r.titulo).toBe('Fundação da subsede')
    expect(r.descricao).toBe('Primeiro barracão.')
  })

  it('prefixo aniversário normaliza título', () => {
    const r = interpretarEntradaMemoria('aniversário: 40 anos da Gaviões')
    expect(r.intencao).toBe(MEMORIA_INTENCAO.ANIVERSARIO)
    expect(r.titulo).toBe('Aniversário — 40 anos da Gaviões')
  })

  it('menção a criar evento vira dica de agenda', () => {
    const r = interpretarEntradaMemoria('Quero criar um evento de caravana')
    expect(r.intencao).toBe(MEMORIA_INTENCAO.EVENTO)
  })

  it('texto livre vira relato', () => {
    const r = interpretarEntradaMemoria('Sede lotada no churrasco.')
    expect(r.intencao).toBe(MEMORIA_INTENCAO.FATO)
    expect(r.conteudo).toBe('Sede lotada no churrasco.')
  })

  it('chip marco ignora prefixo ausente', () => {
    const r = resolverEntradaMemoria('Fundação da subsede\nBarracão inaugurado.', MEMORIA_INTENCAO.MARCO)
    expect(r.intencao).toBe(MEMORIA_INTENCAO.MARCO)
    expect(r.titulo).toBe('Fundação da subsede')
    expect(r.descricao).toBe('Barracão inaugurado.')
  })
})
