import { describe, expect, it } from 'vitest'
import {
  podeDecidirAfiliacao,
  transicionarAfiliacao,
  type AtorAfiliacao,
} from '../afiliacao-unidade'

const vice: AtorAfiliacao = { temAffiliationManage: true, isOwner: false, isSuperAdmin: false }
const presidente: AtorAfiliacao = { temAffiliationManage: true, isOwner: true, isSuperAdmin: false }
const superAdmin: AtorAfiliacao = { temAffiliationManage: true, isOwner: false, isSuperAdmin: true }
const adminComum: AtorAfiliacao = { temAffiliationManage: false, isOwner: false, isSuperAdmin: false }

describe('podeDecidirAfiliacao (peso final do Presidente)', () => {
  it('só owner-com-permissão ou super-admin decidem', () => {
    expect(podeDecidirAfiliacao(presidente)).toBe(true)
    expect(podeDecidirAfiliacao(superAdmin)).toBe(true)
    expect(podeDecidirAfiliacao(vice)).toBe(false)
    expect(podeDecidirAfiliacao(adminComum)).toBe(false)
  })
})

describe('transicionarAfiliacao', () => {
  it('Vice recomenda um PENDENTE — permanece PENDENTE (não finaliza)', () => {
    const t = transicionarAfiliacao('PENDENTE', 'recomendar', vice)
    expect(t).toEqual({ ok: true, status: 'PENDENTE' })
  })

  it('admin comum não pode recomendar', () => {
    const t = transicionarAfiliacao('PENDENTE', 'recomendar', adminComum)
    expect(t.ok).toBe(false)
  })

  it('owner aprova PENDENTE → ATIVA', () => {
    expect(transicionarAfiliacao('PENDENTE', 'aprovar', presidente)).toEqual({
      ok: true,
      status: 'ATIVA',
    })
  })

  it('Vice NÃO aprova (só recomenda) — peso final é do Presidente', () => {
    expect(transicionarAfiliacao('PENDENTE', 'aprovar', vice).ok).toBe(false)
  })

  it('super-admin aprova PENDENTE → ATIVA', () => {
    expect(transicionarAfiliacao('PENDENTE', 'aprovar', superAdmin)).toEqual({
      ok: true,
      status: 'ATIVA',
    })
  })

  it('owner recusa PENDENTE → RECUSADA', () => {
    expect(transicionarAfiliacao('PENDENTE', 'recusar', presidente)).toEqual({
      ok: true,
      status: 'RECUSADA',
    })
  })

  it('não dá para aprovar o que não está PENDENTE', () => {
    expect(transicionarAfiliacao('ATIVA', 'aprovar', presidente).ok).toBe(false)
    expect(transicionarAfiliacao('RECUSADA', 'aprovar', presidente).ok).toBe(false)
  })

  it('encerrar só um vínculo ATIVA', () => {
    expect(transicionarAfiliacao('ATIVA', 'encerrar', presidente)).toEqual({
      ok: true,
      status: 'ENCERRADA',
    })
    expect(transicionarAfiliacao('PENDENTE', 'encerrar', presidente).ok).toBe(false)
  })

  it('Vice não encerra vínculo', () => {
    expect(transicionarAfiliacao('ATIVA', 'encerrar', vice).ok).toBe(false)
  })
})
