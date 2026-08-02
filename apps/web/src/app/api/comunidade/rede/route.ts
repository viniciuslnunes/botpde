import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { getPostsDaRede } from '@/lib/feed'

const querySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(5).max(50).optional(),
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }
    const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
    if (!tenant) {
      return NextResponse.json({ error: 'Sem torcida para este feed.' }, { status: 403 })
    }

    const parsed = querySchema.safeParse({
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
      take: request.nextUrl.searchParams.get('take') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
    }

    const { posts, pageInfo } = await getPostsDaRede(tenant.id, session.user.id, {
      cursor: parsed.data.cursor,
      take: parsed.data.take ?? 20,
    })

    return NextResponse.json({ posts, pageInfo })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro na rota do feed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

