import { NextRequest, NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { getAlliedTenantIds } from '@/lib/hierarquia'
import {
  assertContextoMensageria,
  assertUsuarioMensageria,
} from '@/lib/mensageria-api'

/**
 * Contatos elegíveis para conversa.
 * Torcida: membros APROVADOS do tenant e aliadas.
 * Nacional: usuários com o mesmo clube (`PerfilTorcedor` ou sócio APROVADO).
 */
export async function GET(request: NextRequest) {
  try {
    const contexto = await assertContextoMensageria()
    const userId = contexto.session.user.id!
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

    const bloqueios: { bloqueadorId: string; bloqueadoId: string }[] =
      await db.bloqueioUsuario.findMany({
        where: { OR: [{ bloqueadorId: userId }, { bloqueadoId: userId }] },
        select: { bloqueadorId: true, bloqueadoId: true },
      })
    const bloqueadosIds = new Set(
      bloqueios.map((b) => (b.bloqueadorId === userId ? b.bloqueadoId : b.bloqueadorId)),
    )

    if (contexto.via === 'nacional') {
      const afiliacaoId = (
        await db.tenant.findUnique({
          where: { id: contexto.tenant.id },
          select: { afiliacaoId: true },
        })
      )?.afiliacaoId
      if (!afiliacaoId) {
        return NextResponse.json({ contatos: [] })
      }

      type PerfilRow = {
        userId: string
        user: { id: string; nome: string | null; avatarUrl: string | null }
      }
      const perfis: PerfilRow[] = await db.perfilTorcedor.findMany({
        where: {
          afiliacaoId,
          userId: { not: userId },
          onboardingConcluidoEm: { not: null },
          ...(q ? { user: { nome: { contains: q, mode: 'insensitive' } } } : {}),
        },
        select: {
          userId: true,
          user: { select: { id: true, nome: true, avatarUrl: true } },
        },
        orderBy: { user: { nome: 'asc' } },
        take: 40,
      })

      type SocioRow = {
        userId: string
        user: { id: string; nome: string | null; avatarUrl: string | null }
        tenant: { nome: string }
      }
      const socios: SocioRow[] = await db.saasMembro.findMany({
        where: {
          status: 'APROVADO',
          tipo: 'SOCIO',
          userId: { not: userId },
          tenant: { afiliacaoId, ativo: true, sintetico: false },
          ...(q ? { user: { nome: { contains: q, mode: 'insensitive' } } } : {}),
        },
        select: {
          userId: true,
          user: { select: { id: true, nome: true, avatarUrl: true } },
          tenant: { select: { nome: true } },
        },
        orderBy: { user: { nome: 'asc' } },
        take: 40,
      })

      const vistos = new Set<string>()
      const contatos: Array<{
        id: string
        nome: string | null
        avatarUrl: string | null
        tenantNome: string
        mesmoTenant: boolean
      }> = []

      for (const p of perfis) {
        if (vistos.has(p.userId) || bloqueadosIds.has(p.userId)) continue
        vistos.add(p.userId)
        contatos.push({
          id: p.user.id,
          nome: p.user.nome,
          avatarUrl: p.user.avatarUrl,
          tenantNome: 'Comunidade Nacional',
          mesmoTenant: true,
        })
        if (contatos.length >= 20) break
      }
      for (const s of socios) {
        if (contatos.length >= 20) break
        if (vistos.has(s.userId) || bloqueadosIds.has(s.userId)) continue
        vistos.add(s.userId)
        contatos.push({
          id: s.user.id,
          nome: s.user.nome,
          avatarUrl: s.user.avatarUrl,
          tenantNome: s.tenant.nome,
          mesmoTenant: false,
        })
      }

      return NextResponse.json({ contatos })
    }

    const { userId: uid, tenant } = await assertUsuarioMensageria()
    const aliados = await getAlliedTenantIds(tenant.id)
    const visiveis = [tenant.id, ...aliados]

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
        userId: { not: uid },
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
