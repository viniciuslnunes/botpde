import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { resolverContextoComunidade, resolverEscopoComunidade } from '@/lib/comunidade-contexto'
import { ComunidadeFeedShell } from './_components/comunidade-feed-shell'
import { getSolicitacaoSocioPendente } from '@/lib/onboarding'
import { listSalasAtivas, listSalasNacionais } from '@/lib/salas'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'

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
          podeEscopoTorcida={ctx.podeEscopoTorcida}
          afiliacao={afiliacao}
          solicitacaoPendente={solicitacaoPendente}
        />
      </div>
    )
  }

  if (ctx.modo !== 'torcida') redirect('/portal/comunidade?escopo=nacional')

  const tenant = ctx.tenant
  const salasAtivas = await listSalasAtivas(tenant.id)

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <ComunidadeFeedShell
        tenant={{
          id: tenant.id,
          nome: tenant.nome,
          afiliacaoId: tenant.afiliacaoId,
          balancoFinanceiroVisivel: tenant.balancoFinanceiroVisivel,
        }}
        currentUser={currentUser}
        cursor={params.cursor}
        filtro={filtro}
        clubeNacional={ctx.afiliacao}
        salasAtivas={salasAtivas}
        eventoIdInicial={eventoIdComposer}
        escopo="torcida"
        podeEscopoTorcida={ctx.podeEscopoTorcida}
        afiliacao={ctx.afiliacao}
      />
    </div>
  )
}
