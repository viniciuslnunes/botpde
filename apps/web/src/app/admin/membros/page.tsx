import { permanentRedirect } from 'next/navigation'

/**
 * Membros virou Torcedores (`/admin/torcedores`). Solicitações de sócio
 * ficam em `/admin/socios?status=solicitacoes`. Redirect 308 preserva query
 * (status, filtros, paginação) para links e notificações antigas.
 */
export default async function MembrosLegadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const query = new URLSearchParams()
  for (const [chave, valor] of Object.entries(sp)) {
    if (typeof valor === 'string') query.set(chave, valor)
    else if (Array.isArray(valor) && valor[0]) query.set(chave, valor[0])
  }
  // Fila de admissão de sócio migrou para o hub Sócios.
  if (query.get('status') === 'PENDENTE' && query.get('tipo') === 'SOCIO') {
    permanentRedirect('/admin/socios?status=solicitacoes')
  }
  // Torcedores abre em Todos — Pendentes só quando a aba/link pede explicitamente.
  if (query.get('status') === 'PENDENTE' && query.get('tipo') !== 'SOCIO') {
    query.delete('status')
  }
  const qs = query.toString()
  permanentRedirect(`/admin/torcedores${qs ? `?${qs}` : ''}`)
}
