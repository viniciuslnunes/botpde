import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { BRECHO_PAGE_SIZE, nomeExibicaoVendedorBrecho } from '@torcida/types'
import { resolverContextoBrecho } from '@/lib/brecho-escopo'
import { getMinhaLojaBrecho, listarLojasBrecho } from '@/lib/brecho'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { Store } from 'lucide-react'
import { BrechoChrome } from '../_components/brecho-chrome'
import { BrechoHubCard } from '../../_components/brecho-hub-card'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Lojas do brechó' }

export default async function PortalBrechoLojasPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; pagina?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const ctx = await resolverContextoBrecho(session.user.id, session.user.email)
  if (!ctx) redirect('/portal/loja')

  const params = await searchParams
  const sort = params.sort === 'recentes' ? 'recentes' : 'confiaveis'
  const pagina = Math.max(1, Number(params.pagina ?? '1') || 1)
  const [{ lojas, total }, minha] = await Promise.all([
    listarLojasBrecho(ctx, { sort, pagina }),
    getMinhaLojaBrecho(ctx),
  ])
  const totalPaginas = Math.max(1, Math.ceil(total / BRECHO_PAGE_SIZE))

  return (
    <div className="space-y-6">
      <BrechoChrome
        title="Pessoas confiáveis"
        description="Quanto mais trocas confirmadas pelos dois lados — e com gente diferente — mais a loja sobe no ranking. Abra a vitrine para ver os anúncios."
        minhaLoja={Boolean(minha)}
      />

      <div className="flex gap-2 font-mono text-[11px] uppercase tracking-wider">
        <Link
          href="/portal/loja/brecho/lojas?sort=confiaveis"
          className={sort === 'confiaveis' ? 'text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground-muted))]'}
        >
          Confiáveis
        </Link>
        <Link
          href="/portal/loja/brecho/lojas?sort=recentes"
          className={sort === 'recentes' ? 'text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground-muted))]'}
        >
          Recentes
        </Link>
      </div>

      {lojas.length === 0 ? (
        <MotionEmptyState
          icon={<Store className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhuma loja ainda"
          description="Seja o primeiro sócio a abrir uma vitrine no brechó."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lojas.map((loja) => {
            const nomePessoa = nomeExibicaoVendedorBrecho({
              nome: loja.user.nome,
              nickname: loja.user.nickname,
              lojaNome: loja.nome,
            })
            return (
              <BrechoHubCard
                key={loja.id}
                nome={loja.nome}
                anunciosAtivos={loja.anunciosAtivos}
                subtitulo={nomePessoa}
                logoUrl={loja.fotoUrl ?? loja.user.avatarUrl}
                capaUrl={loja.capaUrl}
                capaExibicao={loja.capaExibicao}
                href={`/portal/loja/brecho/lojas/${loja.userId}`}
                podeGerir={loja.userId === session.user.id}
                confianca={{ estrelas: loja.estrelas, trocas: loja.trocasConcluidas }}
              />
            )
          })}
        </div>
      )}

      {totalPaginas > 1 ? (
        <p className="text-center font-mono text-sm">
          {pagina}/{totalPaginas}
        </p>
      ) : null}
    </div>
  )
}
