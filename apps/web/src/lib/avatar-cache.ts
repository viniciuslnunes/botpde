/** Tag do cache do avatar atual do usuário (topbar, aside da Comunidade). */
export function tagAvatarUsuario(userId: string): string {
  return `avatar-usuario:${userId}`
}

/** Tag do cache do nome atual do usuário (topbar / AdminShell). */
export function tagNomeUsuario(userId: string): string {
  return `nome-usuario:${userId}`
}
