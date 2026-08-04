import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { getCanalPorId, podePublicarNoCanal } from '@/lib/canais'
import { podeVerFeedSocios } from '@/lib/feed'
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
import { ComunidadeFeedShell } from '../../_components/comunidade-feed-shell'
import { CanalFeedView } from './canal-feed-view'
import type { Metadata } from 'next'

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
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    viewerTenantId,
  )
  const permissoes = calculateEffectivePermissions(rolePermissions, overrides)

  const canal = await getCanalPorId(id, viewerTenantId, session.user.id)
  if (!canal) notFound()

  const superAdmin = isSuperAdminEmail(session.user.email)
  const [podePublicar, ehSocio, canaisTematicosAbertos, canaisAbertos] = await Promise.all([
    podePublicarNoCanal(canal, viewerTenantId, permissoes),
    podeVerFeedSocios(session.user.id, viewerTenantId),
    superAdmin
      ? Promise.resolve([] as Awaited<ReturnType<typeof carregarCanaisAbertosSocio>>)
      : carregarCanaisAbertosSocio(
          await lerIdsCanaisAbertosSocio(),
          session.user.id,
          viewerTenantId,
        ),
    superAdmin
      ? carregarCanaisAbertosOperador(await lerSlugsCanaisAbertosOperador())
      : Promise.resolve([] as Awaited<ReturnType<typeof carregarCanaisAbertosOperador>>),
  ])

  // Garante o canal atual na lista se ainda não estava no cookie (RSC)
  // — o client também chama registrar no mount.
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

  return (
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
        renderConteudoCanal={({ busca }) => (
          <div className="space-y-4">
            <Link
              href="/portal/comunidade/canais"
              className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1.5 pl-2 pr-3.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar aos canais
            </Link>
            <CanalFeedView
              canal={canal}
              currentUser={currentUser}
              // Spec: publicar no canal = sócio (`podeVerFeedSocios`) ∧
              // `podePublicarNoCanal`. Sem o `|| !somenteAdminPublica` — ele
              // liberava torcedor/cross-tenant quando o gate já tinha barrado.
              podePublicar={ehSocio && podePublicar}
              cursor={cursor}
              viewerTenantId={viewerTenantId}
              permissoes={permissoes}
              podeCompartilhar={ehSocio}
              buscaChrome={busca}
            />
          </div>
        )}
      />
    </div>
  )
}
