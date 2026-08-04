import { describe, expect, it } from 'vitest'
import {
  herdarDadosSedeNaSolicitacao,
  podeDecidirSolicitacao,
  resolverStatusExibicaoSolicitacao,
  transicionarSolicitacao,
  type AtorSolicitacao,
} from '../afiliacao-unidade'

const vice: AtorSolicitacao = { temAffiliationManage: true, isOwner: false, isSuperAdmin: false }
const presidente: AtorSolicitacao = { temAffiliationManage: true, isOwner: true, isSuperAdmin: false }
const superAdmin: AtorSolicitacao = { temAffiliationManage: true, isOwner: false, isSuperAdmin: true }
const adminComum: AtorSolicitacao = {
  temAffiliationManage: false,
  isOwner: false,
  isSuperAdmin: false,
}

describe('podeDecidirSolicitacao (peso final do Presidente)', () => {
  it('só owner-com-permissão ou super-admin decidem', () => {
    expect(podeDecidirSolicitacao(presidente)).toBe(true)
    expect(podeDecidirSolicitacao(superAdmin)).toBe(true)
    expect(podeDecidirSolicitacao(vice)).toBe(false)
    expect(podeDecidirSolicitacao(adminComum)).toBe(false)
  })
})

describe('transicionarSolicitacao', () => {
  it('owner aprova PENDENTE → APROVADA', () => {
    expect(transicionarSolicitacao('PENDENTE', 'aprovar', presidente)).toEqual({
      ok: true,
      status: 'APROVADA',
    })
  })

  it('super-admin aprova PENDENTE → APROVADA', () => {
    expect(transicionarSolicitacao('PENDENTE', 'aprovar', superAdmin)).toEqual({
      ok: true,
      status: 'APROVADA',
    })
  })

  it('owner recusa PENDENTE → RECUSADA', () => {
    expect(transicionarSolicitacao('PENDENTE', 'recusar', presidente)).toEqual({
      ok: true,
      status: 'RECUSADA',
    })
  })

  it('Vice NÃO decide (peso final é do Presidente)', () => {
    expect(transicionarSolicitacao('PENDENTE', 'aprovar', vice).ok).toBe(false)
    expect(transicionarSolicitacao('PENDENTE', 'recusar', vice).ok).toBe(false)
  })

  it('admin comum não decide', () => {
    expect(transicionarSolicitacao('PENDENTE', 'aprovar', adminComum).ok).toBe(false)
  })

  it('não dá para decidir o que não está PENDENTE', () => {
    expect(transicionarSolicitacao('APROVADA', 'aprovar', presidente).ok).toBe(false)
    expect(transicionarSolicitacao('RECUSADA', 'recusar', presidente).ok).toBe(false)
  })
})

describe('herdarDadosSedeNaSolicitacao', () => {
  const snap = {
    nome: 'PDE Antigo',
    tipo: 'PONTO_ENCONTRO' as const,
    cidade: 'Praia Grande',
    estado: 'SP',
    endereco: 'Rua Velha, 1',
    cep: '11700-000',
    lat: -24.0,
    lng: -46.4,
    fotoUrl: 'https://example.com/old.jpg',
  }

  const sede = {
    nome: 'PDE Novo',
    tipo: 'PONTO_ENCONTRO',
    cidade: 'Santos',
    estado: 'SP',
    endereco: 'Rua Nova, 99',
    cep: '11010-000',
    lat: -23.9,
    lng: -46.3,
    fotoUrl: 'https://example.com/new.jpg',
  }

  it('PENDENTE ignora a Sede e mantém o snapshot', () => {
    expect(herdarDadosSedeNaSolicitacao(snap, 'PENDENTE', sede)).toEqual(snap)
  })

  it('RECUSADA ignora a Sede e mantém o snapshot', () => {
    expect(herdarDadosSedeNaSolicitacao(snap, 'RECUSADA', sede)).toEqual(snap)
  })

  it('APROVADA sem sede mantém o snapshot', () => {
    expect(herdarDadosSedeNaSolicitacao(snap, 'APROVADA', null)).toEqual(snap)
  })

  it('APROVADA com sede herda nome/local/foto vivos', () => {
    expect(herdarDadosSedeNaSolicitacao(snap, 'APROVADA', sede)).toEqual({
      nome: 'PDE Novo',
      tipo: 'PONTO_ENCONTRO',
      cidade: 'Santos',
      estado: 'SP',
      endereco: 'Rua Nova, 99',
      cep: '11010-000',
      lat: -23.9,
      lng: -46.3,
      fotoUrl: 'https://example.com/new.jpg',
    })
  })

  it('cidade/estado vazios na Sede caem no snapshot (campos obrigatórios)', () => {
    expect(
      herdarDadosSedeNaSolicitacao(snap, 'APROVADA', {
        ...sede,
        cidade: '  ',
        estado: null,
        endereco: null,
        lat: null,
      }),
    ).toMatchObject({
      cidade: 'Praia Grande',
      estado: 'SP',
      endereco: null,
      lat: null,
    })
  })
})

describe('resolverStatusExibicaoSolicitacao (status mais recente)', () => {
  it('APROVADA sem Sede vira REMOVIDA — a unidade foi excluída depois', () => {
    expect(resolverStatusExibicaoSolicitacao('APROVADA', false)).toBe('REMOVIDA')
  })

  it('APROVADA com Sede viva continua APROVADA', () => {
    expect(resolverStatusExibicaoSolicitacao('APROVADA', true)).toBe('APROVADA')
  })

  it('PENDENTE e RECUSADA nunca viram REMOVIDA (nunca tiveram Sede)', () => {
    expect(resolverStatusExibicaoSolicitacao('PENDENTE', false)).toBe('PENDENTE')
    expect(resolverStatusExibicaoSolicitacao('RECUSADA', false)).toBe('RECUSADA')
  })
})
