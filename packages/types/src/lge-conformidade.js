/**
 * Conformidade LGE na Diretoria — regras puras sobre completude do cadastro.
 */

/**
 * @typedef {{
 *   userId: string
 *   nome: string
 *   tipo: string
 *   cpf?: string | null
 *   rg?: string | null
 *   dataNascimento?: string | Date | null
 *   logradouro?: string | null
 *   bairro?: string | null
 *   cep?: string | null
 *   uf?: string | null
 *   termoResponsabilidadeAceitoEm?: Date | string | null
 *   imagemProva?: string | null
 *   responsavelNome?: string | null
 *   responsavelDocumento?: string | null
 *   autorizacaoMenorAceitaEm?: Date | string | null
 *   fotoDocumentoUrl?: string | null
 *   comprovanteResidenciaUrl?: string | null
 *   dataExpedicaoCarteirinha?: Date | string | null
 *   idade?: number | null
 *   numeroAssociado?: string | null
 * }} MembroLgeResumo
 */

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function preenchido(v) {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (v instanceof Date) return !Number.isNaN(v.getTime())
  return true
}

/**
 * @param {MembroLgeResumo} m
 * @returns {boolean}
 */
function socioPrimeiraAssociacao(m) {
  return !preenchido(m.imagemProva) && !preenchido(m.dataExpedicaoCarteirinha)
}

/**
 * @param {MembroLgeResumo} m
 * @returns {boolean}
 */
function ehMenor(m) {
  return (
    (typeof m.idade === 'number' && m.idade < 18) ||
    preenchido(m.responsavelNome) ||
    preenchido(m.autorizacaoMenorAceitaEm)
  )
}

/**
 * @param {MembroLgeResumo} m
 * @returns {string[]} ids dos itens LGE pendentes
 */
export function pendenciasLgeMembro(m) {
  if (m.tipo !== 'SOCIO') return []
  /** @type {string[]} */
  const out = []
  if (!preenchido(m.cpf)) out.push('cpf')
  if (!preenchido(m.rg)) out.push('rg')
  if (!preenchido(m.dataNascimento)) out.push('nascimento')
  if (!preenchido(m.logradouro)) out.push('logradouro')
  if (!preenchido(m.bairro)) out.push('bairro')
  if (!preenchido(m.cep)) out.push('cep')
  if (!preenchido(m.uf)) out.push('uf')
  if (!preenchido(m.termoResponsabilidadeAceitoEm)) out.push('termo')
  if (ehMenor(m)) {
    if (!preenchido(m.responsavelNome)) out.push('resp-nome')
    if (!preenchido(m.responsavelDocumento)) out.push('resp-doc')
  }
  const primeira = socioPrimeiraAssociacao(m)
  if (!primeira) {
    if (!preenchido(m.fotoDocumentoUrl)) out.push('documento')
    if (!preenchido(m.comprovanteResidenciaUrl)) out.push('residencia')
  }
  return out
}

/**
 * @param {MembroLgeResumo[]} membros
 * @returns {{ total: number, incompletos: number, semCpf: number, semRg: number }}
 */
export function resumirConformidadeLge(membros) {
  let incompletos = 0
  let semCpf = 0
  let semRg = 0
  const socios = membros.filter((m) => m.tipo === 'SOCIO')
  for (const m of socios) {
    const pend = pendenciasLgeMembro(m)
    if (pend.length > 0) incompletos += 1
    if (!preenchido(m.cpf)) semCpf += 1
    if (!preenchido(m.rg)) semRg += 1
  }
  return { total: socios.length, incompletos, semCpf, semRg }
}
