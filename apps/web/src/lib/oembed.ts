import { z } from 'zod'

const oembedSchema = z.object({
  title: z.string().optional(),
  html: z.string().optional(),
  thumbnail_url: z.string().url().optional(),
  provider_name: z.string().optional(),
})

export interface OEmbedMetadata {
  title: string | null
  html: string | null
  thumbnailUrl: string | null
  providerName: string | null
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.local')
    || host.startsWith('10.')
    || host.startsWith('192.168.')
    || host.startsWith('172.16.')
    || host.startsWith('172.17.')
    || host.startsWith('172.18.')
    || host.startsWith('172.19.')
    || host.startsWith('172.2')
    || host.startsWith('172.30.')
    || host.startsWith('172.31.')
  )
}

export async function fetchOEmbedMetadata(url: string): Promise<OEmbedMetadata | null> {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return null
  }

  if (!['http:', 'https:'].includes(target.protocol)) return null
  if (isPrivateHost(target.hostname)) return null

  const endpoint = new URL('https://noembed.com/embed')
  endpoint.searchParams.set('url', target.toString())

  const response = await fetch(endpoint.toString(), {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  }).catch(() => null)

  if (!response || !response.ok) return null

  const payload = await response.json().catch(() => null)
  const parsed = oembedSchema.safeParse(payload)
  if (!parsed.success) return null

  return {
    title: parsed.data.title ?? null,
    html: parsed.data.html ?? null,
    thumbnailUrl: parsed.data.thumbnail_url ?? null,
    providerName: parsed.data.provider_name ?? null,
  }
}
