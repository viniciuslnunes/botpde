import { permanentRedirect } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function qsFrom(searchParams: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      for (const v of value) q.append(key, v)
    } else {
      q.set(key, value)
    }
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Alias estável: detalhe canônico permanece em `/admin/eventos/[id]`. */
export default async function AdminCaravanaAliasPage({ params, searchParams }: Props) {
  const { id } = await params
  const qs = qsFrom(await searchParams)
  permanentRedirect(`/admin/eventos/${id}${qs}`)
}
