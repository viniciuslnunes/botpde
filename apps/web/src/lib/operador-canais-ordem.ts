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

/**
 * Prefixo fixo da barra do operador (após Nacional):
 * torcida e, se houver vínculo/unidade distinta, a unidade.
 */
export function slugsHierarquiaFixos(opts: {
  slugTorcida: string | null | undefined
  slugUnidade: string | null | undefined
  temTorcida: boolean
  temUnidade: boolean
}): string[] {
  const out: string[] = []
  const torcida = opts.slugTorcida?.trim() || ''
  const unidade = opts.slugUnidade?.trim() || ''
  if (opts.temTorcida && torcida) out.push(torcida)
  if (opts.temUnidade && unidade && unidade !== torcida) out.push(unidade)
  return out
}

/** Canais do cookie que podem ser arrastados/fechados (fora da hierarquia). */
export function ordemArrastavelSemFixos(ordem: string[], fixos: string[]): string[] {
  if (fixos.length === 0) return [...ordem]
  const set = new Set(fixos)
  return ordem.filter((slug) => !set.has(slug))
}

/**
 * Reaplica a ordem dos arrastáveis mantendo os fixos (que existirem no cookie)
 * no início, na ordem canônica da hierarquia.
 */
export function aplicarOrdemArrastavel(
  atuais: string[],
  novaOrdemArrastaveis: string[],
  fixos: string[],
): string[] | null {
  const arrastaveisAtuais = ordemArrastavelSemFixos(atuais, fixos)
  const permutacao = reordenarCanaisOperador(arrastaveisAtuais, novaOrdemArrastaveis)
  if (!permutacao) return null
  const fixosNoCookie = fixos.filter((slug) => atuais.includes(slug))
  return [...fixosNoCookie, ...permutacao]
}

/**
 * Drag entre dois slugs da zona móvel — fixos no cookie ficam intactos no prefixo.
 */
export function moverSlugArrastavel(
  ordem: string[],
  fromKey: string,
  toKey: string,
  fixos: string[],
): string[] {
  if (fromKey === toKey) return [...ordem]
  const fixosSet = new Set(fixos)
  if (fixosSet.has(fromKey) || fixosSet.has(toKey)) return [...ordem]
  const arrastaveis = ordemArrastavelSemFixos(ordem, fixos)
  const from = arrastaveis.indexOf(fromKey)
  const to = arrastaveis.indexOf(toKey)
  if (from < 0 || to < 0) return [...ordem]
  const nextArr = moverItem(arrastaveis, from, to)
  const fixosNoCookie = fixos.filter((slug) => ordem.includes(slug))
  return [...fixosNoCookie, ...nextArr]
}
