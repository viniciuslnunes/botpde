/** Ordem da barra de canais do modo operador (cookie `operador_canais_abertos`). */

export const MAX_CANAIS_OPERADOR = 8

/**
 * Abre um canal mantendo a ordem existente.
 * Já aberto → permanece na mesma posição (sem MRU).
 * Novo → vai ao fim; se estourar o teto, remove o mais antigo (esquerda).
 */
export function abrirCanalNaOrdem(
  atuais: string[],
  slug: string,
  max = MAX_CANAIS_OPERADOR,
): string[] {
  const limpo = slug.trim()
  if (!limpo) return [...atuais]
  if (atuais.includes(limpo)) return [...atuais]
  const next = [...atuais, limpo]
  if (next.length <= max) return next
  return next.slice(next.length - max)
}

/**
 * Nova ordem manual (drag). Aceita só permutação dos slugs atuais —
 * ignora extras e rejeita se faltar algum (retorna `null`).
 */
export function reordenarCanaisOperador(
  atuais: string[],
  novaOrdem: string[],
): string[] | null {
  if (novaOrdem.length !== atuais.length) return null
  const setAtual = new Set(atuais)
  if (setAtual.size !== atuais.length) return null
  const vistos = new Set<string>()
  for (const slug of novaOrdem) {
    if (!setAtual.has(slug) || vistos.has(slug)) return null
    vistos.add(slug)
  }
  return [...novaOrdem]
}

/** Move `from` → `to` (índices) em uma lista imutável. */
export function moverItem<T>(lista: T[], from: number, to: number): T[] {
  if (from === to) return [...lista]
  if (from < 0 || to < 0 || from >= lista.length || to >= lista.length) return [...lista]
  const next = [...lista]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
