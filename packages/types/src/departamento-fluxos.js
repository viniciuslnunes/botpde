/**
 * Fluxos sugeridos do cockpit de departamento.
 *
 * Fase 1: lista ranqueada (gestor × membro).
 * Fase 2: receitas ativáveis + 3 alavancas em `Departamento.meta.fluxos`
 *   (vale nesta torcida, quando, quem responde). Sem tabela nova.
 * Fase 3: calendário nacional (mês civil, Partida, desfile) dispara
 *   a sugestão antes de faltar o processo.
 * O fluxo não concede permissão.
 */

import { hrefHomeDepartamento } from './departamento-capabilities.js'

export const FLUXO_PAPEL = Object.freeze({
  GESTOR: 'gestor',
  MEMBRO: 'membro',
})

export const FLUXO_TOM = Object.freeze({
  URGENTE: 'urgente',
  ATENCAO: 'atencao',
  ROTINA: 'rotina',
})

export const LIMITE_FLUXOS_GESTOR = 5
export const LIMITE_FLUXOS_MEMBRO = 1
export const FLUXO_ADIAR_DIAS = 7
export const FLUXO_HORIZONTE_JOGO_DIAS = 21
/** Sugere ensaios/barracão este tanto de dias antes do desfile. */
export const FLUXO_DESFILE_ANTECEDENCIA_DIAS = 45

/**
 * Mês civil (1–12) em que a campanha sazonal deve ser sugerida.
 * O mês anterior entra como antecedência (Fase 3).
 * @type {Readonly<Record<string, readonly number[]>>}
 */
export const FLUXO_MESES_CAMPANHA = Object.freeze({
  'campanha-do-agasalho': Object.freeze([5, 6, 7]),
  'festa-das-criancas': Object.freeze([9, 10]),
  pascoa: Object.freeze([3, 4]),
  natal: Object.freeze([11, 12]),
})

/**
 * @type {Readonly<Record<string, { precisaEvento: boolean }>>}
 */
export const FLUXO_RECEITAS_ATIVAVEIS = Object.freeze({
  'campanha-do-ano': Object.freeze({ precisaEvento: false }),
  'partida-fora-sem-caravana': Object.freeze({ precisaEvento: true }),
  'ensaio-da-semana': Object.freeze({ precisaEvento: true }),
  'escala-de-bandeira': Object.freeze({ precisaEvento: true }),
  'ensaios-de-rua': Object.freeze({ precisaEvento: true }),
})

/**
 * Receitas configuráveis por painel do departamento (as 3 alavancas).
 * @type {Readonly<Record<string, readonly { id: string, label: string, quando: 'meses' | 'horizonte' | 'diaSemana' | 'desfile' | 'nenhum' }[]>>}
 */
export const FLUXO_RECEITAS_DO_PANEL = Object.freeze({
  generico: Object.freeze([
    { id: 'campanha-do-ano', label: 'Campanha do ano', quando: 'meses' },
  ]),
  caravanas: Object.freeze([
    { id: 'partida-fora-sem-caravana', label: 'Caravana do jogo fora', quando: 'horizonte' },
  ]),
  bateria: Object.freeze([
    { id: 'ensaio-da-semana', label: 'Ensaio da semana', quando: 'diaSemana' },
  ]),
  bandeiras: Object.freeze([
    { id: 'escala-de-bandeira', label: 'Escala do trapo', quando: 'horizonte' },
  ]),
  carnaval: Object.freeze([
    { id: 'ensaios-de-rua', label: 'Ensaios de rua', quando: 'desfile' },
    { id: 'desfile-proximo', label: 'Barracão até o desfile', quando: 'desfile' },
  ]),
})

/** @param {string} panel */
export function receitasDoPanel(panel) {
  return FLUXO_RECEITAS_DO_PANEL[panel] ?? []
}

/**
 * @typedef {'gestor' | 'membro'} FluxoPapel
 * @typedef {'urgente' | 'atencao' | 'rotina'} FluxoTom
 * @typedef {'gestor' | 'area'} FluxoResponsavel
 *
 * @typedef {{
 *   id: string,
 *   titulo: string,
 *   descricao: string,
 *   href: string,
 *   cta: string,
 *   papel: FluxoPapel,
 *   prioridade: number,
 *   tom: FluxoTom,
 *   ativavel: boolean,
 * }} FluxoSugestao
 *
 * @typedef {{
 *   horizonteDias?: number,
 *   meses?: readonly number[],
 *   diaSemana?: number,
 *   responsavel?: FluxoResponsavel,
 * }} FluxoReceitaPref
 *
 * @typedef {{
 *   desligados: readonly string[],
 *   adiadoAte: Readonly<Record<string, string>>,
 *   receitas: Readonly<Record<string, FluxoReceitaPref>>,
 * }} FluxoPrefs
 *
 * @typedef {{
 *   slug: string,
 *   panel: string,
 *   isGestor: boolean,
 *   isAtuacao: boolean,
 *   podeAprovar: boolean,
 *   podeVerFinanceiro: boolean,
 *   podeCriarEvento: boolean,
 *   totalPendentes: number,
 *   totalPedidosArea: number,
 *   nomeDepartamento: string,
 *   ano: number,
 *   mes: number,
 *   projetosEstourados: ReadonlyArray<{ titulo: string }>,
 *   projetoNaJanela: { titulo: string } | null,
 *   campanhaSazonalFaltando: { nome: string, slug?: string } | null,
 *   cobrancasEmAberto: boolean,
 *   proximoEnsaio: { id: string, titulo: string } | null,
 *   ensaioNestaSemana: boolean,
 *   rsvpEnsaioConfirmado: boolean,
 *   proximaCaravana: { id: string, titulo: string } | null,
 *   rsvpCaravanaConfirmado: boolean,
 *   partidaForaSemCaravana: { adversario: string, dias?: number } | null,
 *   partidaSemEscala: { adversario: string, mando?: string } | null,
 *   desfile: { temData: boolean, dias: number | null } | null,
 *   proximaEscala: { id: string, titulo: string } | null,
 *   rsvpEscalaConfirmado: boolean,
 *   minhaCampanhaAberta: { nome: string } | null,
 *   prefs: FluxoPrefs,
 * }} FluxoFacts
 */

/** @type {FluxoFacts} */
export const FLUXO_FACTS_VAZIO = Object.freeze({
  slug: '',
  panel: 'generico',
  isGestor: false,
  isAtuacao: false,
  podeAprovar: false,
  podeVerFinanceiro: false,
  podeCriarEvento: false,
  totalPendentes: 0,
  totalPedidosArea: 0,
  nomeDepartamento: '',
  ano: 2026,
  mes: 1,
  projetosEstourados: Object.freeze([]),
  projetoNaJanela: null,
  campanhaSazonalFaltando: null,
  cobrancasEmAberto: false,
  proximoEnsaio: null,
  ensaioNestaSemana: false,
  rsvpEnsaioConfirmado: false,
  proximaCaravana: null,
  rsvpCaravanaConfirmado: false,
  partidaForaSemCaravana: null,
  partidaSemEscala: null,
  desfile: null,
  proximaEscala: null,
  rsvpEscalaConfirmado: false,
  minhaCampanhaAberta: null,
  prefs: Object.freeze({
    desligados: Object.freeze([]),
    adiadoAte: Object.freeze({}),
    receitas: Object.freeze({}),
  }),
})

/** @type {FluxoPrefs} */
export const FLUXO_PREFS_VAZIO = FLUXO_FACTS_VAZIO.prefs

/**
 * @param {string} id
 * @param {Partial<FluxoSugestao> & Pick<FluxoSugestao, 'titulo' | 'descricao' | 'href' | 'cta' | 'papel' | 'prioridade'>} rest
 * @returns {FluxoSugestao}
 */
function fluxo(id, rest) {
  return {
    id,
    tom: rest.tom ?? FLUXO_TOM.ATENCAO,
    titulo: rest.titulo,
    descricao: rest.descricao,
    href: rest.href,
    cta: rest.cta,
    papel: rest.papel,
    prioridade: rest.prioridade,
    ativavel: Boolean(rest.ativavel),
  }
}

/**
 * @param {string} receitaId
 * @param {Pick<FluxoFacts, 'isGestor' | 'podeCriarEvento'>} facts
 * @returns {boolean}
 */
export function podeAtivarReceita(receitaId, facts) {
  const receita = FLUXO_RECEITAS_ATIVAVEIS[receitaId]
  if (!receita || !facts.isGestor) return false
  if (receita.precisaEvento && !facts.podeCriarEvento) return false
  return true
}

/**
 * @param {FluxoFacts} facts
 * @param {string} receitaId
 * @returns {string}
 */
function sufixoResponsavel(facts, receitaId) {
  const modo = facts.prefs?.receitas?.[receitaId]?.responsavel
  if (modo === 'area') return ' Quem responde: responsável da frente.'
  return ''
}

/**
 * Mês civil dispara a campanha (janela + 1 mês de antecedência).
 *
 * @param {string | undefined} areaSlug
 * @param {number} mes 1–12
 * @param {FluxoPrefs} [prefs]
 * @returns {boolean}
 */
export function mesDisparaCampanha(areaSlug, mes, prefs) {
  const override = prefs?.receitas?.['campanha-do-ano']?.meses
  const catalogo =
    override && override.length > 0
      ? override
      : areaSlug
        ? FLUXO_MESES_CAMPANHA[areaSlug]
        : undefined
  if (!catalogo || catalogo.length === 0) return true
  const m = Number(mes)
  if (!Number.isInteger(m) || m < 1 || m > 12) return true
  const lead = catalogo.map((x) => (x === 1 ? 12 : x - 1))
  return catalogo.includes(m) || lead.includes(m)
}

/**
 * Horizonte de jogos (caravana / escala), em dias.
 *
 * @param {FluxoPrefs} [prefs]
 * @param {string} [receitaId]
 * @returns {number}
 */
export function horizonteJogoDias(prefs, receitaId = 'partida-fora-sem-caravana') {
  const n = prefs?.receitas?.[receitaId]?.horizonteDias
  if (typeof n === 'number' && Number.isInteger(n) && n >= 7 && n <= 90) return n
  return FLUXO_HORIZONTE_JOGO_DIAS
}

export function montarCandidatosFluxo(facts) {
  /** @type {FluxoSugestao[]} */
  const out = []
  const nome = facts.nomeDepartamento || 'este departamento'
  const panelCampanha =
    facts.panel === 'generico' || facts.slug === 'social-e-eventos' || facts.slug === 'feminino'

  if (facts.isGestor && facts.panel === 'diretoria' && facts.podeAprovar && facts.totalPendentes > 0) {
    const n = facts.totalPendentes
    out.push(
      fluxo('fila-admissao', {
        titulo: `${n} solicitação${n === 1 ? '' : 'ões'} pendente${n === 1 ? '' : 's'}`,
        descricao: 'Aprove ou reprove na fila deste departamento.',
        href: hrefHomeDepartamento(facts.slug, 'fila'),
        cta: 'Ver fila',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 10,
        tom: FLUXO_TOM.URGENTE,
      }),
    )
  }

  if (facts.isGestor && facts.podeAprovar && facts.totalPedidosArea > 0) {
    const n = facts.totalPedidosArea
    out.push(
      fluxo('pedidos-area', {
        titulo: `${n} pedido${n === 1 ? '' : 's'} de área`,
        descricao: `Sócios aprovados aguardando entrada numa área de ${nome}.`,
        href: hrefHomeDepartamento(facts.slug, 'pedidos'),
        cta: 'Ver pedidos',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 15,
        tom: FLUXO_TOM.URGENTE,
      }),
    )
  }

  if (facts.isGestor && facts.projetosEstourados[0]) {
    const titulo = facts.projetosEstourados[0].titulo
    out.push(
      fluxo('orcamento-estourado', {
        titulo: `Orçamento estourado · ${titulo}`,
        descricao: 'O gasto no livro-caixa passou do previsto deste projeto.',
        href: hrefHomeDepartamento(facts.slug, 'projetos'),
        cta: 'Ver projetos',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 20,
        tom: FLUXO_TOM.URGENTE,
      }),
    )
  }

  if (facts.cobrancasEmAberto && facts.podeVerFinanceiro && facts.panel === 'financeiro') {
    if (facts.isGestor) {
      out.push(
        fluxo('cobrancas-aberto-gestor', {
          titulo: 'Há cobranças em aberto',
          descricao: 'Acompanhe inadimplência e mensalidades da associação.',
          href: '/portal/cobrancas',
          cta: 'Mensalidades',
          papel: FLUXO_PAPEL.GESTOR,
          prioridade: 25,
          tom: FLUXO_TOM.URGENTE,
        }),
      )
    } else if (facts.isAtuacao) {
      out.push(
        fluxo('cobrancas-aberto-membro', {
          titulo: 'Há cobranças em aberto',
          descricao: 'Veja inadimplência e mensalidades da associação.',
          href: '/portal/cobrancas',
          cta: 'Mensalidades',
          papel: FLUXO_PAPEL.MEMBRO,
          prioridade: 25,
          tom: FLUXO_TOM.ATENCAO,
        }),
      )
    }
  }

  if (facts.isGestor && facts.panel === 'caravanas' && facts.partidaForaSemCaravana) {
    const adv = facts.partidaForaSemCaravana.adversario
    const dias = facts.partidaForaSemCaravana.dias
    const quando = typeof dias === 'number' ? ` Jogo em ${dias} dia${dias === 1 ? '' : 's'}.` : ''
    out.push(
      fluxo('partida-fora-sem-caravana', {
        titulo: `Jogo fora · ${adv}`,
        descricao: (facts.podeCriarEvento
          ? `Não há caravana ligada a este jogo.${quando} Ative para criar a viagem.`
          : `Não há caravana ligada a este jogo.${quando} Peça a quem cria eventos na área.`) +
          sufixoResponsavel(facts, 'partida-fora-sem-caravana'),
        href: '/portal/eventos?tipo=CARAVANA',
        cta: facts.podeCriarEvento ? 'Criar caravana' : 'Ver agenda',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 30,
        tom: FLUXO_TOM.ATENCAO,
      }),
    )
  }

  if (facts.isGestor && facts.panel === 'bateria' && !facts.ensaioNestaSemana) {
    out.push(
      fluxo('ensaio-da-semana', {
        titulo: 'Nenhum ensaio nesta semana',
        descricao:
          (facts.podeCriarEvento
            ? 'Marque o ensaio da semana para a bateria confirmar presença.'
            : 'Peça a quem cria eventos para marcar o próximo ensaio.') +
          sufixoResponsavel(facts, 'ensaio-da-semana'),
        href: '/portal/eventos?tipo=ENSAIO',
        cta: facts.podeCriarEvento ? 'Marcar ensaio' : 'Ver agenda',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 35,
        tom: FLUXO_TOM.ATENCAO,
      }),
    )
  }

  if (
    facts.isGestor &&
    panelCampanha &&
    facts.campanhaSazonalFaltando &&
    mesDisparaCampanha(facts.campanhaSazonalFaltando.slug, facts.mes, facts.prefs)
  ) {
    out.push(
      fluxo('campanha-do-ano', {
        titulo: `Abrir ${facts.campanhaSazonalFaltando.nome} ${facts.ano}`,
        descricao:
          'A janela do calendário chegou — abre projeto + checklist da frente.' +
          sufixoResponsavel(facts, 'campanha-do-ano'),
        href: hrefHomeDepartamento(facts.slug, 'areas'),
        cta: 'Abrir campanha',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 40,
        tom: FLUXO_TOM.ATENCAO,
      }),
    )
  }

  if (facts.isGestor && facts.panel === 'bandeiras' && facts.partidaSemEscala) {
    const adv = facts.partidaSemEscala.adversario
    const mando = facts.partidaSemEscala.mando === 'CASA' ? 'em casa' : 'fora'
    out.push(
      fluxo('escala-de-bandeira', {
        titulo: `Escala · ${adv}`,
        descricao: (facts.podeCriarEvento
          ? `Jogo ${mando} sem escala na agenda. Ative para criar o evento e o checklist de quem leva o trapo.`
          : `Jogo ${mando} sem escala na agenda. Peça a quem cria eventos.`) +
          sufixoResponsavel(facts, 'escala-de-bandeira'),
        href: '/portal/eventos',
        cta: facts.podeCriarEvento ? 'Criar escala' : 'Ver agenda',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 32,
        tom: FLUXO_TOM.ATENCAO,
      }),
    )
  }

  if (facts.isGestor && facts.panel === 'carnaval' && facts.desfile) {
    if (!facts.desfile.temData) {
      out.push(
        fluxo('desfile-sem-data', {
          titulo: 'Defina a data do desfile',
          descricao: 'Sem a âncora do desfile o calendário do barracão não dispara.',
          href: hrefHomeDepartamento(facts.slug),
          cta: 'Informar data',
          papel: FLUXO_PAPEL.GESTOR,
          prioridade: 28,
          tom: FLUXO_TOM.ATENCAO,
        }),
      )
    } else if (
      facts.desfile.dias != null &&
      facts.desfile.dias >= 0 &&
      facts.desfile.dias <= FLUXO_DESFILE_ANTECEDENCIA_DIAS
    ) {
      const d = facts.desfile.dias
      out.push(
        fluxo('desfile-proximo', {
          titulo: `Desfile em ${d} dia${d === 1 ? '' : 's'}`,
          descricao: 'O calendário chegou — feche o checklist do barracão.',
          href: hrefHomeDepartamento(facts.slug),
          cta: 'Ver barracão',
          papel: FLUXO_PAPEL.GESTOR,
          prioridade: 28,
          tom: d <= 14 ? FLUXO_TOM.URGENTE : FLUXO_TOM.ATENCAO,
        }),
      )
      out.push(
        fluxo('ensaios-de-rua', {
          titulo: 'Ensaio de rua até o desfile',
          descricao: (facts.podeCriarEvento
            ? 'Marque o ensaio de rua na agenda para a ala confirmar presença.'
            : 'Peça a quem cria eventos para marcar o ensaio de rua.') +
            sufixoResponsavel(facts, 'ensaios-de-rua'),
          href: '/portal/eventos',
          cta: facts.podeCriarEvento ? 'Marcar ensaio' : 'Ver agenda',
          papel: FLUXO_PAPEL.GESTOR,
          prioridade: 36,
          tom: FLUXO_TOM.ATENCAO,
        }),
      )
    }
  }

  if (facts.isGestor && facts.projetoNaJanela) {
    out.push(
      fluxo('projeto-na-janela', {
        titulo: facts.projetoNaJanela.titulo,
        descricao: 'Projeto na janela — acompanhe meta e agenda.',
        href: hrefHomeDepartamento(facts.slug, 'projetos'),
        cta: 'Ver projetos',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 50,
        tom: FLUXO_TOM.ROTINA,
      }),
    )
  }

  if (facts.isGestor && facts.panel === 'caravanas' && facts.proximaCaravana) {
    out.push(
      fluxo('proxima-caravana-gestor', {
        titulo: facts.proximaCaravana.titulo,
        descricao: 'Próxima caravana — RSVP, vaga e embarque.',
        href: `/portal/eventos/${facts.proximaCaravana.id}`,
        cta: 'Abrir caravana',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 60,
        tom: FLUXO_TOM.ROTINA,
      }),
    )
  }

  if (facts.isGestor && facts.panel === 'bateria' && facts.proximoEnsaio) {
    out.push(
      fluxo('proximo-ensaio-gestor', {
        titulo: facts.proximoEnsaio.titulo,
        descricao: 'Próximo ensaio da bateria.',
        href: `/portal/eventos/${facts.proximoEnsaio.id}`,
        cta: 'Abrir ensaio',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 70,
        tom: FLUXO_TOM.ROTINA,
      }),
    )
  }

  if (facts.isGestor && facts.panel === 'bandeiras' && facts.proximaEscala) {
    out.push(
      fluxo('proxima-escala-gestor', {
        titulo: facts.proximaEscala.titulo,
        descricao: 'Próxima escala — quem leva, estende e recolhe.',
        href: `/portal/eventos/${facts.proximaEscala.id}`,
        cta: 'Abrir escala',
        papel: FLUXO_PAPEL.GESTOR,
        prioridade: 65,
        tom: FLUXO_TOM.ROTINA,
      }),
    )
  }

  if (
    !facts.isGestor &&
    facts.isAtuacao &&
    facts.panel === 'bateria' &&
    facts.proximoEnsaio &&
    !facts.rsvpEnsaioConfirmado
  ) {
    out.push(
      fluxo('confirmar-ensaio', {
        titulo: facts.proximoEnsaio.titulo,
        descricao: 'Confirme presença no próximo ensaio.',
        href: `/portal/eventos/${facts.proximoEnsaio.id}`,
        cta: 'Confirmar',
        papel: FLUXO_PAPEL.MEMBRO,
        prioridade: 80,
        tom: FLUXO_TOM.ATENCAO,
      }),
    )
  }

  if (
    !facts.isGestor &&
    facts.isAtuacao &&
    facts.panel === 'caravanas' &&
    facts.proximaCaravana &&
    !facts.rsvpCaravanaConfirmado
  ) {
    out.push(
      fluxo('confirmar-caravana', {
        titulo: facts.proximaCaravana.titulo,
        descricao: 'Confirme presença — e pague a vaga se a caravana for paga.',
        href: `/portal/eventos/${facts.proximaCaravana.id}`,
        cta: 'Abrir caravana',
        papel: FLUXO_PAPEL.MEMBRO,
        prioridade: 85,
        tom: FLUXO_TOM.ATENCAO,
      }),
    )
  }

  if (
    !facts.isGestor &&
    facts.isAtuacao &&
    facts.panel === 'bandeiras' &&
    facts.proximaEscala &&
    !facts.rsvpEscalaConfirmado
  ) {
    out.push(
      fluxo('confirmar-escala', {
        titulo: facts.proximaEscala.titulo,
        descricao: 'Confirme se você leva, estende ou recolhe o trapo neste jogo.',
        href: `/portal/eventos/${facts.proximaEscala.id}`,
        cta: 'Confirmar',
        papel: FLUXO_PAPEL.MEMBRO,
        prioridade: 82,
        tom: FLUXO_TOM.ATENCAO,
      }),
    )
  }

  if (!facts.isGestor && facts.isAtuacao && facts.minhaCampanhaAberta && panelCampanha) {
    out.push(
      fluxo('acompanhar-campanha', {
        titulo: facts.minhaCampanhaAberta.nome,
        descricao: 'Campanha da sua frente está na janela — veja meta e checklist.',
        href: hrefHomeDepartamento(facts.slug, 'projetos'),
        cta: 'Ver campanha',
        papel: FLUXO_PAPEL.MEMBRO,
        prioridade: 90,
        tom: FLUXO_TOM.ROTINA,
      }),
    )
  }

  return out.map((c) => ({
    ...c,
    ativavel: podeAtivarReceita(c.id, facts),
  }))
}

export function ranquearFluxos(candidatos, papel) {
  const limite = papel === FLUXO_PAPEL.GESTOR ? LIMITE_FLUXOS_GESTOR : LIMITE_FLUXOS_MEMBRO
  return [...candidatos]
    .filter((c) => c.papel === papel)
    .sort((a, b) => a.prioridade - b.prioridade || a.id.localeCompare(b.id))
    .slice(0, limite)
}

export function sugerirFluxosDepartamento(facts, agora = new Date()) {
  const papel = facts.isGestor ? FLUXO_PAPEL.GESTOR : FLUXO_PAPEL.MEMBRO
  const prefs = facts.prefs ?? FLUXO_PREFS_VAZIO
  const visiveis = montarCandidatosFluxo(facts).filter(
    (c) => !fluxoOcultoPorPrefs(c.id, prefs, agora),
  )
  return ranquearFluxos(visiveis, papel)
}

/**
 * @param {unknown} meta
 * @returns {FluxoPrefs}
 */
export function lerFluxoPrefs(meta) {
  /** @type {FluxoPrefs} */
  const empty = { desligados: [], adiadoAte: {}, receitas: {} }
  if (!meta || typeof meta !== 'object') return empty
  const raw = /** @type {{ fluxos?: unknown }} */ (meta).fluxos
  if (!raw || typeof raw !== 'object') return empty
  const row = /** @type {{ desligados?: unknown, adiadoAte?: unknown, receitas?: unknown }} */ (raw)
  const desligados = Array.isArray(row.desligados)
    ? row.desligados.filter((id) => typeof id === 'string' && id.trim())
    : []
  /** @type {Record<string, string>} */
  const adiadoAte = {}
  if (row.adiadoAte && typeof row.adiadoAte === 'object' && !Array.isArray(row.adiadoAte)) {
    for (const [id, iso] of Object.entries(row.adiadoAte)) {
      if (typeof iso === 'string' && iso.trim()) adiadoAte[id] = iso
    }
  }
  /** @type {Record<string, FluxoReceitaPref>} */
  const receitas = {}
  if (row.receitas && typeof row.receitas === 'object' && !Array.isArray(row.receitas)) {
    for (const [id, pref] of Object.entries(row.receitas)) {
      if (!pref || typeof pref !== 'object') continue
      const p = /** @type {{ horizonteDias?: unknown, meses?: unknown, diaSemana?: unknown, responsavel?: unknown }} */ (
        pref
      )
      /** @type {FluxoReceitaPref} */
      const parsed = {}
      if (typeof p.horizonteDias === 'number' && Number.isInteger(p.horizonteDias)) {
        parsed.horizonteDias = Math.min(90, Math.max(7, p.horizonteDias))
      }
      if (Array.isArray(p.meses)) {
        parsed.meses = p.meses.filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
      }
      if (typeof p.diaSemana === 'number' && p.diaSemana >= 0 && p.diaSemana <= 6) {
        parsed.diaSemana = p.diaSemana
      }
      if (p.responsavel === 'gestor' || p.responsavel === 'area') {
        parsed.responsavel = p.responsavel
      }
      receitas[id] = parsed
    }
  }
  return { desligados, adiadoAte, receitas }
}

/**
 * @param {unknown} meta
 * @param {FluxoPrefs} prefs
 * @returns {object}
 */
function writeFluxoPrefs(meta, prefs) {
  const base =
    meta && typeof meta === 'object' ? { .../** @type {Record<string, unknown>} */ (meta) } : {}
  return {
    ...base,
    fluxos: {
      desligados: prefs.desligados,
      adiadoAte: prefs.adiadoAte,
      receitas: prefs.receitas,
    },
  }
}

export function fluxoOcultoPorPrefs(receitaId, prefs, agora = new Date()) {
  if (prefs.desligados.includes(receitaId)) return true
  const ate = prefs.adiadoAte[receitaId]
  if (!ate) return false
  const d = new Date(ate)
  return !Number.isNaN(d.getTime()) && d > agora
}

export function mergeAdiarFluxo(meta, receitaId, ate) {
  const prefs = lerFluxoPrefs(meta)
  return writeFluxoPrefs(meta, {
    ...prefs,
    adiadoAte: { ...prefs.adiadoAte, [receitaId]: ate.toISOString() },
  })
}

/**
 * Liga ou desliga a receita nesta torcida (alavanca 1).
 *
 * @param {unknown} meta
 * @param {string} receitaId
 * @param {boolean} vale
 * @returns {object}
 */
export function mergeValeFluxo(meta, receitaId, vale) {
  const prefs = lerFluxoPrefs(meta)
  const desligados = vale
    ? prefs.desligados.filter((id) => id !== receitaId)
    : [...new Set([...prefs.desligados, receitaId])]
  const adiadoAte = { ...prefs.adiadoAte }
  delete adiadoAte[receitaId]
  return writeFluxoPrefs(meta, { ...prefs, desligados, adiadoAte })
}

/**
 * Grava quando/quem de uma receita (alavancas 2 e 3), sem mexer em vale/adiar.
 *
 * @param {unknown} meta
 * @param {string} receitaId
 * @param {FluxoReceitaPref} patch
 * @returns {object}
 */
export function mergeReceitaFluxo(meta, receitaId, patch) {
  const prefs = lerFluxoPrefs(meta)
  const prev = prefs.receitas[receitaId] ?? {}
  return writeFluxoPrefs(meta, {
    ...prefs,
    receitas: { ...prefs.receitas, [receitaId]: { ...prev, ...patch } },
  })
}

export function proximaDataEnsaio(ultimo, agora = new Date(), diaSemana) {
  if (typeof diaSemana === 'number' && diaSemana >= 0 && diaSemana <= 6) {
    const d = new Date(agora.getTime())
    d.setHours(20, 0, 0, 0)
    const add = (diaSemana - d.getDay() + 7) % 7
    if (add === 0 && agora.getTime() >= d.getTime()) d.setDate(d.getDate() + 7)
    else d.setDate(d.getDate() + add)
    return d
  }
  if (ultimo instanceof Date && !Number.isNaN(ultimo.getTime())) {
    const next = new Date(ultimo.getTime())
    while (next.getTime() <= agora.getTime()) {
      next.setDate(next.getDate() + 7)
    }
    return next
  }
  const d = new Date(agora.getTime())
  d.setHours(20, 0, 0, 0)
  const day = d.getDay()
  if (day === 4 && agora.getTime() < d.getTime()) return d
  const add = day === 4 ? 7 : (4 - day + 7) % 7
  d.setDate(d.getDate() + add)
  return d
}
