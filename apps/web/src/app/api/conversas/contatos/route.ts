import { NextRequest, NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { getAlliedTenantIds } from '@/lib/hierarquia'
import { avaliarAcessoDm } from '@/lib/mensageria'
import {
  assertContextoMensageria,
  assertUsuarioMensageria,
} from '@/lib/mensageria-api'

type ContatoDto = {
  id: string
  nome: string | null
  avatarUrl: string | null
  tenantNome: string
  mesmoTenant: boolean
  requerSolicitacao: boolean
}

/**
 * Contatos elegíveis para conversa.
 * Torcida: membros APROVADOS do tenant/aliadas + sócios do mesmo clube (solicitação).
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

    const tenantContextoId = contexto.via === 'nacional' ? null : contexto.tenant.id

    async function pushSeElegivel(
      contatos: ContatoDto[],
      vistos: Set<string>,
      opts: {
        id: string
        nome: string | null
        avatarUrl: string | null
        tenantNome: string
        mesmoTenant: boolean
      },
    ): Promise<void> {
      if (vistos.has(opts.id) || bloqueadosIds.has(opts.id)) return
      vistos.add(opts.id)
      const acesso = await avaliarAcessoDm(userId, opts.id, tenantContextoId)
      if (acesso === 'bloqueado') return
      contatos.push({
        id: opts.id,
        nome: opts.nome,
        avatarUrl: opts.avatarUrl,
        tenantNome: opts.tenantNome,
        mesmoTenant: opts.mesmoTenant,
        requerSolicitacao: acesso === 'solicitacao',
      })
    }

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
      const contatos: ContatoDto[] = []

      for (const p of perfis) {
        if (contatos.length >= 20) break
        await pushSeElegivel(contatos, vistos, {
          id: p.user.id,
          nome: p.user.nome,
          avatarUrl: p.user.avatarUrl,
          tenantNome: 'Comunidade Nacional',
          mesmoTenant: true,
        })
      }
      for (const s of socios) {
        if (contatos.length >= 20) break
        await pushSeElegivel(contatos, vistos, {
          id: s.user.id,
          nome: s.user.nome,
          avatarUrl: s.user.avatarUrl,
          tenantNome: s.tenant.nome,
          mesmoTenant: false,
        })
      }

      // Presidentes/admins legado (UserRole sem SaasMembro) do mesmo clube.
      if (contatos.length < 20) {
        type CargoRow = {
          userId: string
          user: { id: string; nome: string | null; avatarUrl: string | null }
          tenant: { nome: string }
        }
        const cargos: CargoRow[] = await db.userRole.findMany({
          where: {
            userId: {
              not: userId,
              ...(vistos.size > 0 ? { notIn: [...vistos] } : {}),
            },
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
        for (const c of cargos) {
          if (contatos.length >= 20) break
          await pushSeElegivel(contatos, vistos, {
            id: c.user.id,
            nome: c.user.nome,
            avatarUrl: c.user.avatarUrl,
            tenantNome: c.tenant.nome,
            mesmoTenant: false,
          })
        }
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
    const contatos: ContatoDto[] = []
    for (const r of rows) {
      if (contatos.length >= 20) break
      await pushSeElegivel(contatos, vistos, {
        id: r.user.id,
        nome: r.user.nome,
        avatarUrl: r.user.avatarUrl,
        tenantNome: r.tenant.nome,
        mesmoTenant: r.tenantId === tenant.id,
      })
    }

    // Cargos na unidade/aliadas sem SaasMembro (owner legado).
    if (contatos.length < 20) {
      type CargoLocalRow = {
        userId: string
        tenantId: string
        user: { id: string; nome: string | null; avatarUrl: string | null }
        tenant: { nome: string }
      }
      const cargosLocais: CargoLocalRow[] = await db.userRole.findMany({
        where: {
          userId: {
            not: uid,
            ...(vistos.size > 0 ? { notIn: [...vistos] } : {}),
          },
          tenantId: { in: visiveis },
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
      for (const c of cargosLocais) {
        if (contatos.length >= 20) break
        await pushSeElegivel(contatos, vistos, {
          id: c.user.id,
          nome: c.user.nome,
          avatarUrl: c.user.avatarUrl,
          tenantNome: c.tenant.nome,
          mesmoTenant: c.tenantId === tenant.id,
        })
      }
    }

    // Sócios do mesmo clube fora da unidade/aliadas — aparecem com solicitação.
    if (contatos.length < 20 && tenant.afiliacaoId) {
      type SocioClubeRow = {
        userId: string
        user: { id: string; nome: string | null; avatarUrl: string | null }
        tenant: { nome: string }
      }
      const sociosClube: SocioClubeRow[] = await db.saasMembro.findMany({
        where: {
          status: 'APROVADO',
          tipo: 'SOCIO',
          userId: {
            not: uid,
            ...(vistos.size > 0 ? { notIn: [...vistos] } : {}),
          },
          tenant: {
            afiliacaoId: tenant.afiliacaoId,
            ativo: true,
            sintetico: false,
            id: { notIn: visiveis },
          },
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

      for (const s of sociosClube) {
        if (contatos.length >= 20) break
        await pushSeElegivel(contatos, vistos, {
          id: s.user.id,
          nome: s.user.nome,
          avatarUrl: s.user.avatarUrl,
          tenantNome: s.tenant.nome,
          mesmoTenant: false,
        })
      }
    }

    return NextResponse.json({ contatos })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar contatos.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
