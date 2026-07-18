/** Escopos Prisma do feed relacionados a grupos da comunidade (sem side-effects). */

/** Posts sem conversa (feed clássico) — cache compartilhado do Descobrir. */
export const escopoFeedSemConversa = { conversaId: null } as const

/** Membro ativo e não silenciado — vê posts do grupo no feed. */
export const filtroMembroGrupoNoFeed = (userId: string) =>
  ({
    userId,
    status: 'ATIVO' as const,
    saiuEm: null,
    silenciada: false,
  }) as const

/** Membro ativo (pode ler mural), independente de silêncio. */
export const filtroMembroGrupoAtivo = (userId: string) =>
  ({
    userId,
    status: 'ATIVO' as const,
    saiuEm: null,
  }) as const

/**
 * Escopo do feed pessoal: posts sem conversa + murais dos grupos em que o
 * viewer é membro ativo e não silenciou.
 */
export function escopoFeedComGrupos(userId?: string) {
  if (!userId) return escopoFeedSemConversa
  return {
    OR: [
      { conversaId: null },
      {
        conversa: {
          tipo: 'GRUPO' as const,
          comunidade: true,
          membros: { some: filtroMembroGrupoNoFeed(userId) },
        },
      },
    ],
  }
}

/** Só posts de murais dos grupos do viewer (filtro "Meus grupos"). */
export function escopoFeedSomenteGrupos(userId: string) {
  return {
    conversa: {
      tipo: 'GRUPO' as const,
      comunidade: true,
      membros: { some: filtroMembroGrupoNoFeed(userId) },
    },
  }
}
