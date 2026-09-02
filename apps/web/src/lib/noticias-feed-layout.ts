import { rotuloOrigemPraca } from '@torcida/types'
import { formatRelative } from '@/lib/format-datetime'
import { youTubeId } from '@/lib/social-embed'
import type { NoticiaPracaItem } from '@/lib/praca'

/** Rótulo curto estilo portal esportivo (fonte ou origem). */
export function rotuloCategoriaNoticia(item: NoticiaPracaItem): string {
  if (item.fonte) return item.fonte
  return rotuloOrigemPraca(item.origem).toLowerCase()
}

export function capaNoticia(item: NoticiaPracaItem): string | null {
  const url = item.midiaUrls[0]
  if (!url) return null
  if (item.midiaPrincipal === 'embed') {
    const id = youTubeId(url)
    if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
  }
  return url
}

/** Matérias com vídeo ou embed — carrossel de curtos. */
export function filtrarVideosCurtoNoticias(itens: NoticiaPracaItem[]): NoticiaPracaItem[] {
  return itens.filter((item) => item.midiaPrincipal === 'video' || item.midiaPrincipal === 'embed')
}

export function formatDuracaoVideo(segundos: number | null): string | null {
  if (segundos == null || segundos < 1) return null
  if (segundos < 60) return `${segundos} seg`
  const min = Math.round(segundos / 60)
  return `${min} min`
}

/** Três primeiras matérias viram destaque bento; o restante segue em lista GE. */
export function particionarNoticiasFeed(itens: NoticiaPracaItem[]): {
  destaques: NoticiaPracaItem[]
  lista: NoticiaPracaItem[]
} {
  if (itens.length < 3) {
    return { destaques: [], lista: itens }
  }
  return {
    destaques: itens.slice(0, 3),
    lista: itens.slice(3),
  }
}

/** Ex.: "Há 2 h — Em ge" */
export function formatMetaNoticia(item: NoticiaPracaItem): string {
  const quando = formatRelative(item.publicadoEm ?? item.criadoEm)
  const capitalizado = quando.charAt(0).toUpperCase() + quando.slice(1)
  return `${capitalizado} — Em ${rotuloCategoriaNoticia(item)}`
}

export function resumoNoticia(item: NoticiaPracaItem): string | null {
  const texto = (item.resumo ?? item.corpo)?.trim()
  return texto || null
}

export function hrefNoticiaPraca(id: string, sufixo: string): string {
  return `/portal/comunidade/noticias/${id}${sufixo}`
}
