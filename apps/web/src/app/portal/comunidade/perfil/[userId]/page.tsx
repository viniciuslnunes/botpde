import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getVisibleTenantIds } from '@/lib/hierarquia'
import { canFollowUser, getOrCreatePerfilMembro, getSeguimentoStatus } from '@/lib/social'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { PerfilMensagemActions } from '@/components/portal/perfil-mensagem-actions'
import { atualizarPerfil } from '@/app/portal/comunidade/actions'
import { postInclude, projetarPost, type PostRaw, type PostSocialItem } from '@/lib/feed'
import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Perfil da Comunidade' }

export default async function PerfilComunidadePage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const [{ userId }, session, tenant] = await Promise.all([params, auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const [perfil, user] = await Promise.all([
    db.perfilMembro.findUnique({
      where: { userId_tenantId: { userId, tenantId: tenant.id } },
      select: { bio: true, perfilPrivado: true, atualizadoEm: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, nome: true, avatarUrl: true },
    }),
  ])

  if (!user) redirect('/portal/comunidade')

  const isSelf = session.user.id === userId
  const perfilAtual = isSelf
    ? await getOrCreatePerfilMembro(session.user.id, tenant.id)
    : perfil ?? { bio: null, perfilPrivado: true, atualizadoEm: new Date() }

  const [podeSeguir, statusSeguimento] = isSelf
    ? [false, null]
    : await Promise.all([
        canFollowUser(session.user.id, userId, tenant.id),
        getSeguimentoStatus(session.user.id, userId),
      ])

  // Best-effort: tabela de bloqueio pode não existir antes da migração da
  // mensageria — nesse caso o perfil abre sem os botões de conversa.
  let bloqueadoPorMim = false
  let mensageriaDisponivel = true
  if (!isSelf) {
    try {
      const bloqueio: { id: string } | null = await db.bloqueioUsuario.findUnique({
        where: {
          bloqueadorId_bloqueadoId: {
            bloqueadorId: session.user.id,
            bloqueadoId: userId,
          },
        },
        select: { id: true },
      })
      bloqueadoPorMim = bloqueio !== null
    } catch {
      mensageriaDisponivel = false
    }
  }

  const podeVerPosts =
    isSelf || perfilAtual.perfilPrivado === false || statusSeguimento === 'APROVADO'

  const visibleTenantIds = await getVisibleTenantIds(tenant.id, 'comunidade')
  const posts: PostSocialItem[] = podeVerPosts
    ? ((await db.post.findMany({
        where: {
          autorId: userId,
          tipo: 'MEMBRO',
          oculto: false,
          tenantId: { in: visibleTenantIds },
        },
        orderBy: [{ criadoEm: 'desc' }],
        take: 20,
        include: postInclude(session.user.id),
      })) as PostRaw[]).map(projetarPost)
    : []

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: session.user.image ?? null,
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/portal/comunidade"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>

      <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{user.nome ?? 'Membro'}</h1>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              {perfilAtual.perfilPrivado ? 'Perfil privado' : 'Perfil público'}
            </p>
          </div>
          {!isSelf && (
            <div className="flex flex-col items-end gap-2">
              {podeSeguir && (
                <SeguimentoButtons mode="follow" userId={userId} status={statusSeguimento} />
              )}
              {mensageriaDisponivel && (
                <PerfilMensagemActions
                  userId={userId}
                  podeConversar={podeSeguir}
                  bloqueadoPorMim={bloqueadoPorMim}
                />
              )}
            </div>
          )}
        </div>
        {perfilAtual.bio && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">{perfilAtual.bio}</p>
        )}
      </section>

      {isSelf && (
        <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Editar perfil social
          </h2>
          <form
            action={async (formData: FormData) => {
              'use server'
              await atualizarPerfil(
                String(formData.get('bio') ?? ''),
                formData.get('perfilPrivado') === 'on',
              )
            }}
            className="space-y-3"
          >
            <textarea
              name="bio"
              defaultValue={perfilAtual.bio ?? ''}
              maxLength={280}
              rows={3}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
              placeholder="Escreva sua bio para a comunidade."
            />
            <label className="flex items-center gap-2 text-sm text-[rgb(var(--foreground-muted))]">
              <input
                type="checkbox"
                name="perfilPrivado"
                defaultChecked={perfilAtual.perfilPrivado}
              />
              Perfil privado (aceita seguidores manualmente)
            </label>
            <button
              type="submit"
              className="rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Salvar perfil
            </button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Publicações
        </h2>
        {!podeVerPosts ? (
          <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-sm text-[rgb(var(--foreground-muted))]">
            Este perfil é privado. Envie uma solicitação para seguir.
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-sm text-[rgb(var(--foreground-muted))]">
            Nenhum post publicado por enquanto.
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                showTenantBadge={post.tenantId !== tenant.id}
                currentUser={currentUser}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
