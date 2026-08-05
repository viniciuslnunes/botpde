/**
 * Cluster do “dia operacional”: eventos + partida no mesmo dia civil.
 * Vínculos fortes: partidaId, projetoId, serieId. Sem tabela de relação.
 *
 * O fuso fica fora — o caller passa `dayKeyOf(iso)` (ex.: dayKeyInZone SP).
 */

/**
 * @typedef {{
 *   id: string,
 *   dataIso: string,
 *   tipo: string,
 *   titulo: string,
 *   href: string,
 *   partidaId?: string | null,
 *   projetoId?: string | null,
 *   serieId?: string | null,
 *   local?: string | null,
 * }} EventoClusterInput
 */

/**
 * @typedef {{
 *   id: string,
 *   dataIso: string,
 *   adversario?: string | null,
 *   mando?: string | null,
 *   competicao?: string | null,
 * }} PartidaClusterInput
 */

/**
 * @typedef {{
 *   kind: 'partida' | 'projeto' | 'serie' | 'orfaos',
 *   key: string,
 *   label: string,
 *   eventos: EventoClusterInput[],
 * }} GrupoClusterDia
 */

/**
 * @typedef {{
 *   dayKey: string,
 *   eventos: EventoClusterInput[],
 *   partida: PartidaClusterInput | null,
 *   grupos: GrupoClusterDia[],
 *   sugestoesVincular: EventoClusterInput[],
 * }} DiaOperacional
 */

/**
 * @param {EventoClusterInput[]} eventos
 * @param {PartidaClusterInput[]} [partidas]
 * @param {(iso: string) => string} dayKeyOf
 * @returns {Map<string, DiaOperacional>}
 */
export function agruparDiaOperacional(eventos, partidas = [], dayKeyOf) {
  if (typeof dayKeyOf !== 'function') {
    throw new TypeError('agruparDiaOperacional: dayKeyOf é obrigatório')
  }

  /** @type {Map<string, EventoClusterInput[]>} */
  const eventosPorDia = new Map()
  for (const ev of eventos) {
    const key = dayKeyOf(ev.dataIso)
    const list = eventosPorDia.get(key) ?? []
    list.push(ev)
    eventosPorDia.set(key, list)
  }

  /** @type {Map<string, PartidaClusterInput[]>} */
  const partidasPorDia = new Map()
  for (const p of partidas) {
    const key = dayKeyOf(p.dataIso)
    const list = partidasPorDia.get(key) ?? []
    list.push(p)
    partidasPorDia.set(key, list)
  }

  const allKeys = new Set([...eventosPorDia.keys(), ...partidasPorDia.keys()])
  /** @type {Map<string, DiaOperacional>} */
  const out = new Map()

  for (const dayKey of allKeys) {
    const evs = [...(eventosPorDia.get(dayKey) ?? [])].sort(
      (a, b) => new Date(a.dataIso).getTime() - new Date(b.dataIso).getTime(),
    )
    const partsDia = partidasPorDia.get(dayKey) ?? []

    /** @type {Map<string, PartidaClusterInput>} */
    const partidaById = new Map(partsDia.map((p) => [p.id, p]))
    for (const ev of evs) {
      if (ev.partidaId && !partidaById.has(ev.partidaId)) {
        // Partida referenciada mas fora da lista — âncora mínima pelo id.
        partidaById.set(ev.partidaId, {
          id: ev.partidaId,
          dataIso: ev.dataIso,
          adversario: null,
          mando: null,
          competicao: null,
        })
      }
    }

    const partidaAncora = resolverPartidaAncora(evs, partsDia)

    const grupos = montarGrupos(evs, partidaById)
    // Só sugere vincular quem não tem partida; mutação é Server Action separada.
    const sugestoesVincular =
      partidaAncora == null ? [] : evs.filter((e) => e.partidaId == null || e.partidaId === '')

    out.set(dayKey, {
      dayKey,
      eventos: evs,
      partida: partidaAncora,
      grupos,
      sugestoesVincular,
    })
  }

  return out
}

/**
 * @param {EventoClusterInput[]} evs
 * @param {PartidaClusterInput[]} partsDia
 * @returns {PartidaClusterInput | null}
 */
function resolverPartidaAncora(evs, partsDia) {
  if (partsDia.length === 1) return partsDia[0] ?? null
  if (partsDia.length > 1) {
    // Preferir a partida mais citada pelos eventos.
    /** @type {Map<string, number>} */
    const counts = new Map()
    for (const ev of evs) {
      if (!ev.partidaId) continue
      counts.set(ev.partidaId, (counts.get(ev.partidaId) ?? 0) + 1)
    }
    let best = partsDia[0]
    let bestN = -1
    for (const p of partsDia) {
      const n = counts.get(p.id) ?? 0
      if (n > bestN) {
        bestN = n
        best = p
      }
    }
    return best ?? null
  }
  // Sem Partida na lista — usar a mais citada pelos eventos.
  /** @type {Map<string, { n: number, dataIso: string }>} */
  const byId = new Map()
  for (const ev of evs) {
    if (!ev.partidaId) continue
    const cur = byId.get(ev.partidaId) ?? { n: 0, dataIso: ev.dataIso }
    cur.n += 1
    byId.set(ev.partidaId, cur)
  }
  if (byId.size === 0) return null
  let topId = ''
  let topN = -1
  let topIso = ''
  for (const [id, { n, dataIso }] of byId) {
    if (n > topN) {
      topN = n
      topId = id
      topIso = dataIso
    }
  }
  return { id: topId, dataIso: topIso, adversario: null, mando: null, competicao: null }
}

/**
 * @param {EventoClusterInput[]} evs
 * @param {Map<string, PartidaClusterInput>} partidaById
 * @returns {GrupoClusterDia[]}
 */
function montarGrupos(evs, partidaById) {
  /** @type {Map<string, GrupoClusterDia>} */
  const grupos = new Map()

  /**
   * @param {string} kind
   * @param {string} key
   * @param {string} label
   * @param {EventoClusterInput} ev
   */
  function push(kind, key, label, ev) {
    const mapKey = `${kind}:${key}`
    let g = grupos.get(mapKey)
    if (!g) {
      g = { kind: /** @type {GrupoClusterDia['kind']} */ (kind), key, label, eventos: [] }
      grupos.set(mapKey, g)
    }
    g.eventos.push(ev)
  }

  const orfaos = []
  for (const ev of evs) {
    if (ev.partidaId) {
      const p = partidaById.get(ev.partidaId)
      const adv = p?.adversario ? ` vs ${p.adversario}` : ''
      push('partida', ev.partidaId, `Jogo${adv}`, ev)
      continue
    }
    if (ev.projetoId) {
      push('projeto', ev.projetoId, 'Projeto', ev)
      continue
    }
    if (ev.serieId) {
      push('serie', ev.serieId, 'Série', ev)
      continue
    }
    orfaos.push(ev)
  }
  if (orfaos.length > 0) {
    grupos.set('orfaos:', {
      kind: 'orfaos',
      key: '',
      label: 'Sem vínculo',
      eventos: orfaos,
    })
  }

  const ordem = { partida: 0, projeto: 1, serie: 2, orfaos: 3 }
  return [...grupos.values()].sort(
    (a, b) => (ordem[a.kind] ?? 9) - (ordem[b.kind] ?? 9) || a.label.localeCompare(b.label, 'pt-BR'),
  )
}

/**
 * Filtra o mapa de dias para uma janela de dayKeys (ex.: semana).
 *
 * @param {Map<string, DiaOperacional>} porDia
 * @param {string[]} dayKeys
 * @returns {DiaOperacional[]}
 */
export function diasOperacionaisNaJanela(porDia, dayKeys) {
  return dayKeys.map((k) => porDia.get(k) ?? {
    dayKey: k,
    eventos: [],
    partida: null,
    grupos: [],
    sugestoesVincular: [],
  })
}
