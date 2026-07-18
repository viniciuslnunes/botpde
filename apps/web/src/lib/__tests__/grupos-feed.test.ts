import { describe, expect, it } from 'vitest'
import { escopoFeedComGrupos, escopoFeedSomenteGrupos } from '@/lib/grupos-scope'

describe('escopoFeedComGrupos', () => {
  it('sem userId restringe a posts sem conversa', () => {
    expect(escopoFeedComGrupos()).toEqual({ conversaId: null })
    expect(escopoFeedComGrupos(undefined)).toEqual({ conversaId: null })
  })

  it('com userId inclui murais de grupos da comunidade onde é membro ativo', () => {
    const scope = escopoFeedComGrupos('user-1')
    expect(scope).toEqual({
      OR: [
        { conversaId: null },
        {
          conversa: {
            tipo: 'GRUPO',
            comunidade: true,
            membros: {
              some: {
                userId: 'user-1',
                status: 'ATIVO',
                saiuEm: null,
                silenciada: false,
              },
            },
          },
        },
      ],
    })
  })
})

describe('escopoFeedSomenteGrupos', () => {
  it('filtra só murais dos grupos do viewer', () => {
    expect(escopoFeedSomenteGrupos('user-2')).toEqual({
      conversa: {
        tipo: 'GRUPO',
        comunidade: true,
        membros: {
          some: {
            userId: 'user-2',
            status: 'ATIVO',
            saiuEm: null,
            silenciada: false,
          },
        },
      },
    })
  })
})
