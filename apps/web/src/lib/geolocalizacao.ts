'use client'

/**
 * Coordenada do aparelho — **best effort, nunca bloqueante**.
 *
 * Nunca rejeita e nunca fica pendurada: permissão negada, GPS frio, navegador
 * sem suporte e estouro do prazo devolvem `null` do mesmo jeito. Quem chama
 * segue o fluxo sem coordenada.
 *
 * O motivo é a porta do ônibus: a leitura serve para dar contexto ao gestor,
 * então esperar 20s pelo satélite (ou travar em quem negou a permissão) custa
 * muito mais do que a informação vale.
 */
export async function obterCoordenadaBestEffort(
  timeoutMs = 4000,
): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null

  return new Promise((resolve) => {
    let resolvido = false
    const encerrar = (valor: { lat: number; lng: number } | null) => {
      if (resolvido) return
      resolvido = true
      resolve(valor)
    }

    // Rede de segurança própria: em alguns navegadores o callback de erro
    // simplesmente não chega quando a permissão fica pendente numa aba de fundo.
    const id = window.setTimeout(() => encerrar(null), timeoutMs)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(id)
        encerrar({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        window.clearTimeout(id)
        encerrar(null)
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}
