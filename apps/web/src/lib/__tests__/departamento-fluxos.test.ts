import { describe, expect, it } from 'vitest'
import {
  FLUXO_ADIAR_DIAS,
  FLUXO_FACTS_VAZIO,
  FLUXO_PAPEL,
  FLUXO_PREFS_VAZIO,
  FLUXO_TOM,
  LIMITE_FLUXOS_GESTOR,
  LIMITE_FLUXOS_MEMBRO,
  fluxoOcultoPorPrefs,
  lerFluxoPrefs,
  mesDisparaCampanha,
  mergeAdiarFluxo,
  mergeReceitaFluxo,
  mergeValeFluxo,
  montarCandidatosFluxo,
  podeAtivarReceita,
  proximaDataEnsaio,
  ranquearFluxos,
  receitasDoPanel,
  sugerirFluxosDepartamento,
} from '@torcida/types'

type FluxoFacts = typeof FLUXO_FACTS_VAZIO
type FluxoSugestao = ReturnType<typeof sugerirFluxosDepartamento>[number]

function facts(partial: Partial<FluxoFacts>): FluxoFacts {
  return { ...FLUXO_FACTS_VAZIO, ...partial }
}

describe('ranquearFluxos', () => {
  const a: FluxoSugestao = {
    id: 'a',
    titulo: 'A',
    descricao: '',
    href: '/',
    cta: 'Ir',
    papel: 'gestor',
    prioridade: 20,
    tom: 'atencao',
    ativavel: false,
  }
  const b: FluxoSugestao = { ...a, id: 'b', prioridade: 10, papel: 'gestor' }
  const m: FluxoSugestao = { ...a, id: 'm', papel: 'membro', prioridade: 5 }

  it('gestor vê só gestão, ordenado por prioridade, no teto de 5', () => {
    const muitos = Array.from({ length: 8 }, (_, i) => ({
      ...a,
      id: `g${i}`,
      prioridade: 80 - i,
    }))
    const ranked = ranquearFluxos([...muitos, m], FLUXO_PAPEL.GESTOR)
    expect(ranked).toHaveLength(LIMITE_FLUXOS_GESTOR)
    expect(ranked.map((x) => x.id)).toEqual(['g7', 'g6', 'g5', 'g4', 'g3'])
    expect(ranked.every((x) => x.papel === 'gestor')).toBe(true)
  })

  it('membro vê um único passo executável', () => {
    const ranked = ranquearFluxos([a, b, m], FLUXO_PAPEL.MEMBRO)
    expect(ranked).toHaveLength(LIMITE_FLUXOS_MEMBRO)
    expect(ranked[0]?.id).toBe('m')
  })
})

describe('montarCandidatosFluxo', () => {
  it('fila e pedidos são urgência de gestor com permissão de aprovar', () => {
    const cands = montarCandidatosFluxo(
      facts({
        isGestor: true,
        slug: 'diretoria',
        panel: 'diretoria',
        podeAprovar: true,
        totalPendentes: 3,
        totalPedidosArea: 2,
        nomeDepartamento: 'Diretoria',
      }),
    )
    expect(cands.map((c) => c.id)).toEqual(['fila-admissao', 'pedidos-area'])
    expect(cands.every((c) => c.tom === FLUXO_TOM.URGENTE)).toBe(true)
    expect(cands[0]?.href).toBe('/portal/departamentos/diretoria?tab=fila')
    expect(cands[1]?.href).toBe('/portal/departamentos/diretoria?tab=pedidos')
  })

  it('membro da diretoria não vê a fila — gestão não é visão dele', () => {
    const cands = montarCandidatosFluxo(
      facts({
        isGestor: false,
        isAtuacao: true,
        panel: 'diretoria',
        podeAprovar: false,
        totalPendentes: 8,
      }),
    )
    expect(cands.find((c) => c.id === 'fila-admissao')).toBeUndefined()
  })

  it('gestor sem members:approve não recebe CTA de aprovar', () => {
    const cands = montarCandidatosFluxo(
      facts({
        isGestor: true,
        panel: 'diretoria',
        podeAprovar: false,
        totalPendentes: 4,
      }),
    )
    expect(cands.find((c) => c.id === 'fila-admissao')).toBeUndefined()
  })

  it('jogo fora sem caravana só no painel de caravanas', () => {
    const caravanas = montarCandidatosFluxo(
      facts({
        isGestor: true,
        panel: 'caravanas',
        podeCriarEvento: true,
        partidaForaSemCaravana: { adversario: 'Palmeiras' },
      }),
    )
    expect(caravanas.some((c) => c.id === 'partida-fora-sem-caravana')).toBe(true)
    const social = montarCandidatosFluxo(
      facts({
        isGestor: true,
        panel: 'generico',
        slug: 'social-e-eventos',
        partidaForaSemCaravana: { adversario: 'Palmeiras' },
      }),
    )
    expect(social.some((c) => c.id === 'partida-fora-sem-caravana')).toBe(false)
  })

  it('membro da bateria confirma ensaio; gestor não recebe esse passo', () => {
    const ensaio = { id: 'e1', titulo: 'Ensaio quinta' }
    const membro = montarCandidatosFluxo(
      facts({
        isGestor: false,
        isAtuacao: true,
        panel: 'bateria',
        proximoEnsaio: ensaio,
        rsvpEnsaioConfirmado: false,
      }),
    )
    expect(membro.map((c) => c.id)).toEqual(['confirmar-ensaio'])
    const gestor = montarCandidatosFluxo(
      facts({
        isGestor: true,
        isAtuacao: true,
        panel: 'bateria',
        proximoEnsaio: ensaio,
        rsvpEnsaioConfirmado: false,
      }),
    )
    expect(gestor.find((c) => c.id === 'confirmar-ensaio')).toBeUndefined()
    expect(gestor.some((c) => c.id === 'proximo-ensaio-gestor')).toBe(true)
  })

  it('cobrança em aberto: gestor e membro do financeiro, cada um no seu papel', () => {
    const gestor = montarCandidatosFluxo(
      facts({
        isGestor: true,
        panel: 'financeiro',
        podeVerFinanceiro: true,
        cobrancasEmAberto: true,
      }),
    )
    expect(gestor.some((c) => c.papel === 'gestor' && c.id === 'cobrancas-aberto-gestor')).toBe(
      true,
    )
    const membro = montarCandidatosFluxo(
      facts({
        isGestor: false,
        isAtuacao: true,
        panel: 'financeiro',
        podeVerFinanceiro: true,
        cobrancasEmAberto: true,
      }),
    )
    expect(membro.map((c) => c.id)).toEqual(['cobrancas-aberto-membro'])
    const semPerm = montarCandidatosFluxo(
      facts({
        isGestor: false,
        isAtuacao: true,
        panel: 'financeiro',
        podeVerFinanceiro: false,
        cobrancasEmAberto: true,
      }),
    )
    expect(semPerm).toHaveLength(0)
  })

  it('campanha sazonal faltando é de gestor; membro acompanha a campanha aberta da frente', () => {
    const gestor = montarCandidatosFluxo(
      facts({
        isGestor: true,
        slug: 'social-e-eventos',
        panel: 'generico',
        mes: 5,
        campanhaSazonalFaltando: { nome: 'Campanha do Agasalho', slug: 'campanha-do-agasalho' },
        ano: 2026,
      }),
    )
    expect(gestor.find((c) => c.id === 'campanha-do-ano')?.titulo).toContain('2026')
    const membro = montarCandidatosFluxo(
      facts({
        isGestor: false,
        isAtuacao: true,
        slug: 'social-e-eventos',
        panel: 'generico',
        minhaCampanhaAberta: { nome: 'Campanha do Agasalho 2026' },
      }),
    )
    expect(membro.map((c) => c.id)).toEqual(['acompanhar-campanha'])
  })
})

describe('sugerirFluxosDepartamento', () => {
  it('gestor recebe a lista cortada; membro, um passo', () => {
    const gestor = sugerirFluxosDepartamento(
      facts({
        isGestor: true,
        panel: 'diretoria',
        podeAprovar: true,
        totalPendentes: 1,
        totalPedidosArea: 1,
        projetosEstourados: [{ titulo: 'Agasalho' }],
        campanhaSazonalFaltando: { nome: 'Natal' },
        projetoNaJanela: { titulo: 'Escolinha' },
        ano: 2026,
      }),
    )
    expect(gestor[0]?.id).toBe('fila-admissao')
    expect(gestor.length).toBeLessThanOrEqual(LIMITE_FLUXOS_GESTOR)

    const membro = sugerirFluxosDepartamento(
      facts({
        isGestor: false,
        isAtuacao: true,
        panel: 'caravanas',
        proximaCaravana: { id: 'c1', titulo: 'Caravana X' },
        rsvpCaravanaConfirmado: false,
      }),
    )
    expect(membro).toHaveLength(1)
    expect(membro[0]?.id).toBe('confirmar-caravana')
  })
})

describe('ativar / prefs (Fase 2)', () => {
  it('campanha do ano é ativável sem events:create; ensaio exige a permissão', () => {
    expect(
      podeAtivarReceita('campanha-do-ano', { isGestor: true, podeCriarEvento: false }),
    ).toBe(true)
    expect(
      podeAtivarReceita('ensaio-da-semana', { isGestor: true, podeCriarEvento: false }),
    ).toBe(false)
    expect(
      podeAtivarReceita('ensaio-da-semana', { isGestor: true, podeCriarEvento: true }),
    ).toBe(true)
    expect(
      podeAtivarReceita('fila-admissao', { isGestor: true, podeCriarEvento: true }),
    ).toBe(false)
  })

  it('gestor com permissão recebe CTA de materializar, não de abrir a agenda', () => {
    const cands = montarCandidatosFluxo(
      facts({
        isGestor: true,
        slug: 'bateria',
        panel: 'bateria',
        podeCriarEvento: true,
      }),
    )
    const ensaio = cands.find((c) => c.id === 'ensaio-da-semana')
    expect(ensaio?.ativavel).toBe(true)
    expect(ensaio?.cta).toBe('Marcar ensaio')
  })

  it('adiar e desligar escondem a sugestão sem apagar o fato', () => {
    const agora = new Date('2026-08-27T12:00:00.000Z')
    const ate = new Date('2026-09-03T12:00:00.000Z')
    const meta = mergeAdiarFluxo({ barracao: { items: { a: { done: true } } } }, 'fila-admissao', ate)
    expect(lerFluxoPrefs(meta).adiadoAte['fila-admissao']).toBe(ate.toISOString())
    expect((meta as { barracao?: { items?: unknown } }).barracao).toEqual({
      items: { a: { done: true } },
    })
    expect(fluxoOcultoPorPrefs('fila-admissao', lerFluxoPrefs(meta), agora)).toBe(true)
    expect(fluxoOcultoPorPrefs('fila-admissao', lerFluxoPrefs(meta), new Date('2026-09-04T00:00:00.000Z'))).toBe(
      false,
    )

    const gestor = sugerirFluxosDepartamento(
      facts({
        isGestor: true,
        panel: 'diretoria',
        podeAprovar: true,
        totalPendentes: 2,
        prefs: { desligados: ['fila-admissao'], adiadoAte: {}, receitas: {} },
      }),
      agora,
    )
    expect(gestor.find((c) => c.id === 'fila-admissao')).toBeUndefined()
  })

  it('próximo ensaio replica a semana do último', () => {
    const agora = new Date('2026-08-27T15:00:00.000Z')
    const ultimo = new Date('2026-08-20T23:00:00.000Z')
    expect(proximaDataEnsaio(ultimo, agora).getTime()).toBe(
      ultimo.getTime() + 7 * 24 * 60 * 60 * 1000,
    )
    expect(FLUXO_ADIAR_DIAS).toBe(7)
    expect(FLUXO_PREFS_VAZIO.desligados).toEqual([])
  })

  it('Não usar nesta torcida desliga; merge não apaga barracão nem adiar', () => {
    const ate = new Date('2026-09-03T12:00:00.000Z')
    let meta: object = mergeAdiarFluxo({ barracao: { items: { a: { done: true } } } }, 'campanha-do-ano', ate)
    meta = mergeValeFluxo(meta, 'campanha-do-ano', false)
    const prefs = lerFluxoPrefs(meta)
    expect(prefs.desligados).toContain('campanha-do-ano')
    expect(prefs.adiadoAte['campanha-do-ano']).toBeUndefined()
    expect((meta as { barracao?: unknown }).barracao).toEqual({ items: { a: { done: true } } })
    meta = mergeReceitaFluxo(meta, 'campanha-do-ano', { responsavel: 'area', meses: [5, 6] })
    expect(lerFluxoPrefs(meta).receitas['campanha-do-ano']).toEqual({
      responsavel: 'area',
      meses: [5, 6],
    })
    expect(lerFluxoPrefs(meta).desligados).toContain('campanha-do-ano')
  })
})

describe('calendário (Fase 3)', () => {
  it('campanha só dispara na janela civil (com um mês de antecedência)', () => {
    expect(mesDisparaCampanha('campanha-do-agasalho', 5)).toBe(true)
    expect(mesDisparaCampanha('campanha-do-agasalho', 4)).toBe(true)
    expect(mesDisparaCampanha('campanha-do-agasalho', 8)).toBe(false)
    expect(mesDisparaCampanha('natal', 10)).toBe(true)
    expect(mesDisparaCampanha('natal', 6)).toBe(false)
    expect(
      mesDisparaCampanha('campanha-do-agasalho', 8, {
        desligados: [],
        adiadoAte: {},
        receitas: { 'campanha-do-ano': { meses: [8] } },
      }),
    ).toBe(true)
  })

  it('campanha fora de época não entra na lista; escala só no painel de bandeiras', () => {
    const inverno = montarCandidatosFluxo(
      facts({
        isGestor: true,
        slug: 'social-e-eventos',
        panel: 'generico',
        mes: 8,
        campanhaSazonalFaltando: { nome: 'Campanha do Agasalho', slug: 'campanha-do-agasalho' },
        ano: 2026,
      }),
    )
    expect(inverno.find((c) => c.id === 'campanha-do-ano')).toBeUndefined()
    const maio = montarCandidatosFluxo(
      facts({
        isGestor: true,
        slug: 'social-e-eventos',
        panel: 'generico',
        mes: 5,
        campanhaSazonalFaltando: { nome: 'Campanha do Agasalho', slug: 'campanha-do-agasalho' },
        ano: 2026,
      }),
    )
    expect(maio.some((c) => c.id === 'campanha-do-ano')).toBe(true)

    const bandeiras = montarCandidatosFluxo(
      facts({
        isGestor: true,
        panel: 'bandeiras',
        podeCriarEvento: true,
        partidaSemEscala: { adversario: 'Santos', mando: 'CASA' },
      }),
    )
    expect(bandeiras.find((c) => c.id === 'escala-de-bandeira')?.ativavel).toBe(true)
    const social = montarCandidatosFluxo(
      facts({
        isGestor: true,
        panel: 'generico',
        partidaSemEscala: { adversario: 'Santos', mando: 'CASA' },
      }),
    )
    expect(social.find((c) => c.id === 'escala-de-bandeira')).toBeUndefined()
  })

  it('desfile no horizonte sugere barracão e ensaio de rua', () => {
    const cands = montarCandidatosFluxo(
      facts({
        isGestor: true,
        slug: 'carnaval',
        panel: 'carnaval',
        podeCriarEvento: true,
        desfile: { temData: true, dias: 30 },
      }),
    )
    expect(cands.map((c) => c.id)).toEqual(['desfile-proximo', 'ensaios-de-rua'])
    expect(cands.find((c) => c.id === 'ensaios-de-rua')?.ativavel).toBe(true)
  })

  it('ensaio desta semana não pede para marcar outro; membro confirma a escala', () => {
    const comEnsaio = montarCandidatosFluxo(
      facts({
        isGestor: true,
        panel: 'bateria',
        podeCriarEvento: true,
        ensaioNestaSemana: true,
        proximoEnsaio: { id: 'e1', titulo: 'Ensaio quinta' },
      }),
    )
    expect(comEnsaio.find((c) => c.id === 'ensaio-da-semana')).toBeUndefined()
    expect(comEnsaio.some((c) => c.id === 'proximo-ensaio-gestor')).toBe(true)

    const membro = montarCandidatosFluxo(
      facts({
        isGestor: false,
        isAtuacao: true,
        panel: 'bandeiras',
        proximaEscala: { id: 'esc1', titulo: 'Escala · Santos' },
        rsvpEscalaConfirmado: false,
      }),
    )
    expect(membro.map((c) => c.id)).toEqual(['confirmar-escala'])
  })

  it('receitas do painel expõem as 3 alavancas; diretoria não tem receita de calendário', () => {
    expect(receitasDoPanel('bandeiras').map((r) => r.id)).toEqual(['escala-de-bandeira'])
    expect(receitasDoPanel('carnaval').map((r) => r.id)).toEqual(['ensaios-de-rua', 'desfile-proximo'])
    expect(receitasDoPanel('diretoria')).toEqual([])
  })
})
