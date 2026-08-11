import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import {
  getCanalOficialDaSede,
  getCanalLeituraDireta,
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
import { getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import {
  idsCanaisHierarquiaFixosNaBarra,
  ordemArrastavelSemFixos,
  slugsHierarquiaFixos,
  temUnidadeFixaOperador,
} from '@/lib/operador-canais-ordem'
import { resolverOrdemBarraMovel } from '@/lib/comunidade-barra-movel-cookie'
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
  if (!ctx) {
    if (isSuperAdminEmail(session.user.email)) redirect('/super-admin/torcidas')
    redirect('/onboarding')
  }

  const torcidaReal = ctx.torcidaReal ?? (ctx.modo === 'torcida' ? ctx.tenant : null)
  if (!torcidaReal) redirect('/portal/comunidade?escopo=nacional')

  const viewerTenantId = torcidaReal.id
  const superAdmin = isSuperAdminEmail(session.user.email)
  const operador = ctx.modo === 'torcida' && Boolean(ctx.operador)

  const [permsRaw, canal, idsVisitados, slugsOperador] = await Promise.all([
    getUserPermissionsInTenant(session.user.id, viewerTenantId),
    superAdmin || operador
      ? getCanalLeituraDireta(id, session.user.id)
      : getCanalPorId(id, viewerTenantId, session.user.id),
    lerIdsCanaisAbertosSocio(),
    superAdmin ? lerSlugsCanaisAbertosOperador() : Promise.resolve([] as string[]),
  ])
  if (!canal) notFound()

  const permissoes = calculateEffectivePermissions(permsRaw.rolePermissions, permsRaw.overrides)

  const atualSlug = ctx.modo === 'torcida' ? ctx.tenant.slug : null
  const slugTorcida = torcidaReal.slug ?? null
  const slugUnidade = ctx.unidade?.tenantSlug ?? null

  const oficialSedeEarly = await getCanalOficialDaSede(torcidaReal.id, session.user.id, {
    leituraOperador: superAdmin || operador,
  })
  const idsHierarquiaFixos = idsCanaisHierarquiaFixosNaBarra({
    canalIdTorcida: oficialSedeEarly?.id ?? null,
    canalIdUnidade: ctx.unidade?.canalId ?? null,
    superAdmin,
    temEscopoUnidade: Boolean(ctx.escopos.unidade),
    slugUnidade,
    atualSlug,
  })

  const [podePublicarGate, ehSocio, canaisVisitados, canaisAbertos, chromeFlags, composerCtx, tenantRow] =
    await Promise.all([
      podePublicarNoCanal(canal, viewerTenantId, permissoes),
      podeVerFeedSocios(session.user.id, viewerTenantId),
      carregarCanaisAbertosSocio(
        idsVisitados,
        session.user.id,
        viewerTenantId,
        idsHierarquiaFixos,
        { leituraOperador: superAdmin || operador },
      ),
      superAdmin
        ? (async () => {
            const lineage = await getTorcidaLineageTenantIds(torcidaReal.id)
            return carregarCanaisAbertosOperador(slugsOperador, {
              excluirTenantIds: lineage,
            })
          })()
        : Promise.resolve([] as Awaited<ReturnType<typeof carregarCanaisAbertosOperador>>),
      resolverChromeCanalMural(canal, viewerTenantId, permissoes),
      getComposerContext(viewerTenantId, session.user.id, session.user.name ?? null),
      db.tenant.findUnique({ where: { id: viewerTenantId }, select: { nome: true } }),
    ])

  const podePublicar = !superAdmin && !operador && ehSocio && podePublicarGate

  const ehHierarquiaFixa = idsHierarquiaFixos.includes(canal.id)
  const tematicosNaBarra = !ehHierarquiaFixa
    ? (() => {
        if (canaisVisitados.some((c) => c.id === canal.id)) return canaisVisitados
        return [
          ...canaisVisitados,
          {
            id: canal.id,
            nome: canal.nome?.trim() || 'Canal',
            avatarUrl: canal.avatarUrl,
          },
        ]
      })()
    : canaisVisitados

  const slugsFixosBarra = slugsHierarquiaFixos({
    slugTorcida,
    slugUnidade,
    temTorcida: Boolean(slugTorcida),
    temUnidade: temUnidadeFixaOperador({
      superAdmin,
      temEscopoUnidade: Boolean(ctx.escopos.unidade),
      slugUnidade,
      atualSlug,
    }),
  })
  const ordemBarraMovelInicial = await resolverOrdemBarraMovel({
    slugsOperador: ordemArrastavelSemFixos(
      canaisAbertos.map((c) => c.slug),
      slugsFixosBarra,
    ),
    idsTematicos: tematicosNaBarra.map((c) => c.id),
  })

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl,
  }

  // Listagem / soft-switch: só posts do `conversaId`. Feed interno ("Só
  // torcida") fica nas abas Minha torcida/unidade — senão PDE Caso A no
  // tenant da Sede repete o mural da mãe em Taubaté, PP, etc.
  const [feed, salvoIds] = canal.souMembro || operador || superAdmin
    ? await Promise.all([
        getPostsDoCanal(canal.id, viewerTenantId, session.user.id, {
          cursor,
          take: 20,
          incluirFeedInterno: false,
          leituraOperador: operador || superAdmin,
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
      podeCompartilhar: !superAdmin && !operador && ehSocio,
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
          canalIdTorcida={oficialSedeEarly?.id ?? null}
          canalIdUnidade={
            temUnidadeFixaOperador({
              superAdmin,
              temEscopoUnidade: Boolean(ctx.escopos.unidade),
              slugUnidade,
              atualSlug,
            })
              ? (ctx.unidade?.canalId ?? null)
              : null
          }
          superAdmin={superAdmin}
          canaisAbertos={canaisAbertos}
          canaisTematicosAbertos={tematicosNaBarra}
          ordemBarraMovelInicial={ordemBarraMovelInicial}
          canalAtivoId={canal.id}
          renderConteudoCanal={({ busca }) => <CanalSoftMuralHost buscaChrome={busca} />}
        />
      </div>
    </CanalSoftSwitchProvider>
  )
}
