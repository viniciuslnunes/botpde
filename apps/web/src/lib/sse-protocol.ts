/** Payload de `data:` que pede troca limpa da conexão SSE (antes do hard cap Railway). */
export const SSE_RECONNECT_DATA = 'reconnect'

/** Keep-alive bem abaixo do idle cut de 5 min do Railway. */
export const SSE_HEARTBEAT_MS = 15_000
/** Avisa o client para reconectar antes do hard cap de 15 min. */
export const SSE_RECONNECT_SIGNAL_MS = 12 * 60_000
/** Fecha o stream se o client não tiver saído após o sinal. */
export const SSE_MAX_STREAM_MS = 12.5 * 60_000
/** Client fecha um pouco após o sinal do servidor. */
export const SSE_CLIENT_PROACTIVE_MS = SSE_RECONNECT_SIGNAL_MS + 15_000
