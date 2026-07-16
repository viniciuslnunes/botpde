import {
  publishRealtime,
  subscribeRealtime,
} from '@/lib/realtime-bus'

/** Canal da thread aberta — quem está na conversa refetcha mensagens. */
export function conversaMensagemBusKey(conversaId: string): string {
  return `msg:conversa:${conversaId}`
}

/** Canal da inbox do usuário — badge, lista e resumo. */
export function inboxMensagemBusKey(userId: string): string {
  return `msg:inbox:${userId}`
}

/** Avisa a thread e a inbox de cada membro ativo. */
export function emitMensagemNova(conversaId: string, membroUserIds: string[]): void {
  publishRealtime(conversaMensagemBusKey(conversaId))
  const unique = [...new Set(membroUserIds)]
  for (const userId of unique) {
    publishRealtime(inboxMensagemBusKey(userId))
  }
}

export function subscribeConversaMensagem(
  conversaId: string,
  onPing: () => void,
): () => void {
  return subscribeRealtime(conversaMensagemBusKey(conversaId), onPing)
}

export function subscribeInboxMensagem(userId: string, onPing: () => void): () => void {
  return subscribeRealtime(inboxMensagemBusKey(userId), onPing)
}
