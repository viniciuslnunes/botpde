'use client'

import { useServerSentPing } from '@/lib/use-server-sent-ping'

/**
 * Ping SSE de notificações: quem consome refaz o fetch da lista a cada evento.
 * O polling existente permanece como fallback se a conexão cair.
 */
export function useNotificationStream(onPing: () => void): void {
  useServerSentPing('/api/notificacoes/stream', onPing)
}
