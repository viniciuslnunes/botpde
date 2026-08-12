'use client'

import { useSyncExternalStore } from 'react'

/** Nunca muda depois da hidratação — não há o que assinar. */
const semInscricao = () => () => {}

/**
 * `false` no HTML do servidor e no primeiro render do cliente; `true` depois de
 * hidratar. Use para conteúdo que só existe no browser (portal, medida de
 * viewport, API de janela) sem divergência de hidratação.
 *
 * Substitui o idioma `useState(false)` + `useEffect(() => setMounted(true), [])`,
 * que é setState síncrono dentro de efeito (`react-hooks/set-state-in-effect`)
 * e força um segundo render logo após montar. Aqui o React já entrega o valor
 * certo no render pós-hidratação.
 *
 * Não substitui o `setTimeout(…, 0)` de alguns componentes: lá o atraso é
 * proposital (esperar o layout/portal antes de animar), não hidratação.
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    semInscricao,
    () => true,
    () => false,
  )
}
