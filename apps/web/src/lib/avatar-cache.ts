/** Tag do cache do avatar atual do usuário (topbar, aside da Comunidade). */
export function tagAvatarUsuario(userId: string): string {
  return `avatar-usuario:${userId}`
}
