import { describe, expect, it } from 'vitest'
import { formatarTituloNotificacao } from '@/components/portal/notification-item-visual'

const ator = { nome: 'Ana', avatarUrl: null }

describe('formatarTituloNotificacao — comentário', () => {
  it('post vs resposta no comentário', () => {
    expect(
      formatarTituloNotificacao({
        tipo: 'NOVO_COMENTARIO',
        titulo: 'Novo comentário no seu post',
        ator,
      }),
    ).toBe('Ana comentou no seu post')
    expect(
      formatarTituloNotificacao({
        tipo: 'NOVO_COMENTARIO',
        titulo: 'Resposta no seu comentário',
        ator,
      }),
    ).toBe('Ana respondeu ao seu comentário')
  })
})
