'use client'

import { useSyncExternalStore } from 'react'

function inscrever(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/**
 * Conectividade do navegador (`navigator.onLine`) como estado reativo.
 *
 * No servidor devolve `true`: o HTML sai no estado normal e não pisca um aviso
 * de "offline" para quem está online — o caso comum. Quem estiver offline de
 * verdade vê o aviso logo no primeiro render pós-hidratação.
 *
 * Substitui `useState` + `useEffect(() => setOnline(navigator.onLine))`, que é
 * setState síncrono em efeito.
 *
 * Aviso: `onLine` só diz que existe interface de rede — não garante internet.
 * Para saber se o servidor responde, continue tratando a falha da requisição.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    inscrever,
    () => navigator.onLine,
    () => true,
  )
}
