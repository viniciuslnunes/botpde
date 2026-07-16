import { EventEmitter } from 'node:events'

/**
 * Event bus em memória para pings de notificação (SSE). Singleton de módulo:
 * assume UMA única instância do processo Node — o deploy no Railway usa 1
 * réplica (railway.toml não define numReplicas; o padrão é 1). Se o web
 * escalar horizontalmente, este bus deixa de alcançar conexões em outras
 * réplicas e precisa migrar para Postgres LISTEN/NOTIFY ou Redis pub/sub.
 * O polling existente (fallback) continua funcionando nesse cenário.
 */
const bus = new EventEmitter()
bus.setMaxListeners(0)

function channelKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`
}

/** Avisa as conexões SSE do usuário no tenant que há notificação nova. */
export function emitNotificacaoPing(tenantId: string, userId: string): void {
  bus.emit(channelKey(tenantId, userId))
}

/** Inscreve um listener de ping; retorna a função de unsubscribe. */
export function subscribeNotificacaoPing(
  tenantId: string,
  userId: string,
  onPing: () => void,
): () => void {
  const key = channelKey(tenantId, userId)
  bus.on(key, onPing)
  return () => bus.off(key, onPing)
}
