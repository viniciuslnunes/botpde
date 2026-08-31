import { redirect } from 'next/navigation'
import { Newspaper } from 'lucide-react'
import { ComunidadePageHeader } from '../../_components/comunidade-page-header'
import { PublicarArtigoForm } from '../../_components/praca-forms'
import { exigirContextoPraca } from '../../_lib/praca-page'
import { podePublicarArtigoNoTenant } from '@/lib/praca'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Novo artigo — Comunidade' }

export default async function NovoArtigoPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string }>
}) {
  const params = await searchParams
  const { session, escopo, ancora, sufixo } = await exigirContextoPraca(params.escopo)
  if (escopo === 'nacional' || !ancora.tenantId) {
    redirect(`/portal/comunidade/noticias${sufixo}`)
  }
  const pode = await podePublicarArtigoNoTenant(session.user.id, ancora.tenantId)
  if (!pode) redirect(`/portal/comunidade/noticias${sufixo}`)

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Newspaper}
        titulo="Novo artigo"
        subtitulo="Texto próprio desta torcida ou unidade — não republica imprensa"
        voltarHref={`/portal/comunidade/noticias${sufixo}`}
      />
      <PublicarArtigoForm escopo={escopo} />
    </div>
  )
}
