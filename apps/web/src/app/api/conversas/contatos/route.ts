import { NextRequest, NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { getAlliedTenantIds } from '@/lib/hierarquia'
import { assertUsuarioMensageria } from '@/lib/mensageria-api'

/**
 * Contatos elegíveis para conversa: membros APROVADOS do tenant atual e de
 * torcidas aliadas (mesma regra do canMessageUser), exceto o próprio usuário
 * e quem tem bloqueio em qualquer direção.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, tenant } = await assertUsuarioMensageria()
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

    const aliados = await getAlliedTenantIds(tenant.id)
    const visiveis = [tenant.id, ...aliados]

    const bloqueios: { bloqueadorId: string; bloqueadoId: string }[] =
      await db.bloqueioUsuario.findMany({
        where: { OR: [{ bloqueadorId: userId }, { bloqueadoId: userId }] },
        select: { bloqueadorId: true, bloqueadoId: true },
      })
    const bloqueadosIds = new Set(
      bloqueios.map((b) => (b.bloqueadorId === userId ? b.bloqueadoId : b.bloqueadorId)),
    )

    interface ContatoRow {
      userId: string
      tenantId: string
      user: { id: string; nome: string | null; avatarUrl: string | null }
      tenant: { nome: string }
    }
    const rows: ContatoRow[] = await db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        tenantId: { in: visiveis },
        userId: { not: userId },
        ...(q ? { user: { nome: { contains: q, mode: 'insensitive' } } } : {}),
      },
      select: {
        userId: true,
        tenantId: true,
        user: { select: { id: true, nome: true, avatarUrl: true } },
        tenant: { select: { nome: true } },
      },
      orderBy: { user: { nome: 'asc' } },
      take: 40,
    })

    // Um usuário pode ser membro de mais de um tenant visível — dedup por userId
    const vistos = new Set<string>()
    const contatos = rows
      .filter((r) => {
        if (vistos.has(r.userId) || bloqueadosIds.has(r.userId)) return false
        vistos.add(r.userId)
        return true
      })
      .slice(0, 20)
      .map((r) => ({
        id: r.user.id,
        nome: r.user.nome,
        avatarUrl: r.user.avatarUrl,
        tenantNome: r.tenant.nome,
        mesmoTenant: r.tenantId === tenant.id,
      }))

    return NextResponse.json({ contatos })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar contatos.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
