/**
 * Thread de comentários/respostas: um item aponta para outro via `parentId`.
 * Vários autores podem responder o mesmo item; a árvore não corta no 1º nível.
 * Comentário cujo pai sumiu (oculto/apagado) sobe para a raiz, senão some da lista.
 *
 * Visual (Meu Timão): respostas ficam num bloco único sob a raiz — `achatarRespostasDaArvore`
 * — sem escada de indentação. O `parentId` continua apontando para quem foi respondido.
 */

export type ComentarioComPai = {
  id: string
  parentId: string | null
}

export type NoComentario<T extends ComentarioComPai> = {
  comentario: T
  respostas: NoComentario<T>[]
}

export function montarArvoreComentarios<T extends ComentarioComPai>(
  itens: T[],
): NoComentario<T>[] {
  const ids = new Set(itens.map((c) => c.id))
  const porPai = new Map<string | null, T[]>()
  for (const c of itens) {
    const paiVisivel = c.parentId && ids.has(c.parentId) ? c.parentId : null
    const lista = porPai.get(paiVisivel) ?? []
    lista.push(c)
    porPai.set(paiVisivel, lista)
  }

  function filhos(paiId: string | null): NoComentario<T>[] {
    return (porPai.get(paiId) ?? []).map((c) => ({
      comentario: c,
      respostas: filhos(c.id),
    }))
  }

  return filhos(null)
}

/** Total de respostas sob o nó (todos os níveis). */
export function contarRespostasNaArvore<T extends ComentarioComPai>(no: NoComentario<T>): number {
  let n = 0
  for (const f of no.respostas) {
    n += 1 + contarRespostasNaArvore(f)
  }
  return n
}

/**
 * Descendentes em ordem de leitura (irmãos na ordem da árvore, profundidade primeiro).
 * A UI mostra tudo no mesmo nível visual sob a raiz.
 */
export function achatarRespostasDaArvore<T extends ComentarioComPai>(no: NoComentario<T>): T[] {
  const out: T[] = []
  function walk(n: NoComentario<T>) {
    for (const f of n.respostas) {
      out.push(f.comentario)
      walk(f)
    }
  }
  walk(no)
  return out
}
