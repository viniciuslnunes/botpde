import { db } from '@torcida/db'
import type { Noticia, StatusNoticia } from '@torcida/db'
import { z } from 'zod'

const getNoticiasSchema = z.object({
  afiliacaoId: z.string().min(1),
})

const ingestSchema = z.object({
  afiliacaoId: z.string().min(1),
  titulo: z.string().min(1).max(250),
  resumo: z.string().max(500).optional(),
  url: z.string().url(),
  fonte: z.string().min(1).max(150),
  embedHtml: z.string().max(6000).optional(),
  embedThumbnail: z.string().url().optional(),
})

export interface NoticiaAprovadaItem {
  id: string
  titulo: string
  resumo: string | null
  url: string
  fonte: string
  embedHtml: string | null
  embedThumbnail: string | null
  publicadoEm: Date | null
}

export async function getNoticiasAprovadas(afiliacaoId: string): Promise<NoticiaAprovadaItem[]> {
  const parsed = getNoticiasSchema.safeParse({ afiliacaoId })
  if (!parsed.success) return []

  const noticias: NoticiaAprovadaItem[] = await db.noticia.findMany({
    where: { afiliacaoId: parsed.data.afiliacaoId, status: 'APROVADA' },
    orderBy: [{ publicadoEm: 'desc' }, { criadoEm: 'desc' }],
    select: {
      id: true,
      titulo: true,
      resumo: true,
      url: true,
      fonte: true,
      embedHtml: true,
      embedThumbnail: true,
      publicadoEm: true,
    },
    take: 20,
  })

  return noticias
}

export async function ingestNoticiaRascunho(input: {
  afiliacaoId: string
  titulo: string
  resumo?: string
  url: string
  fonte: string
  embedHtml?: string
  embedThumbnail?: string
}): Promise<Noticia> {
  const parsed = ingestSchema.safeParse(input)
  if (!parsed.success) throw new Error('Payload de notícia inválido')

  const data = parsed.data
  return db.noticia.upsert({
    where: { afiliacaoId_url: { afiliacaoId: data.afiliacaoId, url: data.url } },
    update: {
      titulo: data.titulo,
      resumo: data.resumo,
      fonte: data.fonte,
      embedHtml: data.embedHtml,
      embedThumbnail: data.embedThumbnail,
      status: 'RASCUNHO' satisfies StatusNoticia,
      publicadoEm: null,
      curadoPorId: null,
    },
    create: {
      afiliacaoId: data.afiliacaoId,
      titulo: data.titulo,
      resumo: data.resumo,
      url: data.url,
      fonte: data.fonte,
      embedHtml: data.embedHtml,
      embedThumbnail: data.embedThumbnail,
      status: 'RASCUNHO',
    },
  })
}
