/**
 * Destino operacional da pessoa no admin, a partir do perfil da comunidade.
 *
 * Ficha na torcida ativa → detalhe em Torcedores (sócio e torcedor usam a
 * mesma página). Sem ficha, só o super-admin tem tela: a listagem de usuários
 * da plataforma, com o id na URL para abrir o detalhe.
 */

export function hrefAdminPessoa(args: {
  membroId: string | null
  userId: string
  superAdmin: boolean
}): string | null {
  if (args.membroId) return `/admin/torcedores/${args.membroId}`
  if (args.superAdmin && args.userId) {
    return `/super-admin/usuarios?id=${encodeURIComponent(args.userId)}`
  }
  return null
}
