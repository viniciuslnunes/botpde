/**
 * Regras puras do brechó (P2P entre sócios). Sem Prisma/Next.
 */

import { labelNivelConfianca, nivelPorScore } from './confianca.js'


/** @typedef {'TROCA' | 'DOACAO' | 'VENDA'} BrechoModalidade */
/** @typedef {'CAMISA' | 'BERMUDA' | 'PATCH' | 'BANDEIRA_PESSOAL' | 'OUTRO'} BrechoCategoria */
/** @typedef {'ATIVO' | 'RESERVADO' | 'CONCLUIDO' | 'OCULTO' | 'REMOVIDO'} BrechoAnuncioStatus */
/** @typedef {'ABERTA' | 'CONCLUIDA'} BrechoTrocaStatus */

export const BRECHO_PAGE_SIZE = 48

/** @type {Readonly<Record<BrechoModalidade, { label: string, hint: string }>>} */
export const BRECHO_MODALIDADE = Object.freeze({
  TROCA: { label: 'Troca', hint: 'Diga o que você aceita em troca.' },
  DOACAO: { label: 'Doação', hint: 'Sem contrapartida — quem quiser, combina a retirada.' },
  VENDA: { label: 'Venda', hint: 'Preço pedido é informativo; o acerto é no chat, fora da plataforma.' },
})

/** @type {Readonly<Record<BrechoCategoria, { label: string, aviso?: string }>>} */
export const BRECHO_CATEGORIA = Object.freeze({
  CAMISA: { label: 'Camisa' },
  BERMUDA: { label: 'Bermuda / calção' },
  PATCH: { label: 'Patch / adesivo' },
  BANDEIRA_PESSOAL: {
    label: 'Bandeira pessoal',
    aviso:
      'Só material de uso pessoal (bandeirinha de mão, patch). Bandeirão, trapo e uniforme de jogo da torcida ficam no Patrimônio — não entram no brechó.',
  },
  OUTRO: { label: 'Outro' },
})

/** @type {Readonly<Record<BrechoAnuncioStatus, { label: string, feed: boolean }>>} */
export const BRECHO_ANUNCIO_STATUS = Object.freeze({
  ATIVO: { label: 'Ativo', feed: true },
  RESERVADO: { label: 'Reservado', feed: false },
  CONCLUIDO: { label: 'Concluído', feed: false },
  OCULTO: { label: 'Oculto', feed: false },
  REMOVIDO: { label: 'Removido', feed: false },
})

export const BRECHO_AVISO_PLATAFORMA =
  'A plataforma não intermedia pagamento nem atesta autenticidade. Combine encontro na sede; desconfie de pedido de PIX antecipado.'

/**
 * Quem entra na praça nacional: sócio aprovado na linhagem, e não
 * exclusivamente em unidade com canal restrito.
 * @param {{ socioAprovadoNaLinhaagem: boolean, soUnidadesRestritas: boolean }} input
 * @returns {{ ok: true } | { ok: false, motivo: 'nao_socio' | 'canal_restrito' }}
 */
export function podeParticiparBrecho(input) {
  if (!input?.socioAprovadoNaLinhaagem) return { ok: false, motivo: 'nao_socio' }
  if (input.soUnidadesRestritas) return { ok: false, motivo: 'canal_restrito' }
  return { ok: true }
}

/**
 * Raízes cujo catálogo entra no feed. Aliados só se o presidente ligou o flag.
 * @param {{ raizId: string, brechoAliados: boolean, raizesAliadas?: readonly string[] }} input
 * @returns {string[]}
 */
export function raizesDoFeedBrecho(input) {
  const raiz = (input?.raizId ?? '').trim()
  if (!raiz) return []
  const raizes = [raiz]
  if (!input.brechoAliados) return raizes
  const seen = new Set(raizes)
  for (const id of input.raizesAliadas ?? []) {
    const v = (id ?? '').trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    raizes.push(v)
  }
  return raizes
}

/**
 * Score 0–100. Só o servidor grava; esta função é a fórmula.
 * Contraparte única pesa mais; repetir o mesmo par conta pouco; denúncia
 * procedente e loja congelada derrubam.
 * @param {{
 *   trocasConcluidas: number
 *   contrapartesUnicas: number
 *   denunciasProcedentes?: number
 *   congelada?: boolean
 * }} input
 */
export function calcularScoreConfianca(input) {
  if (input?.congelada) return 0
  const unique = Math.max(0, Math.floor(Number(input?.contrapartesUnicas) || 0))
  const total = Math.max(0, Math.floor(Number(input?.trocasConcluidas) || 0))
  const repeats = Math.max(0, total - unique)
  const denuncias = Math.max(0, Math.floor(Number(input?.denunciasProcedentes) || 0))
  const fromUnique = Math.min(80, unique * 12)
  const fromRepeats = Math.min(15, repeats * 2)
  const bonusPrimeira = total >= 1 ? 5 : 0
  const penalty = denuncias * 20
  return Math.max(0, Math.min(100, Math.round(fromUnique + fromRepeats + bonusPrimeira - penalty)))
}

/**
 * @param {{ interessadoId: string, vendedorId: string, anuncioStatus: string, lojaAtiva: boolean, lojaCongelada: boolean }} input
 * @returns {{ ok: true } | { ok: false, erro: string }}
 */
export function podeDemonstrarInteresse(input) {
  if (!input?.interessadoId || !input?.vendedorId) {
    return { ok: false, erro: 'Participantes inválidos.' }
  }
  if (input.interessadoId === input.vendedorId) {
    return { ok: false, erro: 'Não dá para demonstrar interesse no próprio anúncio.' }
  }
  if (!input.lojaAtiva || input.lojaCongelada) {
    return { ok: false, erro: 'Esta loja não está aceitando trocas.' }
  }
  if (input.anuncioStatus !== 'ATIVO') {
    return { ok: false, erro: 'Este anúncio não está disponível.' }
  }
  return { ok: true }
}

/**
 * @param {{
 *   userId: string
 *   vendedorId: string
 *   interessadoId: string
 *   jaConfirmou: boolean
 *   anuncioStatus: string
 * }} input
 * @returns {{ ok: true } | { ok: false, erro: string }}
 */
export function podeConfirmarTroca(input) {
  if (!input?.userId) return { ok: false, erro: 'Participante inválido.' }
  if (input.vendedorId === input.interessadoId) {
    return { ok: false, erro: 'Não dá para confirmar uma troca consigo mesmo.' }
  }
  if (input.userId !== input.vendedorId && input.userId !== input.interessadoId) {
    return { ok: false, erro: 'Você não participa desta troca.' }
  }
  if (input.jaConfirmou) return { ok: false, erro: 'Você já confirmou a entrega.' }
  if (input.anuncioStatus === 'REMOVIDO' || input.anuncioStatus === 'OCULTO') {
    return { ok: false, erro: 'Este anúncio não está mais disponível.' }
  }
  return { ok: true }
}

/**
 * @param {{ vendedorConfirmouEm: Date | string | null, interessadoConfirmouEm: Date | string | null }} input
 * @returns {'aberta' | 'parcial' | 'concluida'}
 */
export function estadoConfirmacaoTroca(input) {
  const v = Boolean(input?.vendedorConfirmouEm)
  const i = Boolean(input?.interessadoConfirmouEm)
  if (v && i) return 'concluida'
  if (v || i) return 'parcial'
  return 'aberta'
}

/**
 * Claim da denúncia: só entra quem ainda não atendeu.
 * @param {{ atendenteId: string | null, status: string }} input
 * @returns {{ ok: true } | { ok: false, erro: string }}
 */
export function podeAtenderDenunciaBrecho(input) {
  if (input?.status !== 'PENDENTE') {
    return { ok: false, erro: 'Esta denúncia já foi encerrada.' }
  }
  if (input.atendenteId) {
    return { ok: false, erro: 'Esta denúncia já está em atendimento.' }
  }
  return { ok: true }
}

/**
 * Nome curto da conversa do interesse.
 * @param {{ titulo: string, idCurto?: string }} input
 */
export function nomeConversaBrecho(input) {
  const titulo = (input?.titulo ?? '').trim() || 'anúncio'
  const curto = (input?.idCurto ?? '').trim()
  const base = curto ? `Brechó · ${titulo} · ${curto}` : `Brechó · ${titulo}`
  return base.slice(0, 80)
}

/**
 * @param {string} id
 */
export function idCurtoBrecho(id) {
  return String(id ?? '').replace(/-/g, '').slice(0, 8).toUpperCase() || 'BRECHO'
}

/**
 * Sort de lojas confiáveis.
 * @param {{ scoreConfianca: number, trocasConcluidas: number, nome?: string }} a
 * @param {{ scoreConfianca: number, trocasConcluidas: number, nome?: string }} b
 */
export function compararLojasConfiaveis(a, b) {
  const score = (b?.scoreConfianca ?? 0) - (a?.scoreConfianca ?? 0)
  if (score !== 0) return score
  const trocas = (b?.trocasConcluidas ?? 0) - (a?.trocasConcluidas ?? 0)
  if (trocas !== 0) return trocas
  return String(a?.nome ?? '').localeCompare(String(b?.nome ?? ''), 'pt-BR')
}

/**
 * Preço de vitrine. Venda formata BRL; troca/doação usam o rótulo da modalidade.
 * @param {{ modalidade: BrechoModalidade, preco?: unknown }} input
 */
export function rotuloPrecoBrecho(input) {
  if (input?.modalidade === 'VENDA') {
    const n = Number(input.preco)
    if (!Number.isFinite(n) || n <= 0) return 'A combinar'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
  }
  if (input?.modalidade === 'DOACAO') return 'Doação'
  return 'Troca'
}

const SUFIXO_TESTE_NOME = /\s*\(teste\)\s*$/i
const ROTULO_CARGO_SEED =
  /^(Gestor|Membro|Presidente|Administrador|Vice-presidente|Sócio|Torcedor)\b/i

/**
 * Nome de pessoa no card. `User.nome` no seed de logins é o cargo
 * ("Gestor Materiais / Loja (teste)") — nesse caso cai no apelido.
 * @param {string} nome
 */
function nomeEhRotuloCargo(nome) {
  const n = String(nome ?? '').trim()
  if (!n) return true
  if (SUFIXO_TESTE_NOME.test(n)) return true
  return ROTULO_CARGO_SEED.test(n.replace(SUFIXO_TESTE_NOME, '').trim())
}

/**
 * Nome público do vendedor no card. Pessoa (nome ou apelido), nunca o cargo.
 * @param {{ nome?: string | null, nickname?: string | null, lojaNome?: string | null }} input
 */
export function nomeExibicaoVendedorBrecho(input) {
  const nomeBruto = String(input?.nome ?? '').trim()
  const nome = nomeBruto.replace(SUFIXO_TESTE_NOME, '').trim()
  const nick = String(input?.nickname ?? '').trim()
  const loja = String(input?.lojaNome ?? '').trim()
  if (nome && !nomeEhRotuloCargo(nomeBruto)) return nome
  if (nick) return nick
  if (nome) return nome
  return loja || 'Sócio'
}

/**
 * Nível de ranking da loja P2P (`BrechoLoja.scoreConfianca`, 0–100).
 * Mesmas faixas visuais do eixo de confiança da torcida — não é o saldo
 * `ConfiancaSaldo`.
 * @param {number} score
 */
export function rotuloRankingBrecho(score) {
  return labelNivelConfianca(nivelPorScore(score))
}

/**
 * Acerto confirmado pelos dois lados — troca, venda ou doação. Um número só.
 * @param {number} n
 */
export function rotuloTrocasBrecho(n) {
  const q = Math.max(0, Math.floor(Number(n) || 0))
  return q === 1 ? '1 troca' : `${q} trocas`
}

/**
 * Estrelas 0–5 relativas à praça: 0 se o score é nulo; 5 para o maior
 * `scoreConfianca` ativo da unidade (e empates no topo).
 * @param {number} score
 * @param {number} maxNaPraca
 */
export function estrelasConfiancaBrecho(score, maxNaPraca) {
  const s = Math.max(0, Number(score) || 0)
  const m = Math.max(0, Number(maxNaPraca) || 0)
  if (s <= 0 || m <= 0) return 0
  return Math.max(0, Math.min(5, Math.round((5 * s) / m)))
}
