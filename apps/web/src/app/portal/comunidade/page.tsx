import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { resolverContextoComunidade, resolverEscopoComunidade } from '@/lib/comunidade-contexto'
import { ComunidadeFeedShell } from './_components/comunidade-feed-shell'
import { getSolicitacaoSocioPendente } from '@/lib/onboarding'
import { listSalasAtivas, listSalasNacionais } from '@/lib/salas'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { getCanalDaUnidadeDoVinculo, podePublicarNoCanal } from '@/lib/canais'
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
  searchParams: Promise<{ cursor?: string; filtro?: string; eventoId?: string; escopo?: string }>
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

  const escopoDesejado = resolverEscopoComunidade(ctx, params.escopo)
  const escopo = escopoDesejado === 'nacional' && !ctx.afiliacao ? 'torcida' : escopoDesejado

  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl,
  }

  const torcidaReal = ctx.torcidaReal ?? (ctx.modo === 'torcida' ? ctx.tenant : null)

  if (escopo === 'nacional' && ctx.afiliacao && ctx.tenantSintetico) {
    const afiliacao = ctx.afiliacao
    const [salasAtivas, solicitacaoPendente] = await Promise.all([
      listSalasNacionais(afiliacao.id),
      getSolicitacaoSocioPendente(session.user.id),
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
          cursor={params.cursor}
          filtro={filtro}
          clubeNacional={afiliacao}
          salasAtivas={salasAtivas}
          eventoIdInicial={eventoIdComposer}
          escopo="nacional"
          escopos={ctx.escopos}
          nomeUnidade={ctx.unidade?.nome ?? null}
          modoContexto={ctx.modo}
          afiliacao={afiliacao}
          torcidaReal={torcidaReal}
          solicitacaoPendente={solicitacaoPendente}
        />
      </div>
    )
  }

  // Minha torcida / Minha unidade: sócio (modo torcida) ou TORCEDOR com
  // vínculo (torcidaReal). Sem nenhum dos dois, só resta a Nacional.
  if (!torcidaReal) redirect('/portal/comunidade?escopo=nacional')

  // Minha unidade é o CANAL da subsede/PDE, não um feed agregado: é lá que a
  // liderança controla e segrega o que é da unidade. O filtro `canal` já
  // existe e aplica o gate de membership do canal.
  const unidade = escopo === 'unidade' ? ctx.unidade : null
  const tenantDoEscopo = unidade
    ? { id: unidade.tenantId, nome: unidade.nome }
    : { id: torcidaReal.id, nome: torcidaReal.nome }

  const salasAtivas = await listSalasAtivas(tenantDoEscopo.id)

  // Mural da unidade: reusa a view do canal, que já resolve composer, gate de
  // membership e pedido de entrada. Canal oficial nasce privado (pode não ter
  // liderança vinculada ainda) — a liderança da subsede/PDE abre depois nas
  // configurações do canal; até lá o não-membro vê o pedido de entrada, não
  // um mural vazio sem explicação.
  let conteudoCanal: React.ReactNode = null
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
          cursor={params.cursor}
          viewerTenantId={unidade.tenantId}
          permissoes={permissoes}
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
        cursor={params.cursor}
        filtro={unidade ? 'canal' : filtro}
        conversaId={unidade?.canalId}
        conteudoCanal={conteudoCanal}
        clubeNacional={ctx.afiliacao}
        salasAtivas={salasAtivas}
        eventoIdInicial={eventoIdComposer}
        escopo={unidade ? 'unidade' : 'torcida'}
        escopos={ctx.escopos}
        nomeUnidade={ctx.unidade?.nome ?? null}
        modoContexto={ctx.modo}
        afiliacao={ctx.afiliacao}
        torcidaReal={torcidaReal}
      />
    </div>
  )
}
