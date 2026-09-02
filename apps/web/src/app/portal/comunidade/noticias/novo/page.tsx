import { redirect } from 'next/navigation'
import { exigirContextoPraca } from '../../_lib/praca-page'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nova notícia — Comunidade' }

/** Composer abre na lista com `?criar=1`, igual o fórum com `?aba=novo`. */
export default async function NovoArtigoPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string }>
}) {
  const params = await searchParams
  const { sufixo } = await exigirContextoPraca(params.escopo)
  redirect(`/portal/comunidade/noticias${sufixo}&criar=1`)
}
