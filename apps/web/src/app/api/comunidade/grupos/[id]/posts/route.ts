import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getPostsDoGrupo } from '@/lib/feed'

const querySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(5).max(50).optional(),
})

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversaId } = await context.params
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const parsed = querySchema.safeParse({
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
      take: request.nextUrl.searchParams.get('take') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
    }

    const { posts, pageInfo } = await getPostsDoGrupo(
      conversaId,
      tenant.id,
      session.user.id,
      {
        cursor: parsed.data.cursor,
        take: parsed.data.take ?? 20,
      },
    )

    return NextResponse.json({ posts, pageInfo })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar mural.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
