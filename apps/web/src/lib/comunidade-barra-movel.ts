/**
 * Ordem da zona móvel da barra da Comunidade (após Nacional / torcida / unidade).
 * Mistura canais de tenant (operador) e conversas visitadas (temáticos) numa
 * única sequência — drag livre entre os dois tipos.
 */

export type BarraMovelKind = 'operador' | 'tematico'

export type BarraMovelEntry = {
  kind: BarraMovelKind
  /** Slug do tenant (operador) ou id da Conversa (temático). */
  id: string
}

const PREFIXO_OPERADOR = 'o:'
const PREFIXO_TEMATICO = 't:'

export function chaveBarraOperador(slug: string): string {
  return `${PREFIXO_OPERADOR}${slug.trim()}`
}

export function chaveBarraTematico(canalId: string): string {
  return `${PREFIXO_TEMATICO}${canalId.trim()}`
}

export function parseChaveBarraMovel(chave: string): BarraMovelEntry | null {
  const limpo = chave.trim()
  if (limpo.startsWith(PREFIXO_OPERADOR)) {
    const id = limpo.slice(PREFIXO_OPERADOR.length)
    return id ? { kind: 'operador', id } : null
  }
  if (limpo.startsWith(PREFIXO_TEMATICO)) {
    const id = limpo.slice(PREFIXO_TEMATICO.length)
    return id ? { kind: 'tematico', id } : null
  }
  return null
}

export function serializarChaveBarraMovel(entry: BarraMovelEntry): string {
  return entry.kind === 'operador' ? chaveBarraOperador(entry.id) : chaveBarraTematico(entry.id)
}

/**
 * Une cookie salvo + conjuntos abertos: mantém ordem conhecida, descarta órfãos,
 * anexa novidades ao fim (extras operador, depois temáticos — legado).
 */
export function sincronizarOrdemBarraMovel(opts: {
  salva: string[]
  slugsOperador: string[]
  idsTematicos: string[]
}): string[] {
  const validas = new Set<string>([
    ...opts.slugsOperador.map(chaveBarraOperador),
    ...opts.idsTematicos.map(chaveBarraTematico),
  ])

  const kept: string[] = []
  const seen = new Set<string>()
  for (const raw of opts.salva) {
    const chave = raw.trim()
    if (!chave || !validas.has(chave) || seen.has(chave)) continue
    seen.add(chave)
    kept.push(chave)
  }

  // Legado sem cookie: operador extras, depois temáticos.
  for (const slug of opts.slugsOperador) {
    const chave = chaveBarraOperador(slug)
    if (seen.has(chave)) continue
    seen.add(chave)
    kept.push(chave)
  }
  for (const id of opts.idsTematicos) {
    const chave = chaveBarraTematico(id)
    if (seen.has(chave)) continue
    seen.add(chave)
    kept.push(chave)
  }

  return kept
}

/** Drag entre duas chaves da zona móvel. */
export function moverChaveBarraMovel(
  ordem: string[],
  fromKey: string,
  toKey: string,
): string[] {
  if (fromKey === toKey) return [...ordem]
  const from = ordem.indexOf(fromKey)
  const to = ordem.indexOf(toKey)
  if (from < 0 || to < 0) return [...ordem]
  const next = [...ordem]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Valida proposta de reorder: mesma multiset que `atuais` (após filtrar
 * desconhecidos da proposta). Permite subconjunto → completa com o resto
 * na ordem anterior (ids só na UI).
 */
export function reordenarBarraMovel(
  atuais: string[],
  novaOrdem: string[],
): string[] | null {
  if (atuais.length === 0) return []

  const setAtual = new Set(atuais)
  if (setAtual.size !== atuais.length) return null

  const desejada: string[] = []
  const vistos = new Set<string>()
  for (const raw of novaOrdem) {
    const chave = raw.trim()
    if (!setAtual.has(chave)) continue
    if (vistos.has(chave)) return null
    vistos.add(chave)
    desejada.push(chave)
  }

  if (desejada.length === 0) return [...atuais]
  if (desejada.length === atuais.length) return desejada

  const movidos = new Set(desejada)
  const resultado: string[] = []
  let i = 0
  for (const chave of atuais) {
    if (!movidos.has(chave)) {
      resultado.push(chave)
    } else {
      resultado.push(desejada[i++]!)
    }
  }
  return resultado
}
