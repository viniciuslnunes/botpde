import { redirect } from 'next/navigation'
import { exigirContextoPraca } from '../../_lib/praca-page'

export default async function NovoTopicoPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string }>
}) {
  const params = await searchParams
  const { sufixo } = await exigirContextoPraca(params.escopo)
  redirect(`/portal/comunidade/forum${sufixo}&aba=novo`)
}
