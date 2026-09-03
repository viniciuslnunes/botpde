import { describe, expect, it } from 'vitest'
import {
  abaSociosAdmin,
  hrefAdminPessoa,
  statusTorcedoresAdmin,
} from '@/lib/perfil-admin-href'

const base = {
  userId: 'user-1',
  superAdmin: false,
} as const

describe('hrefAdminPessoa', () => {
  it('torcedor aprovado abre a listagem filtrada pelo nome', () => {
    expect(
      hrefAdminPessoa({
        ...base,
        membroId: 'mem-1',
        tipo: 'TORCEDOR',
        status: 'APROVADO',
        nome: 'Caio Aguiar',
      }),
    ).toBe('/admin/torcedores?status=APROVADO&q=Caio+Aguiar')
  })

  it('torcedor pendente cai na aba de pendentes com a busca', () => {
    expect(
      hrefAdminPessoa({
        ...base,
        membroId: 'mem-1',
        tipo: 'TORCEDOR',
        status: 'PENDENTE',
        nome: 'Caio Aguiar',
      }),
    ).toBe('/admin/torcedores?status=PENDENTE&q=Caio+Aguiar')
  })

  it('torcedor desligado usa a aba Desligados, não o status do cadastro', () => {
    expect(
      hrefAdminPessoa({
        ...base,
        membroId: 'mem-1',
        tipo: 'TORCEDOR',
        status: 'APROVADO',
        desligadoEm: '2026-08-01',
        nome: 'Caio Aguiar',
      }),
    ).toBe('/admin/torcedores?status=DESLIGADO&q=Caio+Aguiar')
  })

  it('sócio pendente abre Solicitações com o nome na busca', () => {
    expect(
      hrefAdminPessoa({
        ...base,
        membroId: 'mem-1',
        tipo: 'SOCIO',
        status: 'PENDENTE',
        nome: 'Caio Aguiar',
      }),
    ).toBe('/admin/socios?status=solicitacoes&q=Caio+Aguiar')
  })

  it('sócio aprovado sem carteirinha abre Aguardando emissão', () => {
    expect(
      hrefAdminPessoa({
        ...base,
        membroId: 'mem-1',
        tipo: 'SOCIO',
        status: 'APROVADO',
        temCarteirinha: false,
        nome: 'Caio Aguiar',
      }),
    ).toBe('/admin/socios?status=aguardando&q=Caio+Aguiar')
  })

  it('sócio com carteirinha abre Emitidas — validade não esconde o registro', () => {
    expect(
      hrefAdminPessoa({
        ...base,
        membroId: 'mem-1',
        tipo: 'SOCIO',
        status: 'APROVADO',
        temCarteirinha: true,
        nome: 'Caio Aguiar',
      }),
    ).toBe('/admin/socios?status=emitidas&q=Caio+Aguiar')
  })

  it('ficha vence super-admin: a operação é na torcida, não na plataforma', () => {
    expect(
      hrefAdminPessoa({
        membroId: 'mem-1',
        userId: 'user-1',
        superAdmin: true,
        tipo: 'TORCEDOR',
        status: 'APROVADO',
        nome: 'Caio Aguiar',
      }),
    ).toBe('/admin/torcedores?status=APROVADO&q=Caio+Aguiar')
  })

  it('sem ficha, super-admin abre o usuário na listagem da plataforma', () => {
    expect(
      hrefAdminPessoa({
        membroId: null,
        userId: 'c1891367-c0e2-4fcb-a43d-a3974c137208',
        superAdmin: true,
      }),
    ).toBe('/super-admin/usuarios?id=c1891367-c0e2-4fcb-a43d-a3974c137208')
  })

  it('sem ficha e sem super-admin não oferece destino', () => {
    expect(
      hrefAdminPessoa({
        membroId: null,
        userId: 'user-1',
        superAdmin: false,
      }),
    ).toBeNull()
  })

  it('sem nome ainda aponta para a aba certa', () => {
    expect(
      hrefAdminPessoa({
        ...base,
        membroId: 'mem-1',
        tipo: 'SOCIO',
        status: 'PENDENTE',
      }),
    ).toBe('/admin/socios?status=solicitacoes')
  })
})

describe('abaSociosAdmin', () => {
  it('pendente → solicitações', () => {
    expect(abaSociosAdmin({ status: 'PENDENTE' })).toBe('solicitacoes')
  })

  it('aprovado sem carteirinha → aguardando', () => {
    expect(abaSociosAdmin({ status: 'APROVADO', temCarteirinha: false })).toBe(
      'aguardando',
    )
  })

  it('com carteirinha → emitidas, mesmo se o status faltar', () => {
    expect(abaSociosAdmin({ temCarteirinha: true })).toBe('emitidas')
  })
})

describe('statusTorcedoresAdmin', () => {
  it('desligado ganha da situação do cadastro', () => {
    expect(
      statusTorcedoresAdmin({ status: 'APROVADO', desligadoEm: new Date() }),
    ).toBe('DESLIGADO')
  })

  it('reprovado permanece reprovado', () => {
    expect(statusTorcedoresAdmin({ status: 'REPROVADO' })).toBe('REPROVADO')
  })
})
