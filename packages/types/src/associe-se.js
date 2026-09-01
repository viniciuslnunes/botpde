/**
 * Regras do fluxo Associe-se (vitrine pública → ficha de sócio) e do
 * vínculo posterior à unidade local (sócio já aprovado na torcida).
 *
 * Entrar no canal como TORCEDOR continua sendo só pelo convite.
 * Associação (SOCIO) é no máximo uma torcida por pessoa; upgrade
 * torcedor→sócio na mesma worktree é permitido.
 * Sócio APROVADO pode depois reconhecer SUBSEDE/PDE da mesma worktree
 * (`avaliarVinculoUnidade`) — torcedor não.
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
 * Sócio aprovado da torcida reconhece a unidade local depois do onboarding
 * (fluxo de canais). Torcedor não. Canal da Sede raiz não é unidade local.
 *
 * @param {{
 *   isSocioAprovadoWorktree?: boolean | null
 *   mesmaWorktree?: boolean | null
 *   canalRestrito?: boolean | null
 *   bloqueado?: boolean | null
 *   tipoUnidade?: string | null
 *   jaVinculadoNestaUnidade?: boolean | null
 *   travaAtiva?: boolean | null
 * }} opts
 * @returns {{ ok: true } | { ok: false, motivo: 'nao_socio' | 'outra_torcida' | 'canal_restrito' | 'bloqueado' | 'sede_raiz' | 'nao_unidade' | 'ja_vinculado' | 'trava' }}
 */
export function avaliarVinculoUnidade(opts) {
  const o = opts ?? {}
  if (!o.isSocioAprovadoWorktree) return { ok: false, motivo: 'nao_socio' }
  if (!o.mesmaWorktree) return { ok: false, motivo: 'outra_torcida' }
  if (o.bloqueado) return { ok: false, motivo: 'bloqueado' }
  if (o.canalRestrito) return { ok: false, motivo: 'canal_restrito' }
  if (o.tipoUnidade === 'SEDE') return { ok: false, motivo: 'sede_raiz' }
  if (o.tipoUnidade !== 'SUBSEDE' && o.tipoUnidade !== 'PONTO_ENCONTRO') {
    return { ok: false, motivo: 'nao_unidade' }
  }
  if (o.jaVinculadoNestaUnidade) return { ok: false, motivo: 'ja_vinculado' }
  if (o.travaAtiva) return { ok: false, motivo: 'trava' }
  return { ok: true }
}

/** 48h após a última mudança: ainda dá para corrigir erro. */
export const CARENCIA_CORRECAO_VINCULO_UNIDADE_MS = 48 * 60 * 60 * 1000

/** Depois da carência, 30 dias sem nova alteração self-service. */
export const TRAVA_VINCULO_UNIDADE_MS = 30 * 24 * 60 * 60 * 1000

export const MOTIVO_DESVINCULO_UNIDADE = 'DESVINCULO_UNIDADE'

export const ACOES_AUDIT_VINCULO_UNIDADE = Object.freeze([
  'MEMBRO_UNIDADE_VINCULADA',
  'MEMBRO_UNIDADE_ALTERADA',
  'MEMBRO_UNIDADE_DESVINCULADA',
])

/**
 * Primeira mudança não tem trava. Nas 48h seguintes ainda corrige.
 * Depois disso, bloqueia até completar 30 dias da última alteração.
 *
 * @param {Date | string | number | null | undefined} ultimoEm
 * @param {Date | string | number} [agora]
 * @returns {{ ok: true, emCorrecao?: boolean } | { ok: false, motivo: 'trava', liberaEm: Date }}
 */
export function avaliarTravaVinculoUnidade(ultimoEm, agora = Date.now()) {
  if (ultimoEm == null || ultimoEm === '') return { ok: true }
  const t = new Date(ultimoEm).getTime()
  if (Number.isNaN(t)) return { ok: true }
  const now = new Date(agora).getTime()
  const elapsed = now - t
  if (elapsed <= CARENCIA_CORRECAO_VINCULO_UNIDADE_MS) {
    return { ok: true, emCorrecao: true }
  }
  if (elapsed < TRAVA_VINCULO_UNIDADE_MS) {
    return { ok: false, motivo: 'trava', liberaEm: new Date(t + TRAVA_VINCULO_UNIDADE_MS) }
  }
  return { ok: true }
}

/**
 * @param {Date | string | number} liberaEm
 */
export function mensagemTravaVinculoUnidade(liberaEm) {
  const d = new Date(liberaEm)
  const data = Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return data
    ? `Você já alterou a unidade. A próxima mudança libera em ${data}.`
    : MENSAGEM_VINCULO_UNIDADE.trava
}

/**
 * Já tem origem canônica nesta unidade? Caso A (mesmo tenant da Sede) exige
 * `sedeId` igual; Caso B (tenant-filho) basta o vínculo local não-espelho.
 *
 * @param {{
 *   sedeId: string
 *   sedeTenantId: string
 *   raizTenantId: string
 *   vinculos?: Array<{
 *     tenantId?: string | null
 *     sedeId?: string | null
 *     espelhado?: boolean | null
 *   }>
 * }} opts
 */
export function isUnidadeLocalVinculo(tipo) {
  return tipo === 'SUBSEDE' || tipo === 'PONTO_ENCONTRO'
}

/**
 * Já tem casa local: origem Caso B (tenant ≠ Sede) ou Caso A com `sedeId`
 * diferente da Sede raiz. HQ não conta — senão o CTA vira «Trocar» na 1ª vez.
 *
 * @param {{
 *   raizTenantId: string
 *   hqSedeId?: string | null
 *   vinculos?: Array<{
 *     tenantId?: string | null
 *     sedeId?: string | null
 *     espelhado?: boolean | null
 *   }>
 * }} opts
 */
export function temVinculoUnidadeLocal(opts) {
  const vinculos = opts.vinculos ?? []
  const hqId = opts.hqSedeId ?? null
  return vinculos.some((v) => {
    if (v.espelhado) return false
    if (v.tenantId !== opts.raizTenantId) return true
    if (!v.sedeId || !hqId) return false
    return v.sedeId !== hqId
  })
}

/**
 * CTAs no card do canal: vincular / trocar / desvincular / trava.
 * Sede raiz nunca desvincula nem conta como casa local.
 *
 * @param {{
 *   tipoUnidade?: string | null
 *   jaNestaUnidade?: boolean | null
 *   podeVincularBase?: boolean | null
 *   travaOk?: boolean | null
 *   temUnidadeLocalAtual?: boolean | null
 *   liberaEm?: string | null
 * }} opts
 */
export function decidirFlagsVinculoUnidade(opts) {
  const o = opts ?? {}
  const neste = Boolean(isUnidadeLocalVinculo(o.tipoUnidade) && o.jaNestaUnidade)
  const baseOk = Boolean(o.podeVincularBase)
  const travaOk = o.travaOk !== false
  const liberaEm = o.liberaEm ?? null
  const acionavel = neste || baseOk
  const flag = {
    podeVincularUnidade: false,
    podeTrocarUnidade: false,
    podeDesvincularUnidade: false,
    vinculoUnidadeLiberaEm: acionavel ? liberaEm : null,
  }
  if (!travaOk) return flag
  if (neste) {
    flag.podeDesvincularUnidade = true
    return flag
  }
  if (baseOk) {
    if (o.temUnidadeLocalAtual) flag.podeTrocarUnidade = true
    else flag.podeVincularUnidade = true
  }
  return flag
}

export function jaVinculadoNestaUnidade(opts) {
  const vinculos = opts.vinculos ?? []
  return vinculos.some((v) => {
    if (v.espelhado) return false
    if (v.tenantId !== opts.sedeTenantId) return false
    if (opts.sedeTenantId === opts.raizTenantId) return v.sedeId === opts.sedeId
    return true
  })
}

export const MENSAGEM_VINCULO_UNIDADE = Object.freeze({
  nao_socio: 'Apenas sócios aprovados podem se vincular a uma unidade.',
  outra_torcida: 'Esta unidade não pertence à sua torcida.',
  canal_restrito:
    'Esta unidade está com o canal restrito. Entre pelo convite da diretoria.',
  bloqueado: 'Você não pode se vincular a esta unidade.',
  sede_raiz: 'Você já é sócio da torcida nesta Sede.',
  nao_unidade: 'Este canal não representa uma unidade local.',
  ja_vinculado: 'Você já está vinculado a esta unidade.',
  pendente: 'Sua solicitação nesta unidade ainda está em análise.',
  reprovado:
    'A diretoria desta unidade recusou um pedido anterior. Fale com eles.',
  desligado: 'Você foi desligado desta unidade. Fale com a diretoria.',
  trava: 'Você já alterou a unidade recentemente. Aguarde o prazo para mudar de novo.',
})

/** Confirm do CTA «Esta é a minha unidade» no fluxo de canais. */
export const CONFIRMA_VINCULO_UNIDADE =
  'Esta é a unidade em que você convive? Ao confirmar, você também fica vinculado a ela — além da torcida.'

/** Pedido/entrada no canal oficial: sócio sem casa local pode reconhecer a unidade. */
export const CONFIRMA_VINCULO_AO_PEDIR_CANAL =
  'Você ainda não tem unidade vinculada. Esta é a unidade em que você convive?\n\nOK — sim, vincular-se a ela.\nCancelar — só o canal.'

export const CONFIRMA_TROCA_UNIDADE =
  'Trocar de unidade? Você deixa a atual e passa a esta. Continua sócio da torcida.'

export const CONFIRMA_DESVINCULO_UNIDADE =
  'Desvincular desta unidade? Você continua sócio da torcida, mas deixa de pertencer a ela.'

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
