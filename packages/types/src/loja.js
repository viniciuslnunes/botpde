/**
 * Regras de negócio da loja (cupom, estoque, tamanhos).
 * Testável sem dependência de Prisma/Next.
 */

export const TAMANHO_UNICO = 'UN'

const ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'G1', 'G2', 'G3', 'G4', 'G5']

/** Ordena tamanhos para exibição (ex.: filtros); ignora UN. */
export function ordenarTamanhos(tamanhos) {
  const uniq = [...new Set((tamanhos ?? []).filter((t) => t && t !== TAMANHO_UNICO))]
  return uniq.sort((a, b) => {
    const ia = ORDEM_TAMANHOS.indexOf(a)
    const ib = ORDEM_TAMANHOS.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    const na = Number(a)
    const nb = Number(b)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return a.localeCompare(b, 'pt-BR')
  })
}

/** Normaliza tamanho para chave de estoque/carrinho. */
export function chaveTamanho(tamanho) {
  const t = (tamanho ?? '').trim()
  return t || TAMANHO_UNICO
}

/** Exibe tamanho ao usuário (UN → sem rótulo). */
export function rotuloTamanho(tamanho) {
  const chave = chaveTamanho(tamanho)
  return chave === TAMANHO_UNICO ? null : chave
}

export function estoqueTotal(estoque) {
  const e = estoque ?? {}
  return Object.values(e).reduce((a, b) => a + (Number(b) || 0), 0)
}

export function percentualDesconto(precoOriginal, preco) {
  const orig = Number(precoOriginal)
  const atual = Number(preco)
  if (!orig || orig <= atual) return 0
  return Math.round(((orig - atual) / orig) * 100)
}

/**
 * @param {{ tipo: 'PERCENTUAL' | 'FIXO', valor: number | string, primeiraCompra?: boolean, ativo?: boolean, validoAte?: Date | null }} cupom
 * @param {{ subtotal: number, userJaComprou: boolean, agora?: Date }} ctx
 */
export function validarCupom(cupom, ctx) {
  const agora = ctx.agora ?? new Date()
  if (!cupom?.ativo) return { ok: false, erro: 'Cupom inválido ou inativo.' }
  if (cupom.validoAte && new Date(cupom.validoAte) < agora) {
    return { ok: false, erro: 'Cupom expirado.' }
  }
  if (cupom.primeiraCompra && ctx.userJaComprou) {
    return { ok: false, erro: 'Cupom válido apenas na primeira compra.' }
  }
  return { ok: true }
}

/**
 * @param {{ tipo: 'PERCENTUAL' | 'FIXO', valor: number | string }} cupom
 * @param {number} subtotal
 */
export function calcularDesconto(cupom, subtotal) {
  const valor = Number(cupom.valor)
  if (cupom.tipo === 'PERCENTUAL') {
    return Math.min(subtotal, Math.round((subtotal * valor) / 100 * 100) / 100)
  }
  return Math.min(subtotal, valor)
}

export function parseTamanhosCsv(raw) {
  if (!raw?.trim()) return []
  return raw.split(',').map((t) => t.trim()).filter(Boolean)
}

export function slugify(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
