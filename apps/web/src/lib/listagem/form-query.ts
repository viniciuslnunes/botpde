import { PARAM_BUSCA, PARAM_PAGINA } from './spec'

/**
 * Serialização do `<form method="GET">` das listagens. Pura de propósito:
 * o client (`ListagemForm`) e os testes usam a mesma regra, e o debounce
 * precisa aplicar o valor do evento — o FormData ainda pode ter o valor
 * anterior quando o campo é controlado e o timer dispara no mesmo tick.
 */

/**
 * Busca e offset de página são consulta pontual, não "visão" da lista.
 * Entrar de novo em Torcedores não pode ressuscitar `?q=Fulano` gravado
 * da última procura — o snapshot guarda filtro, ordenação e tamanho de página.
 */
const PARAMS_EFEMEROS_SNAPSHOT: ReadonlySet<string> = new Set([
  PARAM_BUSCA,
  PARAM_PAGINA,
])

/**
 * Monta a query string a partir do form, omitindo vazio.
 * `override` ganha de `FormData` na mesma chave (o valor que o usuário
 * acabou de digitar/apagar).
 */
export function serializarQueryFormListagem(
  dados: FormData,
  override: Record<string, string> = {},
): string {
  const search = new URLSearchParams()
  const vistos = new Set<string>()

  for (const [chave, valor] of dados.entries()) {
    if (typeof valor !== 'string') continue
    vistos.add(chave)
    const bruto = Object.prototype.hasOwnProperty.call(override, chave)
      ? override[chave]!
      : valor
    const limpo = bruto.trim()
    if (!limpo) continue
    search.set(chave, limpo)
  }

  for (const [chave, valor] of Object.entries(override)) {
    if (vistos.has(chave)) continue
    const limpo = valor.trim()
    if (!limpo) continue
    search.set(chave, limpo)
  }

  return search.toString()
}

/** Query da janela, na mesma serialização do form (`URLSearchParams#toString`). */
export function queryDaJanela(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).toString()
}

const SKIP_RESTORE_PREFIX = 'torcida:listagem:skip-restore:'

/**
 * Marca que o usuário esvaziou a busca nesta listagem. O snapshot persistido
 * não pode voltar a aplicar `q` se o client component remontar no replace
 * para a URL nua.
 */
export function marcarSkipRestoreListagem(basePath: string) {
  try {
    sessionStorage.setItem(`${SKIP_RESTORE_PREFIX}${basePath}`, '1')
  } catch {
    // persistência é conveniência
  }
}

export function temSkipRestoreListagem(basePath: string): boolean {
  try {
    return sessionStorage.getItem(`${SKIP_RESTORE_PREFIX}${basePath}`) === '1'
  } catch {
    return false
  }
}

export function limparSkipRestoreListagem(basePath: string) {
  try {
    sessionStorage.removeItem(`${SKIP_RESTORE_PREFIX}${basePath}`)
  } catch {
    // idem
  }
}

function valorContrato(params: URLSearchParams, nome: string): string | null {
  const valor = params.get(nome)
  if (valor === null) return null
  const limpo = valor.trim()
  return limpo.length > 0 ? limpo : null
}

/** Params do contrato presentes na URL (inclui busca) — a URL ganha do snapshot. */
export function urlTemParamContrato(
  atuais: URLSearchParams,
  paramsDoContrato: readonly string[],
): boolean {
  return paramsDoContrato.some((nome) => valorContrato(atuais, nome) !== null)
}

/**
 * Recorte persistível da URL: contrato menos busca e página.
 * Snapshot velho que ainda tem `q` sai limpo daqui — aplicar não reintroduz o termo.
 */
export function snapshotContratoListagem(
  atuais: URLSearchParams,
  paramsDoContrato: readonly string[],
): URLSearchParams {
  const out = new URLSearchParams()
  for (const nome of paramsDoContrato) {
    if (PARAMS_EFEMEROS_SNAPSHOT.has(nome)) continue
    const valor = valorContrato(atuais, nome)
    if (valor === null) continue
    out.set(nome, valor)
  }
  return out
}

/** Mescla o snapshot na URL atual, ignorando busca/página mesmo se o storage antigo as tiver. */
export function aplicarSnapshotListagem(
  atuais: URLSearchParams,
  salvo: string,
  paramsDoContrato: readonly string[],
): URLSearchParams {
  const destino = new URLSearchParams(atuais.toString())
  const snapshot = snapshotContratoListagem(new URLSearchParams(salvo), paramsDoContrato)
  for (const [nome, valor] of snapshot.entries()) {
    destino.set(nome, valor)
  }
  return destino
}
