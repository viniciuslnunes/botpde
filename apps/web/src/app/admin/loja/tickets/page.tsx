import { permanentRedirect } from 'next/navigation'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminLojaTicketsRedirect({ searchParams }: Props) {
  const params = await searchParams
  const sp = new URLSearchParams()
  sp.set('v', 'arquivo')
  const filtro = firstParam(params.filtro)
  const busca = firstParam(params.q)
  const pagina = firstParam(params.pagina)
  if (filtro) sp.set('filtro', filtro)
  if (busca) sp.set('q', busca)
  if (pagina) sp.set('pagina', pagina)
  permanentRedirect(`/admin/loja/atendimento?${sp.toString()}`)
}
