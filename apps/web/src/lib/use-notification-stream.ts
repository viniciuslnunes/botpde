'use client'

import { useServerSentPing } from '@/lib/use-server-sent-ping'

/**
 * Ping SSE de notificações: quem consome refaz o fetch da lista a cada evento.
 * O polling existente permanece como fallback se a conexão cair.
 *
 * `escopo: 'admin'` resolve o tenant por `getTenantFromHost` (mesma fonte de
 * `/api/admin/navbar-context`) em vez do tenant contextual do portal — sem
 * isso, super-admin/liderança multi-torcida no admin assina o ping do tenant
 * errado e só recebe o badge no polling de 20s (fallback já existente).
 *
 * `escopo: 'plataforma'` assina o ping por usuário (cross-tenant) no console
 * super-admin.
 */
export function useNotificationStream(onPing: () => void, escopo?: 'admin' | 'plataforma'): void {
  const endpoint = escopo ? `/api/notificacoes/stream?escopo=${escopo}` : '/api/notificacoes/stream'
  useServerSentPing(endpoint, onPing)
}
