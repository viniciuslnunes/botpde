'use client'

import { useInsertionEffect, useRef, type RefObject } from 'react'

/**
 * Ref que sempre carrega o valor mais recente, sem escrever durante o render.
 *
 * O idioma antigo (`const ref = useRef(v); ref.current = v` no corpo do
 * componente) é escrita em render: quebra com render concorrente (um render
 * descartado já teria sujado a ref) e o React Compiler acusa
 * `react-hooks/refs`.
 *
 * A escrita vai para `useInsertionEffect`, que roda **antes** dos layout
 * effects, dos effects e de qualquer handler de evento. Ou seja: quem lê a ref
 * de dentro de effect, handler, timer ou callback assíncrono continua vendo o
 * valor daquele render — mesmo comportamento de antes.
 *
 * O que NÃO cobre: leitura durante o render (aí o valor ainda é o do render
 * anterior). Se precisar do valor no render, use o valor direto, não a ref.
 * Para ref que guarda só um callback chamado de dentro de effect, prefira
 * `useEffectEvent`.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useInsertionEffect(() => {
    ref.current = value
  })
  return ref
}
