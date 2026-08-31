import { describe, expect, it } from 'vitest'
import { hrefAdminPessoa } from '@/lib/perfil-admin-href'

describe('hrefAdminPessoa', () => {
  it('ficha na torcida aponta para o detalhe em Torcedores', () => {
    expect(
      hrefAdminPessoa({
        membroId: 'mem-1',
        userId: 'user-1',
        superAdmin: false,
      }),
    ).toBe('/admin/torcedores/mem-1')
  })

  it('ficha vence super-admin: a operação é na torcida, não na plataforma', () => {
    expect(
      hrefAdminPessoa({
        membroId: 'mem-1',
        userId: 'user-1',
        superAdmin: true,
      }),
    ).toBe('/admin/torcedores/mem-1')
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
})
