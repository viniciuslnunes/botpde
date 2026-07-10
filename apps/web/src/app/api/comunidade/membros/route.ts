import { NextRequest, NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { getVisibleTenantIds } from '@/lib/hierarquia'
import { canFollowUser, getSeguimentoStatus } from '@/lib/social'
import { getContagensSeguimento, resolverAvatarSocial } from '@/lib/perfil-social'

export async function GET(request: NextRequest) {
  try {
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }
    await assertMembroAtivo(tenant.id, session.user.id)

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 2) {
      return NextResponse.json({ membros: [] })
    }

    const visibleIds = await getVisibleTenantIds(tenant.id, 'comunidade')

    const bloqueios: { bloqueadorId: string; bloqueadoId: string }[] =
      await db.bloqueioUsuario.findMany({
        where: { OR: [{ bloqueadorId: session.user.id }, { bloqueadoId: session.user.id }] },
        select: { bloqueadorId: true, bloqueadoId: true },
      })
    const bloqueadosIds = new Set(
      bloqueios.map((b) =>
        b.bloqueadorId === session.user.id ? b.bloqueadoId : b.bloqueadorId,
      ),
    )

    interface MembroRow {
      userId: string
      tenantId: string
      user: { id: string; nome: string | null; avatarUrl: string | null }
      tenant: { nome: string }
    }

    const rows: MembroRow[] = await db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        tenantId: { in: visibleIds },
        userId: { not: session.user.id },
        user: {
          OR: [
            { nome: { contains: q, mode: 'insensitive' } },
            { perfisMembro: { some: { bio: { contains: q, mode: 'insensitive' }, tenantId: tenant.id } } },
          ],
        },
      },
      select: {
        userId: true,
        tenantId: true,
        user: { select: { id: true, nome: true, avatarUrl: true } },
        tenant: { select: { nome: true } },
      },
      take: 40,
    })

    const vistos = new Set<string>()
    const membros = []

    for (const r of rows) {
      if (vistos.has(r.userId) || bloqueadosIds.has(r.userId)) continue
      vistos.add(r.userId)

      const perfil: { perfilPrivado: boolean; avatarUrl: string | null } | null =
        await db.perfilMembro.findUnique({
          where: { userId_tenantId: { userId: r.userId, tenantId: tenant.id } },
          select: { perfilPrivado: true, avatarUrl: true },
        })

      const [statusSeguimento, contagens, podeSeguir] = await Promise.all([
        getSeguimentoStatus(session.user.id, r.userId),
        getContagensSeguimento(r.userId, tenant.id),
        canFollowUser(session.user.id, r.userId, tenant.id),
      ])

      membros.push({
        id: r.user.id,
        nome: r.user.nome,
        avatarUrl: resolverAvatarSocial(perfil?.avatarUrl, r.user.avatarUrl),
        tenantNome: r.tenant.nome,
        mesmoTenant: r.tenantId === tenant.id,
        perfilPrivado: perfil?.perfilPrivado ?? true,
        statusSeguimento,
        seguidores: contagens.seguidores,
        podeSeguir,
      })

      if (membros.length >= 20) break
    }

    return NextResponse.json({ membros })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar membros.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
