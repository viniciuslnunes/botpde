import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getPostsDaRede, getPostsParaFeed, getPostsDosMeusGrupos } from '@/lib/feed'
import { getCanalPorId, getPostsDoCanal } from '@/lib/canais'

const querySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(5).max(50).optional(),
  filtro: z.enum(['descobrir', 'seguindo', 'grupos', 'canal']).optional(),
  conversaId: z.string().optional(),
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const parsed = querySchema.safeParse({
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
      take: request.nextUrl.searchParams.get('take') ?? undefined,
      filtro: request.nextUrl.searchParams.get('filtro') ?? undefined,
      conversaId: request.nextUrl.searchParams.get('conversaId') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
    }

    const filtro = parsed.data.filtro ?? 'descobrir'

    if (filtro === 'seguindo') {
      const { posts, pageInfo } = await getPostsDaRede(tenant.id, session.user.id, {
        cursor: parsed.data.cursor,
        take: parsed.data.take ?? 20,
      })

      return NextResponse.json({ posts, pageInfo })
    }

    if (filtro === 'canal') {
      if (!parsed.data.conversaId) {
        return NextResponse.json({ error: 'conversaId obrigatório.' }, { status: 400 })
      }
      const canal = await getCanalPorId(parsed.data.conversaId, tenant.id, session.user.id)
      if (!canal || !canal.souMembro) {
        return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 })
      }
      const { posts, pageInfo } = await getPostsDoCanal(canal.id, canal.tenantId, session.user.id, {
        cursor: parsed.data.cursor,
        take: parsed.data.take ?? 20,
      })

      return NextResponse.json({ posts, pageInfo })
    }

    const [{ posts, pageInfo }] = await Promise.all([
      getPostsParaFeed(tenant.id, session.user.id, {
        cursor: parsed.data.cursor,
        take: parsed.data.take ?? 20,
      }),
    ])

    return NextResponse.json({
      posts,
      pageInfo,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro na rota do feed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

