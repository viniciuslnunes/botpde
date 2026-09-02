import { tipoBlocoDeUrl } from '@torcida/types'

export type NoticiaRelacionadaLite = {
  id: string
  titulo: string
}

export type MetaArtigoLista = {
  relacionados: NoticiaRelacionadaLite[]
  duracaoSegundos: number | null
}

export function midiaPrincipalDeUrls(urls: string[]): 'imagem' | 'video' | 'embed' | null {
  const first = urls[0]
  if (!first) return null
  return tipoBlocoDeUrl(first) ?? 'imagem'
}

/** Lê blocos extras (relacionados, duração) sem passar pelo parser de leitura. */
export function extrairMetaArtigoBlocos(blocos: unknown): MetaArtigoLista {
  const relacionados: NoticiaRelacionadaLite[] = []
  let duracaoSegundos: number | null = null

  if (!Array.isArray(blocos)) return { relacionados, duracaoSegundos }

  for (const raw of blocos) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const item = raw as Record<string, unknown>

    if (item.tipo === 'relacionados' && Array.isArray(item.itens)) {
      for (const link of item.itens) {
        if (!link || typeof link !== 'object' || Array.isArray(link)) continue
        const row = link as Record<string, unknown>
        const id = String(row.artigoId ?? row.id ?? '').trim()
        const titulo = String(row.titulo ?? '').trim()
        if (id && titulo) relacionados.push({ id, titulo })
      }
    }

    if (
      (item.tipo === 'video' || item.tipo === 'embed') &&
      typeof item.duracaoSegundos === 'number' &&
      Number.isFinite(item.duracaoSegundos) &&
      duracaoSegundos == null
    ) {
      duracaoSegundos = Math.max(1, Math.round(item.duracaoSegundos))
    }
  }

  return { relacionados, duracaoSegundos }
}
