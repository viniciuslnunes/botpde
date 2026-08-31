/**
 * Regras do fluxo Associe-se (vitrine pública → ficha de sócio).
 *
 * Entrar no canal como TORCEDOR continua sendo só pelo convite.
 * Associação (SOCIO) é no máximo uma torcida por pessoa; upgrade
 * torcedor→sócio na mesma worktree é permitido.
 */

/**
 * Vínculo canônico que conta como "já tem torcida".
 * Espelho Caso B e desligados não entram.
 *
 * @param {{
 *   tipo?: string | null
 *   status?: string | null
 *   espelhado?: boolean | null
 *   desligadoEm?: Date | string | null
 * } | null | undefined} membro
 */
export function vinculoContaComoAssociacao(membro) {
  if (!membro) return false
  if (membro.espelhado) return false
  if (membro.desligadoEm) return false
  if (membro.status !== 'APROVADO' && membro.status !== 'PENDENTE') return false
  return membro.tipo === 'SOCIO' || membro.tipo === 'TORCEDOR'
}

/**
 * Torcida aparece na vitrine pública do Associe-se.
 *
 * @param {{
 *   ativo?: boolean | null
 *   sintetico?: boolean | null
 *   temLideranca?: boolean | null
 *   canalRestrito?: boolean | null
 * }} opts
 */
export function torcidaElegivelVitrine(opts) {
  return Boolean(
    opts.ativo && !opts.sintetico && opts.temLideranca && !opts.canalRestrito,
  )
}

/**
 * Pode pedir SOCIO neste destino?
 *
 * @param {string} destinoRaizId tenant raiz da worktree alvo
 * @param {Array<{
 *   raizId: string
 *   tipo?: string | null
 *   status?: string | null
 *   espelhado?: boolean | null
 *   desligadoEm?: Date | string | null
 * }>} vinculos
 * @returns {{ ok: true, upgrade?: boolean } | { ok: false, motivo: 'outra_torcida' | 'ja_socio' | 'pendente' }}
 */
export function avaliarAssociacaoNaTorcida(destinoRaizId, vinculos) {
  const relevantes = (vinculos ?? []).filter(vinculoContaComoAssociacao)
  if (relevantes.length === 0) return { ok: true }

  const outra = relevantes.some((v) => v.raizId !== destinoRaizId)
  if (outra) return { ok: false, motivo: 'outra_torcida' }

  const socioAprovado = relevantes.find((v) => v.tipo === 'SOCIO' && v.status === 'APROVADO')
  if (socioAprovado) return { ok: false, motivo: 'ja_socio' }

  const socioPendente = relevantes.find((v) => v.tipo === 'SOCIO' && v.status === 'PENDENTE')
  if (socioPendente) return { ok: false, motivo: 'pendente' }

  return { ok: true, upgrade: true }
}

/**
 * CTA da top bar a partir dos vínculos canônicos da pessoa.
 *
 * @param {Array<{
 *   raizId: string
 *   tipo?: string | null
 *   status?: string | null
 *   espelhado?: boolean | null
 *   desligadoEm?: Date | string | null
 * }>} vinculos
 * @returns {{
 *   mostrar: boolean
 *   modo: 'descobrir' | 'upgrade' | 'pendente' | 'oculto'
 *   raizId: string | null
 * }}
 */
export function estadoCtaAssocieSe(vinculos) {
  const relevantes = (vinculos ?? []).filter(vinculoContaComoAssociacao)
  if (relevantes.length === 0) {
    return { mostrar: true, modo: 'descobrir', raizId: null }
  }

  const socioAprovado = relevantes.find((v) => v.tipo === 'SOCIO' && v.status === 'APROVADO')
  if (socioAprovado) {
    return { mostrar: false, modo: 'oculto', raizId: socioAprovado.raizId }
  }

  const socioPendente = relevantes.find((v) => v.tipo === 'SOCIO' && v.status === 'PENDENTE')
  if (socioPendente) {
    return { mostrar: true, modo: 'pendente', raizId: socioPendente.raizId }
  }

  return { mostrar: true, modo: 'upgrade', raizId: relevantes[0]?.raizId ?? null }
}

/**
 * `PerfilTorcedor.regiao` gravado como `"São Paulo - SP"`.
 *
 * @param {string | null | undefined} regiao
 * @returns {{ cidade: string, uf: string }}
 */
export function parseRegiaoOnboarding(regiao) {
  if (!regiao || typeof regiao !== 'string') return { cidade: '', uf: '' }
  const trimmed = regiao.trim()
  const comUf = trimmed.match(/^(.*?)\s*[-–—]\s*([A-Za-z]{2})$/)
  if (comUf) return { cidade: comUf[1].trim(), uf: comUf[2].toUpperCase() }
  if (/^[A-Za-z]{2}$/.test(trimmed)) return { cidade: '', uf: trimmed.toUpperCase() }
  return { cidade: trimmed, uf: '' }
}

export const MENSAGEM_BLOQUEIO_ASSOCIACAO = Object.freeze({
  outra_torcida:
    'Você já está vinculado a outra torcida. Por aqui dá para ver o mapa, mas não entrar em um segundo canal.',
  ja_socio: 'Você já é sócio desta torcida.',
  pendente: 'Sua solicitação de associação já está em análise nesta torcida.',
  sem_lideranca:
    'Esta torcida ainda não tem presidente associado. A associação abre quando a liderança estiver no portal.',
  clube_errado:
    'Associação só nas organizadas do clube que você escolheu no onboarding.',
})

/**
 * Toast ao clicar numa unidade sem liderança no portal.
 * Subsede/PDE pode ter liderança própria — o aviso é da unidade, não da torcida.
 *
 * @param {'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO' | string | null | undefined} tipo
 */
export function mensagemSemLiderancaUnidade(tipo) {
  if (tipo === 'SUBSEDE') {
    return 'Esta subsede está sem liderança. A associação abre quando a liderança estiver no portal.'
  }
  if (tipo === 'PONTO_ENCONTRO') {
    return 'Este ponto de encontro está sem liderança. A associação abre quando a liderança estiver no portal.'
  }
  return MENSAGEM_BLOQUEIO_ASSOCIACAO.sem_lideranca
}
