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
 * Nova ordem manual (drag). A barra pode mandar um **subconjunto** do cookie:
 * - canais da worktree omitidos na UI (`excluirTenantIds`)
 * - canal atual só na barra (ainda sem cookie)
 *
 * Ids desconhecidos são ignorados; slots do cookie fora do subconjunto
 * (ex.: lineage filtrada) mantêm a posição relativa. Retorna `null` só se
 * o cookie estiver corrompido (duplicata) ou a proposta tiver duplicata.
 */
export function reordenarCanaisOperador(
  atuais: string[],
  novaOrdem: string[],
): string[] | null {
  if (atuais.length === 0) return []

  const setAtual = new Set(atuais)
  if (setAtual.size !== atuais.length) return null

  const desejada: string[] = []
  const vistos = new Set<string>()
  for (const slug of novaOrdem) {
    if (!setAtual.has(slug)) continue
    if (vistos.has(slug)) return null
    vistos.add(slug)
    desejada.push(slug)
  }

  if (desejada.length === 0) return [...atuais]

  if (desejada.length === atuais.length) return desejada

  const movidos = new Set(desejada)
  const resultado: string[] = []
  let i = 0
  for (const slug of atuais) {
    if (!movidos.has(slug)) {
      resultado.push(slug)
    } else {
      resultado.push(desejada[i++]!)
    }
  }
  return resultado
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

/**
 * Unidade entra no prefixo fixo (sem X) da barra multi-canal?
 *
 * Sócio comum: sim, quando há escopo unidade — é a aba "Minha unidade".
 *
 * Super-admin: só quando o tenant ativo **é** essa unidade. Caso contrário o
 * vínculo residual (`SaasMembro` com `sedeId` de SUBSEDE/PDE, ainda APROVADO
 * depois de `removerLideranca`) trava a 3ª aba em Gaviões sem poder fechar —
 * e ela "volta" ao sair do PDE, onde a mesma unidade era só extra do cookie
 * (4ª posição, fechável).
 */
export function temUnidadeFixaOperador(opts: {
  superAdmin: boolean
  temEscopoUnidade: boolean
  slugUnidade: string | null | undefined
  atualSlug: string | null | undefined
}): boolean {
  const unidade = opts.slugUnidade?.trim() || ''
  if (!opts.temEscopoUnidade || !unidade) return false
  if (!opts.superAdmin) return true
  const atual = opts.atualSlug?.trim() || ''
  return atual === unidade
}

/**
 * Conversa ids que NÃO entram na barra 4+ (já cobertos pelas abas fixas).
 *
 * - Canal oficial da Sede (aba torcida): sempre fixo.
 * - Canal da unidade do vínculo: só quando a aba unidade está fixa
 *   (`temUnidadeFixaOperador`). Super-admin na Sede com vínculo residual
 *   (ex.: Rio Claro) deve poder abrir essa unidade como 4+ fechável —
 *   senão o mural abre e a aba some.
 */
export function idsCanaisHierarquiaFixosNaBarra(opts: {
  canalIdTorcida: string | null | undefined
  canalIdUnidade: string | null | undefined
  superAdmin: boolean
  temEscopoUnidade: boolean
  slugUnidade: string | null | undefined
  atualSlug: string | null | undefined
}): string[] {
  const ids: string[] = []
  const sede = opts.canalIdTorcida?.trim() || ''
  if (sede) ids.push(sede)
  const unidade = opts.canalIdUnidade?.trim() || ''
  if (
    unidade &&
    temUnidadeFixaOperador({
      superAdmin: opts.superAdmin,
      temEscopoUnidade: opts.temEscopoUnidade,
      slugUnidade: opts.slugUnidade,
      atualSlug: opts.atualSlug,
    })
  ) {
    ids.push(unidade)
  }
  return ids
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
