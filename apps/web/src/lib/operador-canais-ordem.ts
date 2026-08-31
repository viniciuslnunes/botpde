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
 * - canais já no prefixo clube→torcida→unidade (`excluirTenantIds` só desses)
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
 * Unidade no 3º slot da barra (clube → torcida → unidade).
 *
 * 1. Unidade do contexto (vínculo ou tenant ativo Caso B).
 * 2. Senão, a primeira unidade Caso B **aberta** na cookie cuja raiz é a
 *    torcida ativa — operador sem `SaasMembro` na PDE ainda vê o 3º escudo.
 */
export function slugUnidadePrefixoBarra(opts: {
  slugUnidadeContexto: string | null | undefined
  slugTorcida: string | null | undefined
  canaisAbertos: Array<{ slug: string; ehUnidade: boolean; raizId: string }>
  raizIdTorcida: string | null | undefined
}): string | null {
  const torcida = opts.slugTorcida?.trim() || ''
  const contexto = opts.slugUnidadeContexto?.trim() || ''
  if (contexto && contexto !== torcida) return contexto

  const raiz = opts.raizIdTorcida?.trim() || ''
  if (!raiz) return null
  for (const canal of opts.canaisAbertos) {
    if (!canal.ehUnidade || canal.raizId !== raiz) continue
    const slug = canal.slug.trim()
    if (slug && slug !== torcida) return slug
  }
  return null
}

/**
 * Unidade entra no prefixo fixo (sem X) da barra multi-canal?
 *
 * Hierarquia da barra é sempre clube → torcida → unidade, para sócio e
 * super-admin. Estar logado na Sede (e não na PDE) **não** esconde o 3º
 * slot — outras unidades abertas da mesma worktree ficam na zona móvel.
 *
 * `superAdmin` / `atualSlug` permanecem no contrato dos call sites; o
 * prefixo não depende mais deles.
 */
export function temUnidadeFixaOperador(opts: {
  superAdmin: boolean
  temEscopoUnidade: boolean
  slugUnidade: string | null | undefined
  atualSlug: string | null | undefined
}): boolean {
  const unidade = opts.slugUnidade?.trim() || ''
  return Boolean(opts.temEscopoUnidade && unidade)
}

/**
 * Conversa ids que NÃO entram na barra 4+ (já cobertos pelas abas fixas).
 *
 * - Canal oficial da Sede (aba torcida): sempre fixo.
 * - Canal da unidade do 3º slot: fora da 4+ enquanto a aba unidade está
 *   fixa (`temUnidadeFixaOperador`). Outras unidades da worktree continuam
 *   na zona móvel (slug ou conversa).
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
