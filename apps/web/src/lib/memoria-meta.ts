import { MEMORIA_ESCOPO } from '@torcida/types'
import { formatWeekdayLong, parseDateOnly } from '@/lib/format-datetime'
import { isMemoriaDiaIso, type MemoriaDiaDetalhe } from '@/lib/memoria-dia'
import { resumoParalelo } from '@/lib/memoria-acervo'

/** Título legível para OG / compartilhamento de um dia da Memória. */
export function tituloMemoriaDia(diaIso: string, escopo: string): string {
  if (!isMemoriaDiaIso(diaIso)) return 'Memórias'
  const titulo = formatWeekdayLong(parseDateOnly(diaIso))
  if (escopo === MEMORIA_ESCOPO.CLUBE) return `Memória do clube — ${titulo}`
  if (escopo === MEMORIA_ESCOPO.TORCIDA) return `Memória da torcida — ${titulo}`
  return `Memória — ${titulo}`
}

/** Descrição curta para preview (OG / export). */
export function descricaoMemoriaDia(
  dia: MemoriaDiaDetalhe | null,
  tenantNome: string,
): string {
  if (!dia) return `Acervo de ${tenantNome}.`
  const partes: string[] = []
  if (dia.marco) partes.push(dia.marco.titulo)
  if (dia.partida) partes.push(`Jogo: ${dia.partida.adversario}`)
  for (const ev of dia.eventos.slice(0, 2)) partes.push(ev.titulo)
  if (dia.posts.length > 0) partes.push(`${dia.posts.length} publicação(ões)`)
  if (partes.length === 0) return `Dia ${dia.dia} no acervo de ${tenantNome}.`
  return partes.join(' · ')
}

export function resumoMemoriaDiaExport(dia: MemoriaDiaDetalhe): string {
  return resumoParalelo(dia)
}
