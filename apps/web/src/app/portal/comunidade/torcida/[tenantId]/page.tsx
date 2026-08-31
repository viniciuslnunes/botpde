import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { getPostIdsSalvos, getPostsPublicosDoTenant } from '@/lib/feed'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { LogoImage } from '@/components/media/logo-image'
import { ComunidadePostsAnimated } from '../../_components/comunidade-posts-animated'
import { linhaSetorArquibancada, resolverSetorArquibancada } from '@/lib/setor-arquibancada'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Torcida — Comunidade' }

export default async function TorcidaComunidadePublicaPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const { tenantId: targetTenantId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) redirect('/portal/comunidade?escopo=nacional')

  const [perfil, salvoIds, setor] = await Promise.all([
    getPostsPublicosDoTenant(targetTenantId, session.user.id, tenant.id),
    getPostIdsSalvos(session.user.id, tenant.id),
    resolverSetorArquibancada(targetTenantId),
  ])
  if (!perfil) notFound()

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
  }

  const { logoUrl } = perfil.tenant

  return (
    <div className="space-y-4">
      <Link
        href="/portal/comunidade"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>

      <header
        className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
        style={{ borderTopColor: perfil.tenant.corPrimaria, borderTopWidth: 3 }}
      >
        <div className="flex items-start gap-4 p-4">
          {logoUrl ? (
            <LogoImage
              src={logoUrl}
              alt=""
              size={64}
              className="h-16 w-16 shrink-0 object-contain"
            />
          ) : (
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white"
              style={{ backgroundColor: perfil.tenant.corPrimaria }}
            >
              {perfil.tenant.nome.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
              Publicações públicas
            </p>
            <h1 className="text-xl font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
              {perfil.tenant.nome}
            </h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">@{perfil.tenant.slug}</p>
            {linhaSetorArquibancada(setor) ? (
              <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
                {linhaSetorArquibancada(setor)}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Sem posts restritos a sócio desta torcida.
            </p>
          </div>
        </div>
      </header>

      <ComunidadePostsAnimated
        posts={perfil.posts}
        currentUser={currentUser}
        tenantId={tenant.id}
        salvoIds={salvoIds}
        showTenantBadge="auto"
        emptyTitle="Nenhuma publicação pública ainda."
        emptyDescription="Esta torcida ainda não tem posts visíveis sem restrição a sócio."
      />
    </div>
  )
}
