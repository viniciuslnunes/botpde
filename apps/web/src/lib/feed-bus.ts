import { EventEmitter } from 'node:events'

/**
 * Bus de push do feed da Comunidade — mesmo padrão de notificacoes-bus.ts:
 * em memória, assume UMA única instância do processo Node (Railway, sem
 * numReplicas configurado; o padrão é 1). Se o web escalar horizontalmente,
 * este bus deixa de alcançar conexões em outras réplicas e precisa migrar
 * para Postgres LISTEN/NOTIFY ou Redis pub/sub. Canal por tenant: todo mundo
 * com o feed daquele tenant aberto recebe o ping (não por usuário, como nas
 * notificações — o feed é compartilhado).
 */
const bus = new EventEmitter()
bus.setMaxListeners(0)

function channelKey(tenantId: string): string {
  return `feed:${tenantId}`
}

/** Avisa as conexões SSE do tenant que há post novo no feed. */
export function emitFeedPing(tenantId: string): void {
  bus.emit(channelKey(tenantId))
}

/** Inscreve um listener de ping; retorna a função de unsubscribe. */
export function subscribeFeedPing(tenantId: string, onPing: () => void): () => void {
  const key = channelKey(tenantId)
  bus.on(key, onPing)
  return () => bus.off(key, onPing)
}
