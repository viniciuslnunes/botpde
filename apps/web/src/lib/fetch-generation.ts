/**
 * Gera um contador para descartar respostas HTTP atrasadas.
 *
 * Dois fetches em paralelo (poll + SSE) sem isso: o mais lento sobrescreve o
 * mais novo e o sino volta ao estado velho.
 */
export type FetchGeneration = {
  next: () => number
  isCurrent: (gen: number) => boolean
}

export function createFetchGeneration(): FetchGeneration {
  let generation = 0
  return {
    next() {
      generation += 1
      return generation
    },
    isCurrent(gen: number) {
      return gen === generation
    },
  }
}
