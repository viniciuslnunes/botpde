/**
 * Memória — agregação pura por dia civil (America/Sao_Paulo).
 *
 * Não é a `FeedTimeline` (fan-out do mural). Aqui o eixo é a data: posts,
 * eventos, fatos atrasados e o jogo do clube no mesmo dayKey. No recorte
 * unidade/torcida, partida órfã (sem fato local) não abre nó; no clube, o
 * jogo é o eixo (`abrirPartidaOrfa`).
 */

import { MEMORIA_FATO_ANOS_MAX, MEMORIA_FATO_DIAS_FUTURO_MAX } from '@torcida/types'
import {
  addCalendarDays,
  calendarPartsToUtcNoon,
  compareCalendarParts,
  formatDateOnlyIso,
  formatMonthYear,
  formatTimeShort,
  parseDateOnly,
  startOfMonthParts,
  startOfZonedDayUtc,
  todayPartsInZone,
  zonedDateParts,
  type CalendarParts,
} from '@/lib/format-datetime'

export const MEMORIA_DIA_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export const LIMITE_POSTS_MEMORIA = 400
export const LIMITE_EVENTOS_MEMORIA = 300
export const LIMITE_PARTIDAS_MEMORIA = 80
export const LIMITE_FATOS_MEMORIA = 200
export const MESES_PASSADO_MEMORIA = 18
export const DIAS_FUTURO_MEMORIA = MEMORIA_FATO_DIAS_FUTURO_MAX
export const LIMITE_FOTOS_DIA = 24
export const LIMITE_PRESENCA_DIA = 24

const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

export type MemoriaFiltro = 'todos' | 'jogo' | 'evento' | 'publicacao'
export type MemoriaKind = 'partida' | 'evento' | 'post' | 'foto' | 'marco'
export type MemoriaEventoTipo = 'GERAL' | 'CARAVANA' | 'ENSAIO'
export type MemoriaMando = 'CASA' | 'FORA'

export type MemoriaPostBruto = {
  id: string
  conteudo: string
  criadoEm: Date | string
  imagemUrl: string | null
  midiaUrls: string[]
  autorId: string
  autorNome: string | null
  autorAvatar: string | null
  tenantId?: string
  tenantNome?: string | null
}

export type MemoriaEventoBruto = {
  id: string
  titulo: string
  tipo: MemoriaEventoTipo
  data: Date | string
  local: string | null
  fotoUrl: string | null
  partidaId: string | null
}

export type MemoriaPartidaBruta = {
  id: string
  adversario: string
  competicao: string | null
  dataHora: Date | string
  mando: MemoriaMando
  status: string
  placarCasa: number | null
  placarFora: number | null
}

export type MemoriaFatoBruto = {
  id: string
  dia: Date | string
  conteudo: string
  midiaUrls: string[]
  autorId: string
  autorNome: string | null
  autorAvatar: string | null
  criadoEm: Date | string
  postId: string | null
}

export type MemoriaMarcoBruto = {
  id: string
  dia: Date | string
  titulo: string
  descricao: string | null
}

export type MemoriaBruta = {
  posts: MemoriaPostBruto[]
  eventos: MemoriaEventoBruto[]
  partidas: MemoriaPartidaBruta[]
  fatos?: MemoriaFatoBruto[]
  marcos?: MemoriaMarcoBruto[]
}

export type MemoriaMontarOpts = {
  /** Escopo clube: o jogo abre o dia mesmo sem post/evento local. */
  abrirPartidaOrfa?: boolean
  /** Tenant ativo do viewer — rotula publicações de coirmãs. */
  homeTenantId?: string
  idsAliados?: readonly string[]
}

export type MemoriaPostDia = {
  id: string
  trecho: string
  autorNome: string
  autorAvatar: string | null
  autorId: string
  hora: string
  href: string
  fotos: string[]
  /** Fato aprovado ou post ligado a fato atrasado — curadoria da memória. */
  memoriaOficial?: boolean
  atrasado?: boolean
  tenantId?: string
  tenantNome?: string | null
  /** Conteúdo público de torcida aliada (recorte torcida). */
  deCoirma?: boolean
}

export type MemoriaEventoDia = {
  id: string
  titulo: string
  tipo: MemoriaEventoTipo
  hora: string
  local: string | null
  fotoUrl: string | null
  href: string
}

export type MemoriaPartidaDia = {
  id: string
  adversario: string
  competicao: string | null
  mando: MemoriaMando
  hora: string
  status: string
  placarCasa: number | null
  placarFora: number | null
}

export type MemoriaMarcoDia = {
  id: string
  titulo: string
  descricao: string | null
}

export type MemoriaDiaDetalhe = {
  dia: string
  partida: MemoriaPartidaDia | null
  eventos: MemoriaEventoDia[]
  posts: MemoriaPostDia[]
  fotos: string[]
  marco: MemoriaMarcoDia | null
}

export type MemoriaEspinhaDia = {
  dia: string
  kinds: MemoriaKind[]
  total: number
}

export type MemoriaMontada = {
  espinha: MemoriaEspinhaDia[]
  porDia: Record<string, MemoriaDiaDetalhe>
}

export type MemoriaMesGrupo = {
  chave: string
  label: string
  dias: MemoriaEspinhaDia[]
}

export function isMemoriaDiaIso(value: string | null | undefined): value is string {
  if (!value) return false
  if (!MEMORIA_DIA_ISO_RE.test(value)) return false
  const parts = parseDateOnly(value)
  const noon = calendarPartsToUtcNoon(parts)
  return (
    noon.getUTCFullYear() === parts.year &&
    noon.getUTCMonth() + 1 === parts.month &&
    noon.getUTCDate() === parts.day
  )
}

export function diaIsoDe(value: Date | string): string {
  return formatDateOnlyIso(zonedDateParts(value))
}

export function weekdayCurto(diaIso: string): string {
  const parts = parseDateOnly(diaIso)
  return SEMANA_CURTA[calendarPartsToUtcNoon(parts).getUTCDay()] ?? 'dom'
}

export function trechoPost(conteudo: string, max = 220): string {
  const t = conteudo.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max).trimEnd()}…`
}

export function janelaMemoria(now: Date = new Date()): { gte: Date; lt: Date } {
  const hoje = todayPartsInZone(now)
  const inicio = deslocarMes({ ...hoje, day: 1 }, -MESES_PASSADO_MEMORIA)
  return {
    gte: startOfZonedDayUtc(inicio),
    lt: startOfZonedDayUtc(addCalendarDays(hoje, DIAS_FUTURO_MEMORIA)),
  }
}

/** Um mês civil em SP — a espinha pagina por mês, não pelos 18 meses de conteúdo. */
export function janelaDoMes(parts: CalendarParts): { gte: Date; lt: Date } {
  const inicio = startOfMonthParts(parts)
  const proximo = deslocarMes(inicio, 1)
  return {
    gte: startOfZonedDayUtc(inicio),
    lt: startOfZonedDayUtc({ year: proximo.year, month: proximo.month, day: 1 }),
  }
}

export function mesIsoDe(diaIso: string): string {
  return diaIso.slice(0, 7)
}

export function diasDoMes(parts: CalendarParts): string[] {
  const inicio = startOfMonthParts(parts)
  const fim = deslocarMes(inicio, 1)
  const out: string[] = []
  let cursor = inicio
  while (compareCalendarParts(cursor, fim) < 0) {
    out.push(formatDateOnlyIso(cursor))
    cursor = addCalendarDays(cursor, 1)
  }
  return out
}

export function deslocarMes(parts: CalendarParts, meses: number): CalendarParts {
  let year = parts.year
  let month = parts.month + meses
  while (month <= 0) {
    month += 12
    year -= 1
  }
  while (month > 12) {
    month -= 12
    year += 1
  }
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { year, month, day: Math.min(parts.day, maxDay) }
}

export function diaNoMesVizinho(diaIso: string, deltaMes: number): string {
  return formatDateOnlyIso(deslocarMes(parseDateOnly(diaIso), deltaMes))
}

export function limitesCalendarioMemoria(hojeIso: string): { minIso: string; maxIso: string } {
  const hoje = parseDateOnly(hojeIso)
  const min = {
    year: hoje.year - MEMORIA_FATO_ANOS_MAX,
    month: hoje.month,
    day: hoje.day,
  }
  return {
    minIso: formatDateOnlyIso(min),
    maxIso: formatDateOnlyIso(addCalendarDays(hoje, DIAS_FUTURO_MEMORIA)),
  }
}

export function clampDiaIso(diaIso: string, minIso: string, maxIso: string): string {
  if (diaIso < minIso) return minIso
  if (diaIso > maxIso) return maxIso
  return diaIso
}

/** Dias visíveis na espinha, simétricos em torno do selecionado (passado e futuro). */
export const RAIO_DIAS_ESPINHA = 16

export function diasEmTorno(
  diaIso: string,
  minIso: string,
  maxIso: string,
  raio = RAIO_DIAS_ESPINHA,
): string[] {
  const centro = parseDateOnly(diaIso)
  const out: string[] = []
  for (let i = -raio; i <= raio; i++) {
    const d = formatDateOnlyIso(addCalendarDays(centro, i))
    if (d >= minIso && d <= maxIso) out.push(d)
  }
  return out
}

export function janelaEmTorno(
  diaIso: string,
  minIso: string,
  maxIso: string,
  raio = RAIO_DIAS_ESPINHA,
): { gte: Date; lt: Date } {
  const dias = diasEmTorno(diaIso, minIso, maxIso, raio)
  const primeiro = parseDateOnly(dias[0] ?? diaIso)
  const ultimo = parseDateOnly(dias[dias.length - 1] ?? diaIso)
  return {
    gte: startOfZonedDayUtc(primeiro),
    lt: startOfZonedDayUtc(addCalendarDays(ultimo, 1)),
  }
}

/** Espinha com **todos** os dias do recorte — vazio continua clicável (fato atrasado). */
export function montarEspinhaCalendario(
  dias: string[],
  porDia: Record<string, MemoriaDiaDetalhe>,
): MemoriaEspinhaDia[] {
  return [...dias].reverse().map((dia) => {
    const det = porDia[dia]
    if (!det) return { dia, kinds: [], total: 0 }
    return {
      dia,
      kinds: kindsDoDia(det),
      total: det.eventos.length + det.posts.length + (det.partida ? 1 : 0) + (det.marco ? 1 : 0),
    }
  })
}

function fotosDoPost(post: MemoriaPostBruto): string[] {
  const out: string[] = []
  if (post.imagemUrl) out.push(post.imagemUrl)
  for (const url of post.midiaUrls) {
    if (url && !out.includes(url)) out.push(url)
  }
  return out
}

function kindsDoDia(dia: MemoriaDiaDetalhe): MemoriaKind[] {
  const kinds: MemoriaKind[] = []
  if (dia.marco) kinds.push('marco')
  if (dia.partida) kinds.push('partida')
  if (dia.eventos.length > 0) kinds.push('evento')
  if (dia.posts.length > 0) kinds.push('post')
  if (dia.fotos.length > 0) kinds.push('foto')
  return kinds
}

function totalDia(dia: MemoriaDiaDetalhe): number {
  return (
    dia.eventos.length + dia.posts.length + (dia.partida ? 1 : 0) + (dia.marco ? 1 : 0)
  )
}

export function montarMemoria(bruta: MemoriaBruta, opts?: MemoriaMontarOpts): MemoriaMontada {
  const eventosPorDia = new Map<string, MemoriaEventoDia[]>()
  for (const ev of bruta.eventos) {
    const dia = diaIsoDe(ev.data)
    const list = eventosPorDia.get(dia) ?? []
    list.push({
      id: ev.id,
      titulo: ev.titulo,
      tipo: ev.tipo,
      hora: formatTimeShort(ev.data),
      local: ev.local,
      fotoUrl: ev.fotoUrl,
      href: `/portal/eventos/${ev.id}`,
    })
    eventosPorDia.set(dia, list)
  }

  const aliados = new Set(opts?.idsAliados ?? [])
  const homeId = opts?.homeTenantId

  const postsPorDia = new Map<string, MemoriaPostDia[]>()
  for (const post of bruta.posts) {
    const dia = diaIsoDe(post.criadoEm)
    const list = postsPorDia.get(dia) ?? []
    const tenantId = post.tenantId
    const deCoirma = Boolean(
      tenantId && homeId && tenantId !== homeId && aliados.has(tenantId),
    )
    list.push({
      id: post.id,
      trecho: trechoPost(post.conteudo),
      autorNome: post.autorNome?.trim() || 'Membro',
      autorAvatar: post.autorAvatar,
      autorId: post.autorId,
      hora: formatTimeShort(post.criadoEm),
      href: `/portal/comunidade/post/${post.id}`,
      fotos: fotosDoPost(post),
      tenantId,
      tenantNome: post.tenantNome ?? null,
      deCoirma,
    })
    postsPorDia.set(dia, list)
  }

  for (const fato of bruta.fatos ?? []) {
    const dia = diaIsoDe(fato.dia)
    const list = postsPorDia.get(dia) ?? []
    if (fato.postId) {
      const idx = list.findIndex((p) => p.id === fato.postId)
      if (idx >= 0) {
        list[idx] = {
          ...list[idx]!,
          memoriaOficial: true,
          atrasado: dia < diaIsoDe(fato.criadoEm),
        }
        postsPorDia.set(dia, list)
        continue
      }
    }
    list.push({
      id: fato.id,
      trecho: trechoPost(fato.conteudo),
      autorNome: fato.autorNome?.trim() || 'Membro',
      autorAvatar: fato.autorAvatar,
      autorId: fato.autorId,
      hora: formatTimeShort(fato.criadoEm),
      href: fato.postId ? `/portal/comunidade/post/${fato.postId}` : `/portal/memoria?dia=${dia}`,
      fotos: fato.midiaUrls.filter(Boolean),
      memoriaOficial: true,
      atrasado: dia < diaIsoDe(fato.criadoEm),
    })
    postsPorDia.set(dia, list)
  }

  const partidasPorDia = new Map<string, MemoriaPartidaDia>()
  for (const p of bruta.partidas) {
    const dia = diaIsoDe(p.dataHora)
    if (partidasPorDia.has(dia)) continue
    partidasPorDia.set(dia, {
      id: p.id,
      adversario: p.adversario,
      competicao: p.competicao,
      mando: p.mando,
      hora: formatTimeShort(p.dataHora),
      status: p.status,
      placarCasa: p.placarCasa,
      placarFora: p.placarFora,
    })
  }

  const marcosPorDia = new Map<string, MemoriaMarcoDia>()
  for (const m of bruta.marcos ?? []) {
    const dia = diaIsoDe(m.dia)
    marcosPorDia.set(dia, {
      id: m.id,
      titulo: m.titulo,
      descricao: m.descricao,
    })
  }

  const diasUnidade = new Set([
    ...eventosPorDia.keys(),
    ...postsPorDia.keys(),
    ...marcosPorDia.keys(),
  ])
  if (opts?.abrirPartidaOrfa) {
    for (const dia of partidasPorDia.keys()) diasUnidade.add(dia)
  }
  const porDia: Record<string, MemoriaDiaDetalhe> = {}

  for (const dia of diasUnidade) {
    const eventos = (eventosPorDia.get(dia) ?? []).sort((a, b) => a.hora.localeCompare(b.hora))
    const posts = (postsPorDia.get(dia) ?? []).sort((a, b) => a.hora.localeCompare(b.hora))
    const fotos: string[] = []
    for (const ev of eventos) {
      if (ev.fotoUrl && !fotos.includes(ev.fotoUrl) && fotos.length < LIMITE_FOTOS_DIA) {
        fotos.push(ev.fotoUrl)
      }
    }
    for (const post of posts) {
      for (const url of post.fotos) {
        if (!fotos.includes(url) && fotos.length < LIMITE_FOTOS_DIA) fotos.push(url)
      }
    }
    porDia[dia] = {
      dia,
      partida: partidasPorDia.get(dia) ?? null,
      eventos,
      posts,
      fotos,
      marco: marcosPorDia.get(dia) ?? null,
    }
  }

  const espinha: MemoriaEspinhaDia[] = Object.values(porDia)
    .map((dia) => ({
      dia: dia.dia,
      kinds: kindsDoDia(dia),
      total: totalDia(dia),
    }))
    .sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0))

  return { espinha, porDia }
}

export function filtrarEspinha(
  espinha: MemoriaEspinhaDia[],
  filtro: MemoriaFiltro,
): MemoriaEspinhaDia[] {
  if (filtro === 'todos') return espinha
  const kind: MemoriaKind = filtro === 'jogo' ? 'partida' : filtro === 'evento' ? 'evento' : 'post'
  return espinha.filter((d) => d.kinds.includes(kind) || (filtro === 'publicacao' && d.kinds.includes('foto')))
}

export function resolverDiaInicial(
  espinha: MemoriaEspinhaDia[],
  diaQuery: string | null | undefined,
  hojeIso: string,
): string | null {
  if (espinha.length === 0) return null
  const ids = new Set(espinha.map((d) => d.dia))
  if (diaQuery && ids.has(diaQuery)) return diaQuery
  if (ids.has(hojeIso)) return hojeIso
  return espinha[0]?.dia ?? null
}

export function agruparEspinhaPorMes(espinha: MemoriaEspinhaDia[]): MemoriaMesGrupo[] {
  const grupos: MemoriaMesGrupo[] = []
  for (const dia of espinha) {
    const parts = parseDateOnly(dia.dia)
    const chave = `${parts.year}-${String(parts.month).padStart(2, '0')}`
    const last = grupos[grupos.length - 1]
    if (last?.chave === chave) {
      last.dias.push(dia)
    } else {
      grupos.push({
        chave,
        label: formatMonthYear(parts),
        dias: [dia],
      })
    }
  }
  return grupos
}
