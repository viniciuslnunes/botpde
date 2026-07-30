import { permanentRedirect } from 'next/navigation'

/**
 * Cobranças virou etapa de `/admin/financeiro`. A rota antiga sobrevive como
 * redirect porque notificações já gravadas no banco (`COBRANCA_VENCIDA`)
 * apontam para cá com `?status=VENCIDA` — e links antigos ficam válidos.
 */
export default async function CobrancasLegadoPage({
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
  const qs = query.toString()
  permanentRedirect(`/admin/financeiro/cobrancas${qs ? `?${qs}` : ''}`)
}
