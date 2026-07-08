import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'
import { fetchOEmbedMetadata } from '@/lib/oembed'
import { ingestNoticiaRascunho } from '@/lib/noticias'
import { excedeuLimiteIngest, registrarTentativaIngest } from '@/lib/noticias-ingest-rate-limit'

const ingestSchema = z.object({
  afiliacaoId: z.string().min(1),
  titulo: z.string().min(1).max(250),
  resumo: z.string().max(500).optional(),
  url: z.string().url(),
  fonte: z.string().min(1).max(150),
})

function isIngestKeyValida(headerValue: string | null): boolean {
  const expected = env.NOTICIAS_INGEST_KEY
  if (!expected || !headerValue) return false
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(headerValue)
  if (expectedBuffer.length !== actualBuffer.length) return false
  return timingSafeEqual(expectedBuffer, actualBuffer)
}

export async function POST(request: NextRequest) {
  if (!env.NOTICIAS_INGEST_KEY) {
    return NextResponse.json({ error: 'Ingest desabilitado' }, { status: 503 })
  }

  const providedKey = request.headers.get('x-ingest-key')
  if (!isIngestKeyValida(providedKey)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]?.trim() ?? 'unknown'
  const limiterKey = `news-ingest:${ip}`
  if (excedeuLimiteIngest(limiterKey)) {
    return NextResponse.json({ error: 'Rate limit excedido' }, { status: 429 })
  }
  registrarTentativaIngest(limiterKey)

  const json = await request.json().catch(() => null)
  const parsed = ingestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload inválido', details: parsed.error.flatten() }, { status: 400 })
  }

  const metadata = await fetchOEmbedMetadata(parsed.data.url)
  const noticia = await ingestNoticiaRascunho({
    afiliacaoId: parsed.data.afiliacaoId,
    titulo: parsed.data.titulo,
    resumo: parsed.data.resumo,
    url: parsed.data.url,
    fonte: parsed.data.fonte,
    embedHtml: metadata?.html ?? undefined,
    embedThumbnail: metadata?.thumbnailUrl ?? undefined,
  })

  return NextResponse.json({ id: noticia.id, status: noticia.status }, { status: 201 })
}
