import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { auth } from '@/lib/auth'
import { resolvePerfilTenantForUser } from '@/lib/resolve-perfil-tenant'
import { hrefAdminPessoa } from '@/lib/perfil-admin-href'
import { getActiveTenant, getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { getVisibleTenantIds } from '@/lib/hierarquia'
import { canFollowUser, getSeguimentoStatus, segueVoce as usuarioSegueVoce } from '@/lib/social'
import { podeVerPerfilComunidade } from '@/lib/perfil-visibilidade'
import { avaliarAcessoDm } from '@/lib/mensageria'
import { resolveTenantContextoDm } from '@/lib/mensageria-api'
import {
  getAtividadeDoAutor,
  getAvatarAtualDoUsuario,
  getContagensSeguimento,
  getFotosDoAutor,
  podeVerConteudoSocial,
  resolverAvatarSocial,
  resolverPerfilPrivadoEfetivo,
  resolverTituloPerfilSocial,
  torcedorAprovadoPublicoObrigatorio,
} from '@/lib/perfil-social'
import { ComunidadePostsAnimated } from '../../_components/comunidade-posts-animated'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { PerfilMensagemActions } from '@/components/portal/perfil-mensagem-actions'
import { PerfilAdminLink } from '@/components/portal/perfil/perfil-admin-link'
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
import {
  calculateEffectivePermissions,
  hasPermission,
  labelNivelConfianca,
  PERMISSIONS,
  progressoProximoNivel,
} from '@torcida/types'
import { resolverNivelConfianca } from '@/lib/confianca'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Perfil da Comunidade' }

export const dynamic = 'force-dynamic'

const ABAS_VALIDAS: PerfilAba[] = ['sobre', 'publicacoes', 'fotos', 'atividade']

const perfilSelect = {
  bio: true,
  perfilPrivado: true,
  bannerUrl: true,
  bannerPos: true,
  exibirCidade: true,
  exibirSede: true,
  exibirDesde: true,
  exibirNumeroSocioNoFeed: true,
  memoriaPresencaVisivel: true,
} as const

export default async function PerfilComunidadePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ aba?: string }>
}) {
  noStore()
  const [{ userId }, { aba: abaRaw }, session] = await Promise.all([
    params,
    searchParams,
    auth(),
  ])
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await resolvePerfilTenantForUser(userId, session.user.id)
  if (!tenant) redirect('/portal')

  const viewerTenant = await getActiveTenant(session.user.id, session.user.email)
  if (
    session.user.id !== userId &&
    !(await podeVerPerfilComunidade(session.user.id, userId, tenant.id, viewerTenant?.id ?? null))
  ) {
    notFound()
  }

  const aba: PerfilAba = ABAS_VALIDAS.includes(abaRaw as PerfilAba) ? (abaRaw as PerfilAba) : 'publicacoes'

  const mesmoTenantViewer = Boolean(viewerTenant && viewerTenant.id === tenant.id)
  type MembroAdminLite = { id: string }

  const [user, membro, socio, afiliacao, membroViewer] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, nome: true, nickname: true, avatarUrl: true, email: true, criadoEm: true },
    }),
    db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      select: {
        id: true,
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
    tenant.afiliacaoId
      ? db.afiliacao.findUnique({
          where: { id: tenant.afiliacaoId },
          select: { nome: true, apelido: true },
        })
      : Promise.resolve(null),
    mesmoTenantViewer || !viewerTenant
      ? Promise.resolve(null as MembroAdminLite | null)
      : (db.saasMembro.findUnique({
          where: { tenantId_userId: { tenantId: viewerTenant.id, userId } },
          select: { id: true },
        }) as Promise<MembroAdminLite | null>),
  ])

  if (!user) redirect('/portal/comunidade')

  const membroAdmin: MembroAdminLite | null = mesmoTenantViewer
    ? membro
      ? { id: membro.id }
      : null
    : membroViewer

  const superAdmin = isSuperAdminEmail(session.user.email)
  let podeVerFicha = superAdmin
  if (!podeVerFicha && viewerTenant && session.user.id && membroAdmin) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      viewerTenant.id,
    )
    podeVerFicha = hasPermission(
      calculateEffectivePermissions(rolePermissions, overrides),
      PERMISSIONS.MEMBERS_VIEW,
    )
  }
  const hrefAdmin = hrefAdminPessoa({
    membroId: podeVerFicha ? (membroAdmin?.id ?? null) : null,
    userId,
    superAdmin,
  })

  const isSelf = session.user.id === userId
  const [perfilAtual, confianca] = await Promise.all([
    db.perfilMembro.findUnique({
      where: { userId_tenantId: { userId, tenantId: tenant.id } },
      select: perfilSelect,
    }),
    tenant.sintetico ? Promise.resolve(null) : resolverNivelConfianca(userId, tenant.id),
  ])
  const nivelLabel = confianca ? labelNivelConfianca(confianca.nivel) : null
  const progressoNivel =
    isSelf && confianca ? progressoProximoNivel(confianca.score, confianca.nivel) : null

  // Torcedor global vive no tenant sintético da CN sem SaasMembro — trata como
  // TORCEDOR para título (apelido do clube) e privacidade pública obrigatória.
  const vinculo = membro
    ? { tipo: membro.tipo, status: membro.status }
    : tenant.sintetico
      ? { tipo: 'TORCEDOR' as const, status: 'APROVADO' as const }
      : null
  const tenantNomeExibicao = resolverTituloPerfilSocial({
    tipoMembro: vinculo?.tipo ?? null,
    tenantNome: tenant.nome,
    afiliacaoApelido: afiliacao?.apelido ?? null,
    afiliacaoNome: afiliacao?.nome ?? null,
  })
  const perfilBase = perfilAtual ?? {
    bio: null,
    perfilPrivado: vinculo?.tipo === 'SOCIO',
    bannerUrl: null,
    bannerPos: null,
    exibirCidade: false,
    exibirSede: false,
    exibirDesde: true,
    exibirNumeroSocioNoFeed: true,
    memoriaPresencaVisivel: false,
  }
  const perfilPrivadoEfetivo = resolverPerfilPrivadoEfetivo(perfilBase.perfilPrivado, vinculo)
  const privacidadeBloqueada = torcedorAprovadoPublicoObrigatorio(vinculo)
  const perfil = { ...perfilBase, perfilPrivado: perfilPrivadoEfetivo }

  const dmTenantContexto = await resolveTenantContextoDm(session.user.id, session.user.email)
  // Mesmo critério de `solicitarSeguir`: tenant ATIVO do viewer (não o do
  // perfil). Usar o tenant do perfil mostrava "Seguir" e a action negava → 500.

  const [podeSeguir, statusSeguimento, podeVer, contagens, segueVoceBadge, acessoDm] = isSelf
    ? [false, null, true, await getContagensSeguimento(userId, tenant.id), false, 'bloqueado' as const]
    : await Promise.all([
        canFollowUser(session.user.id, userId, viewerTenant?.id ?? null),
        getSeguimentoStatus(session.user.id, userId),
        podeVerConteudoSocial(session.user.id, userId, tenant.id),
        getContagensSeguimento(userId, tenant.id),
        usuarioSegueVoce(session.user.id, userId),
        // Mesmo critério do POST /api/conversas (contexto do viewer, não do perfil).
        avaliarAcessoDm(session.user.id, userId, dmTenantContexto),
      ])

  const podeConversarDireto = acessoDm === 'direto'
  const podeSolicitarMensagem = acessoDm === 'solicitacao'

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
  const avatarUrl = resolverAvatarSocial(user.avatarUrl)

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
    avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
  }

  const temAcoesSociais =
    !isSelf &&
    (podeSeguir ||
      (mensageriaDisponivel && (podeConversarDireto || podeSolicitarMensagem)))
  const acoes =
    hrefAdmin || temAcoesSociais ? (
      <>
        {hrefAdmin ? <PerfilAdminLink href={hrefAdmin} /> : null}
        {!isSelf && podeSeguir && (
          <SeguimentoButtons userId={userId} status={statusSeguimento} />
        )}
        {!isSelf &&
          mensageriaDisponivel &&
          (podeConversarDireto || podeSolicitarMensagem) && (
            <PerfilMensagemActions
              userId={userId}
              podeConversar={podeConversarDireto}
              podeSolicitarMensagem={podeSolicitarMensagem}
              bloqueadoPorMim={bloqueadoPorMim}
            />
          )}
      </>
    ) : undefined

  return (
    <div className="space-y-4">
      <Link
        href="/portal/comunidade"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>

      <PerfilHeader
        nome={user.nome}
        nickname={user.nickname}
        avatarUrl={avatarUrl}
        bannerUrl={perfil.bannerUrl}
        bannerPos={perfil.bannerPos}
        perfilPrivado={perfil.perfilPrivado}
        tenantNome={tenantNomeExibicao}
        segueVoce={segueVoceBadge}
        isSelf={isSelf}
        acoes={acoes}
        nivelLabel={nivelLabel}
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
                  tenantId={tenant.id}
                  bio={perfil.bio ?? ''}
                  perfilPrivado={perfil.perfilPrivado}
                  privacidadeBloqueada={privacidadeBloqueada}
                  exibirCidade={perfil.exibirCidade}
                  exibirSede={perfil.exibirSede}
                  exibirDesde={perfil.exibirDesde}
                  exibirNumeroSocioNoFeed={perfil.exibirNumeroSocioNoFeed}
                  memoriaPresencaVisivel={perfil.memoriaPresencaVisivel}
                  mostrarPresencaMemoria={!tenant.sintetico}
                  temNumeroSocio={socio?.numeroSocio != null}
                  bannerUrl={perfil.bannerUrl}
                  bannerPos={perfil.bannerPos}
                  avatarUrl={null}
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
                membroDesde={membro?.criadoEm ?? null}
                email={isSelf ? user.email : null}
                tipoMembro={vinculo?.tipo ?? null}
                numeroSocio={isSelf ? (socio?.numeroSocio ?? null) : null}
                validadeSocio={isSelf ? (socio?.validade ?? null) : null}
                membroForm={{
                  nome: membro?.nome ?? user.nome ?? '',
                  nickname: user.nickname,
                  idade: membro?.idade,
                  telefone: membro?.telefone,
                  cidade: membro?.cidade,
                  discordTag: membro?.discordTag,
                  temMembro: !!membro,
                }}
                progressoNivel={progressoNivel}
              />
            </>
          )}

          {aba === 'publicacoes' && (
            <ComunidadePostsAnimated
              posts={posts}
              currentUser={currentUser}
              tenantId={tenant.id}
              showTenantBadge="auto"
              isAuthor={isSelf}
              emptyTitle="Nenhum post publicado por enquanto."
            />
          )}

          {aba === 'fotos' && <PerfilFotosGrid fotos={fotos} />}
          {aba === 'atividade' && <PerfilAtividadeList itens={atividade} />}
        </>
      )}
    </div>
  )
}
