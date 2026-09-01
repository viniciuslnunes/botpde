import { describe, expect, it } from 'vitest'
import { PAPEL_DEPARTAMENTO } from '@torcida/types'
import {
  mesclarEquipeNivel,
  montarInputsNiveisVinculo,
  montarNiveisVinculo,
  rotuloPapelDepartamento,
  type AreaEfetivadaNivel,
  type MembroVinculoLite,
} from '../carteirinha-vinculo'

const UNIDADE = 'tenant-pde'
const SEDE = 'tenant-gavioes'
const BAT_U = 'dep-bateria-unidade'
const BAT_S = 'dep-bateria-sede'

const origem: MembroVinculoLite = {
  tenantId: UNIDADE,
  espelhado: false,
  tenantNome: 'GAVIÕES DA FIEL — PDE LESTE',
  sedeNome: 'PDE LESTE',
  departamento: { id: BAT_U, nome: 'Bateria' },
  departamentoSede: { id: BAT_S, nome: 'Bateria' },
}

const espelhoLite = {
  tenantId: SEDE,
  tenantNome: 'GAVIÕES DA FIEL',
  sedeNome: 'GAVIÕES DA FIEL',
  departamento: { id: BAT_S, nome: 'Bateria' },
}

function mapa(entries: Array<[string, AreaEfetivadaNivel[]]>) {
  return new Map(entries)
}

describe('rotuloPapelDepartamento', () => {
  it('usa o vocabulário da equipe, não o cargo de sistema', () => {
    expect(rotuloPapelDepartamento(PAPEL_DEPARTAMENTO.GESTOR)).toBe('Gestor')
    expect(rotuloPapelDepartamento(PAPEL_DEPARTAMENTO.MEMBRO)).toBe('Membro')
    expect(rotuloPapelDepartamento(null)).toBeNull()
  })
})

describe('mesclarEquipeNivel', () => {
  it('GESTOR vence MEMBRO no mesmo departamento', () => {
    const equipe = mesclarEquipeNivel(
      [{ departamentoId: BAT_U, departamentoNome: 'Bateria' }],
      [
        { departamentoId: BAT_U, departamentoNome: 'Bateria', papel: PAPEL_DEPARTAMENTO.MEMBRO },
        { departamentoId: BAT_U, departamentoNome: 'Bateria', papel: PAPEL_DEPARTAMENTO.GESTOR },
      ],
    )
    expect(equipe).toEqual([
      { departamentoId: BAT_U, departamentoNome: 'Bateria', papel: PAPEL_DEPARTAMENTO.GESTOR },
    ])
  })

  it('Role de área sozinho já conta como em vigor', () => {
    const equipe = mesclarEquipeNivel(
      [],
      [{ departamentoId: BAT_S, departamentoNome: 'Bateria', papel: PAPEL_DEPARTAMENTO.MEMBRO }],
    )
    expect(equipe).toHaveLength(1)
    expect(equipe[0]!.papel).toBe(PAPEL_DEPARTAMENTO.MEMBRO)
  })
})

describe('montarInputsNiveisVinculo', () => {
  it('vínculo na raiz: um só nível (a torcida)', () => {
    const atual: MembroVinculoLite = {
      tenantId: SEDE,
      espelhado: false,
      tenantNome: 'GAVIÕES DA FIEL',
      sedeNome: 'GAVIÕES DA FIEL',
      departamento: { id: 'dep-diretoria', nome: 'Diretoria' },
      departamentoSede: null,
    }
    const inputs = montarInputsNiveisVinculo({
      atual,
      origem: null,
      espelho: null,
      raiz: { tenantId: SEDE, tenantNome: 'GAVIÕES DA FIEL' },
      equipePorTenant: mapa([]),
    })
    expect(inputs).toHaveLength(1)
    expect(inputs[0]!.nivel).toBe('sede')
    expect(inputs[0]!.preferencia?.nome).toBe('Diretoria')
  })

  it('Caso B na origem: unidade e sede ficam separados', () => {
    const inputs = montarInputsNiveisVinculo({
      atual: origem,
      origem: null,
      espelho: espelhoLite,
      raiz: { tenantId: SEDE, tenantNome: 'GAVIÕES DA FIEL' },
      equipePorTenant: mapa([
        [
          UNIDADE,
          [{ departamentoId: BAT_U, departamentoNome: 'Bateria', papel: PAPEL_DEPARTAMENTO.GESTOR }],
        ],
        [
          SEDE,
          [{ departamentoId: BAT_S, departamentoNome: 'Bateria', papel: PAPEL_DEPARTAMENTO.MEMBRO }],
        ],
      ]),
    })
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toMatchObject({ nivel: 'unidade', localNome: 'PDE LESTE' })
    expect(inputs[1]).toMatchObject({ nivel: 'sede', localNome: 'GAVIÕES DA FIEL' })
    expect(inputs[0]!.efetivadas[0]!.papel).toBe(PAPEL_DEPARTAMENTO.GESTOR)
    expect(inputs[1]!.efetivadas[0]!.papel).toBe(PAPEL_DEPARTAMENTO.MEMBRO)
  })

  it('Caso B no espelho: lê a área da origem, não a sede.nome do HQ', () => {
    const atual: MembroVinculoLite = {
      tenantId: SEDE,
      espelhado: true,
      tenantNome: 'GAVIÕES DA FIEL',
      sedeNome: 'GAVIÕES DA FIEL',
      departamento: { id: BAT_S, nome: 'Bateria' },
      departamentoSede: null,
    }
    const inputs = montarInputsNiveisVinculo({
      atual,
      origem: {
        tenantId: UNIDADE,
        tenantNome: 'GAVIÕES DA FIEL — PDE LESTE',
        sedeNome: 'PDE LESTE',
        departamento: { id: BAT_U, nome: 'Bateria' },
      },
      espelho: null,
      raiz: { tenantId: SEDE, tenantNome: 'GAVIÕES DA FIEL' },
      equipePorTenant: mapa([]),
    })
    expect(inputs[0]).toMatchObject({
      nivel: 'unidade',
      localNome: 'PDE LESTE',
      preferencia: { id: BAT_U, nome: 'Bateria' },
    })
    expect(inputs[1]).toMatchObject({
      nivel: 'sede',
      localNome: 'GAVIÕES DA FIEL',
      preferencia: { id: BAT_S, nome: 'Bateria' },
    })
  })

  it('origem sem espelho ainda usa departamentoSedeId como área da sede', () => {
    const inputs = montarInputsNiveisVinculo({
      atual: origem,
      origem: null,
      espelho: null,
      raiz: { tenantId: SEDE, tenantNome: 'GAVIÕES DA FIEL' },
      equipePorTenant: mapa([]),
    })
    expect(inputs).toHaveLength(2)
    expect(inputs[1]).toMatchObject({
      nivel: 'sede',
      localNome: 'GAVIÕES DA FIEL',
      preferencia: { id: BAT_S, nome: 'Bateria' },
    })
  })
})

describe('montarNiveisVinculo', () => {
  it('fraseia gestor na unidade e membro na sede', () => {
    const views = montarNiveisVinculo([
      {
        nivel: 'unidade',
        localNome: 'PDE LESTE',
        preferencia: { id: BAT_U, nome: 'Bateria' },
        efetivadas: [
          { departamentoId: BAT_U, departamentoNome: 'Bateria', papel: PAPEL_DEPARTAMENTO.GESTOR },
        ],
      },
      {
        nivel: 'sede',
        localNome: 'GAVIÕES DA FIEL',
        preferencia: { id: BAT_S, nome: 'Bateria' },
        efetivadas: [
          { departamentoId: BAT_S, departamentoNome: 'Bateria', papel: PAPEL_DEPARTAMENTO.MEMBRO },
        ],
      },
    ])
    expect(views[0]).toMatchObject({
      rotulo: 'Na sua unidade',
      atuacao: 'Gestor da Bateria',
      situacaoLabel: 'Em vigor',
      papelLabel: 'Gestor',
    })
    expect(views[1]).toMatchObject({
      rotulo: 'Na sede',
      atuacao: 'Membro da Bateria',
      situacaoLabel: 'Em vigor',
      papelLabel: 'Membro',
    })
  })

  it('nível único não fala "sede" — é a torcida inteira', () => {
    const views = montarNiveisVinculo([
      {
        nivel: 'sede',
        localNome: 'GAVIÕES DA FIEL',
        preferencia: { id: 'dep-dir', nome: 'Diretoria' },
        efetivadas: [],
      },
    ])
    expect(views[0]!.rotulo).toBe('Na torcida')
    expect(views[0]!.atuacao).toBe('Diretoria')
    expect(views[0]!.situacaoLabel).toBe('Pretendida — ainda não na equipe')
  })

  it('sem área neste nível continua visível no Caso B', () => {
    const views = montarNiveisVinculo([
      {
        nivel: 'unidade',
        localNome: 'PDE LESTE',
        preferencia: { id: BAT_U, nome: 'Bateria' },
        efetivadas: [
          { departamentoId: BAT_U, departamentoNome: 'Bateria', papel: PAPEL_DEPARTAMENTO.GESTOR },
        ],
      },
      {
        nivel: 'sede',
        localNome: 'GAVIÕES DA FIEL',
        preferencia: null,
        efetivadas: [],
      },
    ])
    expect(views[1]!.atuacao).toBe('Sem área neste nível')
    expect(views[1]!.situacaoLabel).toBe('Sem área neste nível')
  })
})
