import { describe, expect, it } from 'vitest'
import {
  remapLinkInboxPlataforma,
  TIPOS_NOTIFICACAO_PLATAFORMA,
} from '@/lib/notificacoes-plataforma'

describe('inbox da plataforma', () => {
  it('só inclui denúncia e solicitação de unidade', () => {
    expect(TIPOS_NOTIFICACAO_PLATAFORMA).toEqual([
      'SOLICITACAO_UNIDADE_CRIADA',
      'DENUNCIA_NOVA',
    ])
  })

  it('remapilha deep-links do tenant para o console', () => {
    expect(remapLinkInboxPlataforma('/admin/afiliacoes')).toBe('/super-admin/unidades')
    expect(remapLinkInboxPlataforma('/admin/comunidade/moderacao')).toBe('/super-admin/moderacao')
    expect(remapLinkInboxPlataforma('/admin/bar/pdv')).toBe('/admin/bar/pdv')
  })
})
