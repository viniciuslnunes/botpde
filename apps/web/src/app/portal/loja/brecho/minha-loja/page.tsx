import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { BRECHO_CATEGORIA, BRECHO_ANUNCIO_STATUS } from '@torcida/types'
import { resolverContextoBrecho } from '@/lib/brecho-escopo'
import { getMinhaLojaBrecho, listarMeusAnuncios } from '@/lib/brecho'
import { BrechoChrome, BrechoAviso } from '../_components/brecho-chrome'
import { BrechoLojaForm } from '../_components/brecho-loja-form'
import { BrechoAnuncioForm } from '../_components/brecho-anuncio-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minha loja no brechó' }

export default async function PortalBrechoMinhaLojaPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const ctx = await resolverContextoBrecho(session.user.id, session.user.email)
  if (!ctx) redirect('/portal/loja')

  const [loja, anuncios] = await Promise.all([getMinhaLojaBrecho(ctx), listarMeusAnuncios(ctx)])

  return (
    <div className="space-y-8">
      <BrechoChrome title="Minha loja" minhaLoja={Boolean(loja)} />
      <BrechoAviso />
      {loja?.congeladaEm ? (
        <p className="rounded-xl border border-[rgb(var(--color-warning)_/_0.4)] px-4 py-3 text-sm">
          Sua loja está suspensa pela equipe de Materiais. Você não pode anunciar até a reativação.
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-bold uppercase">Vitrine</h2>
        <BrechoLojaForm
          nome={loja?.nome ?? session.user.name ?? 'Minha loja'}
          bio={loja?.bio ?? ''}
          fotoUrl={loja?.fotoUrl ?? ''}
          capaUrl={loja?.capaUrl ?? ''}
        />
      </section>

      {loja && !loja.congeladaEm ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold uppercase">Novo anúncio</h2>
          <BrechoAnuncioForm />
        </section>
      ) : null}

      {anuncios.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold uppercase">Seus anúncios</h2>
          <ul className="space-y-2">
            {anuncios.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/portal/loja/brecho/${a.id}`}
                  className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] px-4 py-3"
                >
                  <span className="font-medium">{a.titulo}</span>
                  <span className="font-mono text-[11px] uppercase text-[rgb(var(--foreground-muted))]">
                    {BRECHO_CATEGORIA[a.categoria].label} · {BRECHO_ANUNCIO_STATUS[a.status].label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
