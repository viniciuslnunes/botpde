import { NextRequest, NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'

export type UsuarioVinculo = {
  tenantId: string
  tenantNome: string
  tenantSlug: string
  cargo: string | null
  /** null = há cargo no tenant mas nenhuma linha de `SaasMembro`. */
  membroId: string | null
  membroStatus: 'PENDENTE' | 'APROVADO' | 'REPROVADO' | null
  membroDesligado: boolean
  /** Espelho da Sede: só a unidade de origem apaga. Ver `motivoImpedeApagar`. */
  membroEspelhado: boolean
}

export type UsuarioDetalhe = {
  id: string
  nome: string | null
  email: string | null
  nickname: string | null
  avatarUrl: string | null
  criadoEm: string
  ultimoAcessoEm: string | null
  vinculos: UsuarioVinculo[]
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 })
  }

  const { id } = await params

  const usuario = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      email: true,
      nickname: true,
      avatarUrl: true,
      criadoEm: true,
      ultimoAcessoEm: true,
      userRoles: {
        select: {
          role: { select: { nome: true } },
          tenant: { select: { id: true, nome: true, slug: true } },
        },
      },
      membros: {
        select: {
          id: true,
          status: true,
          desligadoEm: true,
          espelhado: true,
          tenant: { select: { id: true, nome: true, slug: true } },
        },
      },
    },
  })

  if (!usuario) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  }

  const porTenant = new Map<string, UsuarioVinculo>()

  for (const ur of usuario.userRoles) {
    const key = ur.tenant.id
    const atual = porTenant.get(key)
    if (atual) {
      atual.cargo = atual.cargo ? `${atual.cargo}, ${ur.role.nome}` : ur.role.nome
    } else {
      porTenant.set(key, {
        tenantId: ur.tenant.id,
        tenantNome: ur.tenant.nome,
        tenantSlug: ur.tenant.slug,
        cargo: ur.role.nome,
        membroId: null,
        membroStatus: null,
        membroDesligado: false,
        membroEspelhado: false,
      })
    }
  }

  for (const m of usuario.membros) {
    const key = m.tenant.id
    const atual = porTenant.get(key)
    if (atual) {
      atual.membroId = m.id
      atual.membroStatus = m.status
      atual.membroDesligado = m.desligadoEm != null
      atual.membroEspelhado = m.espelhado
    } else {
      porTenant.set(key, {
        tenantId: m.tenant.id,
        tenantNome: m.tenant.nome,
        tenantSlug: m.tenant.slug,
        cargo: null,
        membroId: m.id,
        membroStatus: m.status,
        membroDesligado: m.desligadoEm != null,
        membroEspelhado: m.espelhado,
      })
    }
  }

  const detalhe: UsuarioDetalhe = {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    nickname: usuario.nickname,
    avatarUrl: usuario.avatarUrl,
    criadoEm: usuario.criadoEm.toISOString(),
    ultimoAcessoEm: usuario.ultimoAcessoEm?.toISOString() ?? null,
    vinculos: [...porTenant.values()].sort((a, b) => a.tenantNome.localeCompare(b.tenantNome)),
  }

  return NextResponse.json(detalhe)
}
