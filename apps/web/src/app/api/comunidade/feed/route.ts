import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import {
  getPostsDaRede,
  getPostsParaFeed,
  getPostsDosMeusGrupos,
  getPostsFeedNacional,
  getPostsFeedNacionalSeguindo,
  getPostsFeedNacionalGrupos,
} from '@/lib/feed'
import { getCanalDaUnidadeDoVinculo, getCanalLeituraDireta, getCanalPorId, getPostsDoCanal, resolverFeedInternoDoMural } from '@/lib/canais'
import { ehOperadorPlataforma, resolveAfiliacaoComunidadeDoUsuario } from '@/lib/authz'
import { isSuperAdminEmail } from '@/lib/tenant-context'

const querySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(5).max(50).optional(),
  filtro: z.enum(['descobrir', 'seguindo', 'grupos', 'canal']).optional(),
  conversaId: z.string().optional(),
  escopo: z.enum(['nacional', 'torcida', 'unidade']).optional(),
  afiliacaoId: z.string().uuid().optional(),
  /**
   * Opt-in: misturar posts "Só torcida" no mural. Só as abas Minha torcida /
   * Minha unidade enviam `1`. Soft-switch e `/canais/[id]` omitem → só
   * posts do conversaId.
   */
  feedInterno: z.enum(['0', '1']).optional(),
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const parsed = querySchema.safeParse({
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
      take: request.nextUrl.searchParams.get('take') ?? undefined,
      filtro: request.nextUrl.searchParams.get('filtro') ?? undefined,
      conversaId: request.nextUrl.searchParams.get('conversaId') ?? undefined,
      escopo: request.nextUrl.searchParams.get('escopo') ?? undefined,
      afiliacaoId: request.nextUrl.searchParams.get('afiliacaoId') ?? undefined,
      feedInterno: request.nextUrl.searchParams.get('feedInterno') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
    }

    const take = parsed.data.take ?? 20

    if (parsed.data.escopo === 'nacional') {
      if (!parsed.data.afiliacaoId) {
        return NextResponse.json({ error: 'afiliacaoId obrigatório.' }, { status: 400 })
      }
      // Super-admin em modo operador navega a CN do tenant ativo (ex.: Central),
      // que pode diferir do clube do próprio PerfilTorcedor — a page já monta
      // com `ctx.afiliacao`; a API não pode exigir match pessoal.
      if (!isSuperAdminEmail(session.user.email)) {
        const afiliacaoViewer = await resolveAfiliacaoComunidadeDoUsuario(
          session.user.id,
          session.user.email,
        )
        if (!afiliacaoViewer || afiliacaoViewer !== parsed.data.afiliacaoId) {
          return NextResponse.json({ error: 'Sem permissão para este feed.' }, { status: 403 })
        }
      }

      const filtroNacional = parsed.data.filtro ?? 'descobrir'
      const feedOpts = { cursor: parsed.data.cursor, take }

      if (filtroNacional === 'seguindo') {
        const { posts, pageInfo } = await getPostsFeedNacionalSeguindo(
          parsed.data.afiliacaoId,
          session.user.id,
          feedOpts,
        )
        return NextResponse.json({ posts, pageInfo })
      }

      if (filtroNacional === 'grupos') {
        const { posts, pageInfo } = await getPostsFeedNacionalGrupos(
          parsed.data.afiliacaoId,
          session.user.id,
          feedOpts,
        )
        return NextResponse.json({ posts, pageInfo })
      }

      const { posts, pageInfo } = await getPostsFeedNacional(
        parsed.data.afiliacaoId,
        session.user.id,
        feedOpts,
      )
      return NextResponse.json({ posts, pageInfo })
    }

    // Minha torcida: vínculo do usuário — nunca TENANT_SLUG do deploy
    // (vazava posts de rivais no refetch do TORCEDOR).
    const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
    if (!tenant) {
      return NextResponse.json({ error: 'Sem torcida para este feed.' }, { status: 403 })
    }

    const filtro = parsed.data.filtro ?? 'descobrir'

    if (filtro === 'seguindo') {
      const { posts, pageInfo } = await getPostsDaRede(tenant.id, session.user.id, {
        cursor: parsed.data.cursor,
        take,
      })

      return NextResponse.json({ posts, pageInfo })
    }

    if (filtro === 'grupos') {
      const { posts, pageInfo } = await getPostsDosMeusGrupos(tenant.id, session.user.id, {
        cursor: parsed.data.cursor,
        take,
      })
      return NextResponse.json({ posts, pageInfo })
    }

    if (filtro === 'canal') {
      if (!parsed.data.conversaId) {
        return NextResponse.json({ error: 'conversaId obrigatório.' }, { status: 400 })
      }
      // Aba "Minha unidade": o gate é o vínculo, não a descoberta cross-tenant
      // (`getCanalPorId` exige sócio fora de canal PÚBLICO e devolveria 404
      // para o torcedor no mural da própria unidade). Super-admin (com ou
      // sem vínculo / dual-hat) lê direto — não só o modo operador puro.
      const operador = await ehOperadorPlataforma(
        session.user.id,
        session.user.email,
        tenant.id,
      )
      const leituraPlataforma = operador || isSuperAdminEmail(session.user.email)
      const canal =
        (await getCanalPorId(parsed.data.conversaId, tenant.id, session.user.id)) ??
        (await getCanalDaUnidadeDoVinculo(parsed.data.conversaId, session.user.id)) ??
        (leituraPlataforma
          ? await getCanalLeituraDireta(parsed.data.conversaId, session.user.id)
          : null)
      if (!canal || (!canal.souMembro && !leituraPlataforma)) {
        return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 })
      }
      // Default: só o canal. `feedInterno=1` (Minha torcida/unidade) pode
      // misturar "Só torcida" do mural próprio — nunca na listagem/soft-switch.
      const pedirFeedInterno = parsed.data.feedInterno === '1'
      const feedInterno = pedirFeedInterno
        ? await resolverFeedInternoDoMural({
            canalId: canal.id,
            canalOficial: canal.canalOficial,
            userId: session.user.id,
            viewerTenantId: tenant.id,
          })
        : { incluir: false, feedInternoTenantId: null as string | null }
      const { posts, pageInfo } = await getPostsDoCanal(canal.id, tenant.id, session.user.id, {
        cursor: parsed.data.cursor,
        take,
        incluirFeedInterno: feedInterno.incluir,
        viewerTenantId: feedInterno.feedInternoTenantId ?? tenant.id,
        leituraOperador: leituraPlataforma,
      })

      return NextResponse.json({ posts, pageInfo })
    }

    const { posts, pageInfo } = await getPostsParaFeed(tenant.id, session.user.id, {
      cursor: parsed.data.cursor,
      take,
    })

    return NextResponse.json({ posts, pageInfo })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro na rota do feed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

