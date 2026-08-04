import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { resolverContextoComunidade, resolverEscopoComunidade, getTenantIdsPorAfiliacao } from '@/lib/comunidade-contexto'
import { ComunidadeFeedShell } from './_components/comunidade-feed-shell'
import { getSolicitacaoSocioPendente } from '@/lib/onboarding'
import { listSalasAtivas, listSalasNacionais } from '@/lib/salas'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { getCanalDaUnidadeDoVinculo, getCanalOficialDaSede, podePublicarNoCanal } from '@/lib/canais'
import { podeVerFeedSocios } from '@/lib/feed'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { calculateEffectivePermissions } from '@torcida/types'
import { CanalFeedView } from './canais/[id]/canal-feed-view'

export const metadata: Metadata = { title: 'Comunidade' }

/**
 * Page do feed: contexto + salas (cacheadas). Composer/card e posts
 * carregam sob Suspense — voltar de Buscar/Classificação pinta o shell cedo.
 * `?escopo=nacional|torcida` alterna o feed sem trocar de rota — sócio com
 * afiliação tem as duas abas; torcedor global fica preso ao Nacional
 * (`resolverEscopoComunidade`).
 */
export default async function ComunidadePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; eventoId?: string; escopo?: string }>
}) {
  const params = await searchParams
  const filtro =
    params.filtro === 'seguindo'
      ? 'seguindo'
      : params.filtro === 'grupos'
        ? 'grupos'
        : 'descobrir'
  const eventoIdComposer =
    typeof params.eventoId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      params.eventoId,
    )
      ? params.eventoId
      : undefined
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const [ctx, avatarUrl] = await Promise.all([
    resolverContextoComunidade(session.user.id, session.user.email),
    getAvatarAtualDoUsuario(session.user.id),
  ])
  if (!ctx) redirect('/')

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl,
  }

  const torcidaReal = ctx.torcidaReal ?? (ctx.modo === 'torcida' ? ctx.tenant : null)
  const atualSlug = ctx.modo === 'torcida' ? ctx.tenant.slug : null
  const slugTorcida = torcidaReal?.slug ?? null
  const slugUnidade = ctx.unidade?.tenantSlug ?? null

  // Caso B (tenant ativo já é a unidade) → default do feed é o mural dela, não
  // o da Sede. A regra vive em `resolverEscopoComunidadePorModo`, para o feed,
  // a navbar, o rail e as demais rotas da Comunidade responderem igual — quando
  // só o feed sabia disso, o header trocava de marca ao sair para /canais.
  const escopoDesejado = resolverEscopoComunidade(ctx, params.escopo)
  const escopo = escopoDesejado === 'nacional' && !ctx.afiliacao ? 'torcida' : escopoDesejado

  if (escopo === 'nacional' && ctx.afiliacao && ctx.tenantSintetico) {
    const afiliacao = ctx.afiliacao
    const [salasAtivas, solicitacaoPendente, tenantIdsClube] = await Promise.all([
      listSalasNacionais(afiliacao.id),
      getSolicitacaoSocioPendente(session.user.id),
      getTenantIdsPorAfiliacao(afiliacao.id),
    ])

    return (
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <ComunidadeFeedShell
          tenant={{
            id: ctx.tenantSintetico.id,
            nome: `${afiliacao.apelido || afiliacao.nome} — Comunidade Nacional`,
            afiliacaoId: afiliacao.id,
            balancoFinanceiroVisivel: false,
          }}
          currentUser={currentUser}
          filtro={filtro}
          clubeNacional={afiliacao}
          torcidasNacionalCount={tenantIdsClube.length}
          salasAtivas={salasAtivas}
          eventoIdInicial={eventoIdComposer}
          escopo="nacional"
          escopos={ctx.escopos}
          nomeUnidade={ctx.unidade?.nome ?? null}
          logoUnidade={ctx.unidade?.logoUrl ?? null}
          modoContexto={ctx.modo}
          afiliacao={afiliacao}
          torcidaReal={torcidaReal}
          slugTorcida={slugTorcida}
          slugUnidade={slugUnidade}
          atualSlug={atualSlug}
          solicitacaoPendente={solicitacaoPendente}
        />
      </div>
    )
  }

  // Minha torcida / Minha unidade: mural do canal oficial (Sede ou
  // subsede/PDE) — mesma CanalFeedView. Feed agregado só sobra se o canal
  // ainda não tiver ponteiro (legado).
  if (!torcidaReal) redirect('/portal/comunidade?escopo=nacional')

  const unidade = escopo === 'unidade' ? ctx.unidade : null
  const tenantDoEscopo = unidade
    ? { id: unidade.tenantId, nome: unidade.nome }
    : { id: torcidaReal.id, nome: torcidaReal.nome }

  const salasAtivas = await listSalasAtivas(tenantDoEscopo.id)

  let conteudoCanal: React.ReactNode = null
  let conversaIdCanal: string | undefined

  if (unidade) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      unidade.tenantId,
    )
    const permissoes = calculateEffectivePermissions(rolePermissions, overrides)
    // Gate pelo VÍNCULO, não por `podeVerCanal`: a aba é do torcedor por
    // definição e o gate de descoberta barra todo não-sócio fora de canal
    // PÚBLICO. Também cobre o canal emprestado (Caso B com a Conversa no
    // tenant da mãe), onde a relação de tenant nem seria `self`.
    const canal = await getCanalDaUnidadeDoVinculo(unidade.canalId, session.user.id)

    if (canal) {
      conversaIdCanal = canal.id
      // Publicar no mural da unidade é de sócio: torcedor lê, participa de
      // grupos/salas/loja, mas não publica no canal oficial.
      const ehSocio = await podeVerFeedSocios(session.user.id, unidade.tenantId)
      const podePublicar =
        ehSocio && (await podePublicarNoCanal(canal, unidade.tenantId, permissoes))

      conteudoCanal = (
        <CanalFeedView
          canal={canal}
          currentUser={currentUser}
          podePublicar={podePublicar}
          viewerTenantId={unidade.tenantId}
          permissoes={permissoes}
          podeCompartilhar={ehSocio}
        />
      )
    }
  } else if (escopo === 'torcida') {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      torcidaReal.id,
    )
    const permissoes = calculateEffectivePermissions(rolePermissions, overrides)
    const canal = await getCanalOficialDaSede(torcidaReal.id, session.user.id)

    if (canal) {
      conversaIdCanal = canal.id
      const ehSocio = await podeVerFeedSocios(session.user.id, torcidaReal.id)
      const podePublicar =
        ehSocio && (await podePublicarNoCanal(canal, torcidaReal.id, permissoes))

      conteudoCanal = (
        <CanalFeedView
          canal={canal}
          currentUser={currentUser}
          podePublicar={podePublicar}
          viewerTenantId={torcidaReal.id}
          permissoes={permissoes}
          podeCompartilhar={ehSocio}
        />
      )
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <ComunidadeFeedShell
        tenant={{
          id: tenantDoEscopo.id,
          nome: tenantDoEscopo.nome,
          afiliacaoId: torcidaReal.afiliacaoId,
          balancoFinanceiroVisivel: torcidaReal.balancoFinanceiroVisivel,
        }}
        currentUser={currentUser}
        filtro={conteudoCanal ? 'canal' : filtro}
        conversaId={conversaIdCanal}
        conteudoCanal={conteudoCanal}
        clubeNacional={ctx.afiliacao}
        salasAtivas={salasAtivas}
        eventoIdInicial={eventoIdComposer}
        escopo={unidade ? 'unidade' : 'torcida'}
        escopos={ctx.escopos}
        nomeUnidade={ctx.unidade?.nome ?? null}
        logoUnidade={ctx.unidade?.logoUrl ?? null}
        modoContexto={ctx.modo}
        afiliacao={ctx.afiliacao}
        torcidaReal={torcidaReal}
        slugTorcida={slugTorcida}
        slugUnidade={slugUnidade}
        atualSlug={atualSlug}
      />
    </div>
  )
}
