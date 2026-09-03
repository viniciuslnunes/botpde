/**
 * Extração do dado de um payload de QR — **sem verificar assinatura**.
 *
 * Módulo client-safe de propósito: `qr-token.ts` é `server-only` porque
 * verificar exige o `AUTH_SECRET`, que nunca vai ao browser. Aqui só se separa
 * `dados` de `assinatura`.
 *
 * **Quando isto é suficiente, e quando não é.** Verificar existe para impedir
 * que um payload forjado *autorize* algo. Há usos em que o QR não autoriza
 * nada — é atalho para digitar. O caso concreto: o PDV do bar já tem todas as
 * comandas abertas da unidade na tela; escanear só escolhe uma delas. Um QR
 * falso ali, no pior caso, seleciona uma comanda que o operador já podia
 * selecionar no `<select>` ao lado. Nada é liberado, então nada precisa ser
 * verificado, e a leitura fica instantânea e offline.
 *
 * Se a leitura **decidir** alguma coisa — embarcar, entregar pedido, validar
 * carteirinha — o caminho é a action no servidor com `lerPayload`. Na dúvida,
 * verifique: esta função é a exceção, não o padrão.
 */
export function dadosDoPayloadQr(payload: string): string | null {
  const texto = payload.trim()
  if (!texto) return null

  const corte = texto.lastIndexOf('.')
  if (corte <= 0 || corte === texto.length - 1) return null

  return texto.slice(0, corte)
}

/** Aceita tanto o payload cru quanto a URL que a câmera nativa abre. */
export function dadosDoQrOuUrl(bruto: string): string | null {
  const texto = bruto.trim()
  if (!texto.includes('t=')) return dadosDoPayloadQr(texto)
  try {
    const t = new URL(texto, 'https://local.invalid').searchParams.get('t')
    return t ? dadosDoPayloadQr(t) : null
  } catch {
    return dadosDoPayloadQr(texto)
  }
}
