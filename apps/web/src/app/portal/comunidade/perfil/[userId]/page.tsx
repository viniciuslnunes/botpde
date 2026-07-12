import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getVisibleTenantIds } from '@/lib/hierarquia'
import { canFollowUser, getOrCreatePerfilMembro, getSeguimentoStatus } from '@/lib/social'
import {
  getAtividadeDoAutor,
  getContagensSeguimento,
  getFotosDoAutor,
  podeVerConteudoSocial,
  resolverAvatarSocial,
  segueMutuamente,
} from '@/lib/perfil-social'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { PerfilMensagemActions } from '@/components/portal/perfil-mensagem-actions'
import { PerfilHeader } from '@/components/portal/perfil/perfil-header'
import { PerfilStats } from '@/components/portal/perfil/perfil-stats'
import { PerfilTabs, type PerfilAba } from '@/components/portal/perfil/perfil-tabs'
import { PerfilSobre } from '@/components/portal/perfil/perfil-sobre'
import { PerfilEditarForm } from '@/components/portal/perfil/perfil-editar-form'
import { PerfilFotosGrid } from '@/components/portal/perfil/perfil-fotos-grid'
import { PerfilAtividadeList } from '@/components/portal/perfil/perfil-atividade-list'
import { PerfilDestaques } from '@/components/portal/perfil/perfil-destaques'
import { postInclude, projetarPost, getDestaquesPerfil, type PostRaw, type PostSocialItem } from '@/lib/feed'
import { db } from '@torcida/db'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Perfil da Comunidade' }

const ABAS_VALIDAS: PerfilAba[] = ['sobre', 'publicacoes', 'fotos', 'atividade']

export default async function PerfilComunidadePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ aba?: string }>
}) {
  const [{ userId }, { aba: abaRaw }, session, tenant] = await Promise.all([
    params,
    searchParams,
    auth(),
    getTenantFromHost(),
  ])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const aba: PerfilAba = ABAS_VALIDAS.includes(abaRaw as PerfilAba) ? (abaRaw as PerfilAba) : 'publicacoes'

  const [user, membro, socio] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, nome: true, avatarUrl: true, email: true, criadoEm: true },
    }),
    db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      select: {
        nome: true,
        idade: true,
        telefone: true,
        cidade: true,
        discordTag: true,
        tipo: true,
        status: true,
        criadoEm: true,
        sede: { select: { nome: true } },
      },
    }),
    db.saasSocio.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      select: { numeroSocio: true, validade: true },
    }),
  ])

  if (!user) redirect('/portal/comunidade')

  const isSelf = session.user.id === userId
  const perfilAtual = isSelf
    ? await getOrCreatePerfilMembro(session.user.id, tenant.id)
    : await db.perfilMembro.findUnique({
        where: { userId_tenantId: { userId, tenantId: tenant.id } },
        select: {
          bio: true,
          perfilPrivado: true,
          avatarUrl: true,
          bannerUrl: true,
          bannerPos: true,
          exibirCidade: true,
          exibirSede: true,
          exibirDesde: true,
        },
      })

  const perfil = perfilAtual ?? {
    bio: null,
    perfilPrivado: true,
    avatarUrl: null,
    bannerUrl: null,
    bannerPos: null,
    exibirCidade: false,
    exibirSede: false,
    exibirDesde: true,
  }

  const [podeSeguir, statusSeguimento, podeVer, contagens, segueVoce] = isSelf
    ? [false, null, true, await getContagensSeguimento(userId, tenant.id), false]
    : await Promise.all([
        canFollowUser(session.user.id, userId, tenant.id),
        getSeguimentoStatus(session.user.id, userId),
        podeVerConteudoSocial(session.user.id, userId, tenant.id),
        getContagensSeguimento(userId, tenant.id),
        segueMutuamente(userId, session.user.id),
      ])

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

  const visibleTenantIds = await getVisibleTenantIds(tenant.id, 'comunidade')
  const avatarUrl = resolverAvatarSocial(perfil.avatarUrl, user.avatarUrl)

  const posts: PostSocialItem[] = podeVer
    ? ((await db.post.findMany({
        where: {
          autorId: userId,
          tipo: 'MEMBRO',
          oculto: false,
          tenantId: { in: visibleTenantIds },
        },
        orderBy: [{ fixado: 'desc' }, { criadoEm: 'desc' }],
        take: 30,
        include: postInclude(session.user.id),
      })) as PostRaw[]).map(projetarPost)
    : []

  const [fotos, atividade, destaques] = podeVer
    ? await Promise.all([
        getFotosDoAutor(userId, tenant.id, visibleTenantIds),
        getAtividadeDoAutor(userId, visibleTenantIds),
        getDestaquesPerfil(userId, tenant.id, session.user.id),
      ])
    : [[], [], []]

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: session.user.image ?? null,
  }

  const acoes = !isSelf ? (
    <>
      {podeSeguir && <SeguimentoButtons userId={userId} status={statusSeguimento} />}
      {mensageriaDisponivel && (
        <PerfilMensagemActions
          userId={userId}
          podeConversar={podeSeguir}
          bloqueadoPorMim={bloqueadoPorMim}
        />
      )}
    </>
  ) : undefined

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/portal/comunidade"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>

      <PerfilHeader
        nome={user.nome}
        avatarUrl={avatarUrl}
        bannerUrl={perfil.bannerUrl}
        bannerPos={perfil.bannerPos}
        perfilPrivado={perfil.perfilPrivado}
        tenantNome={tenant.nome}
        segueVoce={segueVoce}
        isSelf={isSelf}
        acoes={acoes}
      />

      <PerfilStats
        userId={userId}
        publicacoes={contagens.publicacoes}
        seguidores={contagens.seguidores}
        seguindo={contagens.seguindo}
        podeVerRede={podeVer}
      />

      {(destaques.length > 0 || isSelf) && podeVer && (
        <PerfilDestaques
          destaques={destaques}
          posts={posts}
          isSelf={isSelf}
          userId={userId}
          autorNome={user.nome}
        />
      )}

      <PerfilTabs userId={userId} abaAtiva={aba} />

      {!podeVer && aba !== 'sobre' ? (
        <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Este perfil é privado. Envie uma solicitação para seguir.
        </div>
      ) : (
        <>
          {aba === 'sobre' && (
            <>
              {isSelf && (
                <PerfilEditarForm
                  bio={perfil.bio ?? ''}
                  perfilPrivado={perfil.perfilPrivado}
                  exibirCidade={perfil.exibirCidade}
                  exibirSede={perfil.exibirSede}
                  exibirDesde={perfil.exibirDesde}
                  bannerUrl={perfil.bannerUrl}
                  bannerPos={perfil.bannerPos}
                  avatarUrl={perfil.avatarUrl}
                  avatarFallback={user.avatarUrl}
                />
              )}
              <PerfilSobre
                isSelf={isSelf}
                bio={perfil.bio}
                exibirCidade={perfil.exibirCidade}
                exibirSede={perfil.exibirSede}
                exibirDesde={perfil.exibirDesde}
                cidade={membro?.cidade ?? null}
                sedeNome={membro?.sede?.nome ?? null}
                membroDesde={membro?.criadoEm ?? user.criadoEm}
                email={isSelf ? user.email : null}
                tipoMembro={membro?.tipo ?? null}
                numeroSocio={isSelf ? (socio?.numeroSocio ?? null) : null}
                validadeSocio={isSelf ? (socio?.validade ?? null) : null}
                membroForm={{
                  nome: membro?.nome ?? user.nome ?? '',
                  idade: membro?.idade,
                  telefone: membro?.telefone,
                  cidade: membro?.cidade,
                  discordTag: membro?.discordTag,
                  temMembro: !!membro,
                }}
              />
            </>
          )}

          {aba === 'publicacoes' && (
            <section className="space-y-4">
              {posts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
                  Nenhum post publicado por enquanto.
                </div>
              ) : (
                posts.map((post) => (
                  <FeedPostCard
                    key={post.id}
                    post={post}
                    showTenantBadge={post.tenantId !== tenant.id}
                    currentUser={currentUser}
                    isAuthor={isSelf}
                  />
                ))
              )}
            </section>
          )}

          {aba === 'fotos' && <PerfilFotosGrid fotos={fotos} />}
          {aba === 'atividade' && <PerfilAtividadeList itens={atividade} />}
        </>
      )}
    </div>
  )
}
