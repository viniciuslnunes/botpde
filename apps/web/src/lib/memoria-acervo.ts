/**
 * Regras puras do acervo — busca, “neste dia”, estatísticas e convites.
 * Consumível no servidor e no cliente (sem import de DB).
 */

import { MEMORIA_FATO_ANOS_MAX } from '@torcida/types'
import {
  formatDateOnlyIso,
  formatMonthYear,
  parseDateOnly,
  type CalendarParts,
} from '@/lib/format-datetime'
import type { MemoriaDiaDetalhe, MemoriaEspinhaDia, MemoriaMontada } from '@/lib/memoria-dia'

export type MemoriaEstatisticas = {
  /** Dias com pelo menos um registro na janela carregada da espinha. */
  diasComMemoria: number
  /** Total de dias na janela visível. */
  diasNaJanela: number
  /** Dias com conteúdo no ano civil corrente (pode ser aproximado pelo take do loader). */
  diasNoAno: number | null
  /** Primeiro dia com memória no recorte (ISO), se conhecido. */
  primeiroDia: string | null
  /** Mês com mais dias com memória na janela. */
  mesMaisAtivo: string | null
}

export type MemoriaParalelo = {
  dia: string
  anosAtras: number
  resumo: string
  temConteudo: boolean
}

export type MemoriaConvite = {
  titulo: string
  descricao: string
  eventoId?: string
  abrirComposer?: boolean
}

const ANOS_PARALELO = [1, 2, 3, 5] as const

/** Mesmo dia/mês em anos anteriores, dentro do teto de 5 anos. */
export function diasParalelosNesteDia(diaIso: string, hojeIso: string): string[] {
  const parts = parseDateOnly(diaIso)
  const limiteMin = parseDateOnly(
    formatDateOnlyIso({
      year: parseDateOnly(hojeIso).year - MEMORIA_FATO_ANOS_MAX,
      month: parseDateOnly(hojeIso).month,
      day: parseDateOnly(hojeIso).day,
    }),
  )
  const out: string[] = []
  for (const anos of ANOS_PARALELO) {
    const candidato = deslocarAno(parts, -anos)
    if (!candidato) continue
    const iso = formatDateOnlyIso(candidato)
    if (iso < formatDateOnlyIso(limiteMin)) continue
    if (iso >= diaIso) continue
    out.push(iso)
  }
  return out
}

function deslocarAno(parts: CalendarParts, deltaAnos: number): CalendarParts | null {
  const alvo = { year: parts.year + deltaAnos, month: parts.month, day: parts.day }
  const maxDay = new Date(Date.UTC(alvo.year, alvo.month, 0)).getUTCDate()
  if (alvo.day > maxDay) return null
  return { ...alvo, day: Math.min(alvo.day, maxDay) }
}

export function anosAtrasEntre(diaIso: string, paraleloIso: string): number {
  return parseDateOnly(diaIso).year - parseDateOnly(paraleloIso).year
}

export function montarParalelos(
  diaReferencia: string,
  dias: string[],
  porDia: Record<string, MemoriaDiaDetalhe>,
): MemoriaParalelo[] {
  return dias.map((dia) => {
    const det = porDia[dia]
    const temConteudo = Boolean(det && temConteudoDia(det))
    return {
      dia,
      anosAtras: anosAtrasEntre(diaReferencia, dia),
      resumo: det ? resumoParalelo(det) : 'Sem registro',
      temConteudo,
    }
  })
}

export function calcularEstatisticas(
  espinha: MemoriaEspinhaDia[],
  diasNoAno: number | null,
  primeiroDia: string | null,
): MemoriaEstatisticas {
  const comMemoria = espinha.filter((d) => d.total > 0)
  const porMes = new Map<string, number>()
  for (const d of comMemoria) {
    const chave = d.dia.slice(0, 7)
    porMes.set(chave, (porMes.get(chave) ?? 0) + 1)
  }
  let mesMaisAtivo: string | null = null
  let max = 0
  for (const [chave, n] of porMes) {
    if (n > max) {
      max = n
      mesMaisAtivo = chave
    }
  }
  return {
    diasComMemoria: comMemoria.length,
    diasNaJanela: espinha.length,
    diasNoAno,
    primeiroDia,
    mesMaisAtivo: mesMaisAtivo
      ? formatMonthYear(parseDateOnly(`${mesMaisAtivo}-01`))
      : null,
  }
}

export function estatisticasDaMontada(montada: MemoriaMontada): MemoriaEstatisticas {
  const comMemoria = montada.espinha.filter((d) => d.total > 0)
  const primeiro =
    comMemoria.length > 0 ? comMemoria[comMemoria.length - 1]?.dia ?? null : null
  return calcularEstatisticas(montada.espinha, null, primeiro)
}

export function sugerirConviteDia(
  dia: MemoriaDiaDetalhe,
  hojeIso: string,
  podeCriar: boolean,
): MemoriaConvite | null {
  if (!podeCriar) return null

  if (dia.partida && dia.posts.length === 0 && dia.fotos.length === 0) {
    return {
      titulo: 'Conte como foi o jogo',
      descricao: `Teve jogo contra ${dia.partida.adversario} — publique o que rolou na arquibancada ou na sede.`,
      abrirComposer: true,
    }
  }

  if (dia.eventos.length === 1 && dia.posts.length === 0) {
    const ev = dia.eventos[0]!
    return {
      titulo: 'Conte o que rolou',
      descricao: `Você esteve em “${ev.titulo}”? Ligue uma memória a este dia.`,
      eventoId: ev.id,
      abrirComposer: true,
    }
  }

  if (dia.eventos.length > 1 && dia.posts.length === 0) {
    return {
      titulo: 'Este dia teve movimento',
      descricao: `${dia.eventos.length} eventos e nenhuma publicação ainda — ajude a torcida a lembrar.`,
      abrirComposer: true,
    }
  }

  const vazio = !temConteudoDia(dia)
  if (!vazio) return null

  const parts = parseDateOnly(dia.dia)
  const hoje = parseDateOnly(hojeIso)
  const diff = diffDias(parts, hoje)
  if (diff < 0 || diff > 21) return null

  if (diff === 0) {
    return {
      titulo: 'O dia está em branco',
      descricao: 'Algo rolou hoje na sede ou na rua? Publique na memória da torcida.',
      abrirComposer: true,
    }
  }

  return {
    titulo: 'Lembrete do acervo',
    descricao:
      diff <= 7
        ? 'Semana passada sem registro — se participou de algo, ligue a este dia.'
        : 'Este dia ainda está vazio. Se algo marcou a unidade, vale registrar.',
    abrirComposer: true,
  }
}

export function resumoParalelo(dia: MemoriaDiaDetalhe): string {
  const partes: string[] = []
  if (dia.marco) partes.push(dia.marco.titulo)
  if (dia.partida) {
    const placar =
      dia.partida.placarCasa != null && dia.partida.placarFora != null
        ? ` ${dia.partida.placarCasa}–${dia.partida.placarFora}`
        : ''
    partes.push(`Jogo × ${dia.partida.adversario}${placar}`)
  }
  if (dia.eventos.length === 1) partes.push(dia.eventos[0]!.titulo)
  if (dia.eventos.length > 1) partes.push(`${dia.eventos.length} eventos`)
  if (dia.posts.length === 1) partes.push(dia.posts[0]!.trecho.slice(0, 80))
  if (dia.posts.length > 1) partes.push(`${dia.posts.length} publicações`)
  if (dia.fotos.length > 0 && partes.length === 0) {
    partes.push(`${dia.fotos.length} ${dia.fotos.length === 1 ? 'imagem' : 'imagens'}`)
  }
  return partes.join(' · ') || 'Sem registro'
}

export function temConteudoDia(dia: MemoriaDiaDetalhe): boolean {
  return Boolean(
    dia.marco ||
      dia.partida ||
      dia.eventos.length > 0 ||
      dia.posts.length > 0 ||
      dia.fotos.length > 0,
  )
}

function diffDias(a: CalendarParts, b: CalendarParts): number {
  const msA = Date.UTC(a.year, a.month - 1, a.day)
  const msB = Date.UTC(b.year, b.month - 1, b.day)
  return Math.round((msB - msA) / 86_400_000)
}

/** Normaliza termo de busca (mín. 2 caracteres). */
export function normalizarTermoBuscaMemoria(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, ' ')
  if (t.length < 2) return null
  return t.slice(0, 120)
}
