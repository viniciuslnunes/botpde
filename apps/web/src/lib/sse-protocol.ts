/**
 * Long-poll SSE (body finito). Streams longos no Railway/HTTP/2 geram
 * ERR_HTTP2_PROTOCOL_ERROR quando o edge RST o ReadableStream aberto.
 */

/** Payload de `data:` quando houve evento (client notifica listeners). */
export const SSE_PING_DATA = 'ping'

/** Payload de `data:` quando o hold expirou sem evento (client reconecta limpo). */
export const SSE_IDLE_DATA = 'idle'

/**
 * Hold máximo do long-poll. Abaixo de idle cuts típicos de proxy (~60s+)
 * e bem abaixo do teto de request do Railway.
 */
export const SSE_LONG_POLL_MS = 25_000
