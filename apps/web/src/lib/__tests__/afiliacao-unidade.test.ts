import { describe, expect, it } from 'vitest'
import {
  podeDecidirSolicitacao,
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
