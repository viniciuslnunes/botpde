import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import {
  getCanalPorId,
  getPostsDoCanal,
  podePublicarNoCanal,
  resolverChromeCanalMural,
} from '@/lib/canais'
import { getPostIdsSalvos, podeVerFeedSocios } from '@/lib/feed'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { calculateEffectivePermissions } from '@torcida/types'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  carregarCanaisAbertosSocio,
  lerIdsCanaisAbertosSocio,
} from '@/lib/socio-canais-abertos'
import {
  carregarCanaisAbertosOperador,
  lerSlugsCanaisAbertosOperador,
} from '@/lib/operador-canais-abertos'
import { getComposerContext } from '../../_components/composer-context'
import { ComunidadeFeedShell } from '../../_components/comunidade-feed-shell'
import {
  CanalSoftMuralHost,
  CanalSoftSwitchProvider,
  type CanalSoftSwitchSeed,
} from '../../_components/canal-soft-switch'
import type { Metadata } from 'next'
import { db } from '@torcida/db'

export const metadata: Metadata = { title: 'Canal — Comunidade' }

export default async function CanalDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cursor?: string }>
}) {
  const { id } = await params
  const { cursor } = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const [ctx, avatarUrl] = await Promise.all([
    resolverContextoComunidade(session.user.id, session.user.email),
    getAvatarAtualDoUsuario(session.user.id),
  ])
  if (!ctx) redirect('/')

  const torcidaReal = ctx.torcidaReal ?? (ctx.modo === 'torcida' ? ctx.tenant : null)
  if (!torcidaReal) redirect('/portal/comunidade?escopo=nacional')

  const viewerTenantId = torcidaReal.id
  const superAdmin = isSuperAdminEmail(session.user.email)

  const [permsRaw, canal, idsTematicos, slugsOperador] = await Promise.all([
    getUserPermissionsInTenant(session.user.id, viewerTenantId),
    getCanalPorId(id, viewerTenantId, session.user.id),
    superAdmin ? Promise.resolve([] as string[]) : lerIdsCanaisAbertosSocio(),
    superAdmin ? lerSlugsCanaisAbertosOperador() : Promise.resolve([] as string[]),
  ])
  if (!canal) notFound()

  const permissoes = calculateEffectivePermissions(permsRaw.rolePermissions, permsRaw.overrides)

  const [podePublicarGate, ehSocio, canaisTematicosAbertos, canaisAbertos, chromeFlags, composerCtx, tenantRow] =
    await Promise.all([
      podePublicarNoCanal(canal, viewerTenantId, permissoes),
      podeVerFeedSocios(session.user.id, viewerTenantId),
      superAdmin
        ? Promise.resolve([] as Awaited<ReturnType<typeof carregarCanaisAbertosSocio>>)
        : carregarCanaisAbertosSocio(idsTematicos, session.user.id, viewerTenantId),
      superAdmin
        ? carregarCanaisAbertosOperador(slugsOperador)
        : Promise.resolve([] as Awaited<ReturnType<typeof carregarCanaisAbertosOperador>>),
      resolverChromeCanalMural(canal, viewerTenantId, permissoes),
      getComposerContext(viewerTenantId, session.user.id, session.user.name ?? null),
      db.tenant.findUnique({ where: { id: viewerTenantId }, select: { nome: true } }),
    ])

  const podePublicar = ehSocio && podePublicarGate

  const tematicosNaBarra =
    !superAdmin && !canal.canalOficial
      ? (() => {
          if (canaisTematicosAbertos.some((c) => c.id === canal.id)) {
            return canaisTematicosAbertos
          }
          return [
            ...canaisTematicosAbertos,
            {
              id: canal.id,
              nome: canal.nome?.trim() || 'Canal',
              avatarUrl: canal.avatarUrl,
            },
          ]
        })()
      : canaisTematicosAbertos

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl,
  }

  const atualSlug = ctx.modo === 'torcida' ? ctx.tenant.slug : null
  const slugTorcida = torcidaReal.slug ?? null
  const slugUnidade = ctx.unidade?.tenantSlug ?? null

  const [feed, salvoIds] = canal.souMembro
    ? await Promise.all([
        getPostsDoCanal(canal.id, viewerTenantId, session.user.id, {
          cursor,
          take: 20,
          incluirFeedInterno: canal.canalOficial,
          viewerTenantId,
        }),
        getPostIdsSalvos(session.user.id, viewerTenantId),
      ])
    : [
        { posts: [], pageInfo: { hasMore: false, nextCursor: null as string | null } },
        new Set<string>(),
      ]

  const softSeed: CanalSoftSwitchSeed = {
    chrome: {
      canal,
      podePublicar,
      podeCompartilhar: ehSocio,
      ...chromeFlags,
    },
    currentUser,
    viewerTenantId,
    tenantNome: tenantRow?.nome ?? torcidaReal.nome,
    composerNome: composerCtx.nome,
    composerPerfilPrivado: composerCtx.perfilPrivado,
    salvoIds: [...salvoIds],
    initialPosts: feed.posts,
    initialPageInfo: feed.pageInfo,
    seedCanalId: canal.id,
  }

  return (
    <CanalSoftSwitchProvider seed={softSeed}>
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <ComunidadeFeedShell
          tenant={{
            id: viewerTenantId,
            nome: torcidaReal.nome,
            afiliacaoId: torcidaReal.afiliacaoId,
            balancoFinanceiroVisivel: torcidaReal.balancoFinanceiroVisivel,
          }}
          currentUser={currentUser}
          filtro="canal"
          escopo="torcida"
          escopos={ctx.escopos}
          nomeUnidade={ctx.unidade?.nome ?? null}
          logoUnidade={ctx.unidade?.logoUrl ?? null}
          modoContexto={ctx.modo}
          afiliacao={ctx.afiliacao}
          torcidaReal={torcidaReal}
          slugTorcida={slugTorcida}
          slugUnidade={slugUnidade}
          atualSlug={atualSlug}
          superAdmin={superAdmin}
          canaisAbertos={canaisAbertos}
          canaisTematicosAbertos={tematicosNaBarra}
          canalAtivoId={!canal.canalOficial ? canal.id : null}
          renderConteudoCanal={({ busca }) => <CanalSoftMuralHost buscaChrome={busca} />}
        />
      </div>
    </CanalSoftSwitchProvider>
  )
}
