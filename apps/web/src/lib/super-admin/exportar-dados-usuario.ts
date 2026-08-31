import 'server-only'

import { db } from '@torcida/db'

export type ExportacaoDadosUsuario = {
  exportadoEm: string
  usuario: {
    id: string
    nome: string | null
    email: string | null
    nickname: string | null
    criadoEm: string
    ultimoAcessoEm: string | null
  }
  vinculos: Array<{ tenantId: string; tenantNome: string; tenantSlug: string; status: string; tipo: string }>
  posts: Array<{ id: string; tenantNome: string; titulo: string | null; conteudo: string; criadoEm: string }>
  comentariosTotal: number
  reacoesTotal: number
  pedidos: Array<{ id: string; tenantNome: string; total: string; status: string; criadoEm: string }>
  confianca: Array<{
    tenantId: string
    tenantNome: string
    score: number
    nivel: number
    atualizadoEm: string
    eventos: Array<{ sinal: string; peso: number; origemTipo: string; criadoEm: string }>
  }>
}

/**
 * Exportação de dados pessoais de um usuário para atendimento a solicitação
 * LGPD (portabilidade) — subconjunto representativo, não as ~21 tabelas com
 * FK em `User`. Sem exclusão/anonimização: só leitura.
 */
type UsuarioComMembros = {
  id: string
  nome: string | null
  email: string | null
  nickname: string | null
  criadoEm: Date
  ultimoAcessoEm: Date | null
  membros: Array<{
    status: string
    tipo: string
    tenant: { id: string; nome: string; slug: string }
  }>
}

export async function exportarDadosUsuario(userId: string): Promise<ExportacaoDadosUsuario | null> {
  const usuario: UsuarioComMembros | null = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nome: true,
      email: true,
      nickname: true,
      criadoEm: true,
      ultimoAcessoEm: true,
      membros: {
        select: {
          status: true,
          tipo: true,
          tenant: { select: { id: true, nome: true, slug: true } },
        },
      },
    },
  })

  if (!usuario) return null

  type PostRow = {
    id: string
    titulo: string | null
    conteudo: string
    criadoEm: Date
    tenant: { nome: string }
  }
  type PedidoRow = {
    id: string
    total: { toString(): string }
    status: string
    criadoEm: Date
    tenant: { nome: string }
  }
  type SaldoConfiancaRow = {
    tenantId: string
    score: number
    nivel: number
    atualizadoEm: Date
    tenant: { nome: string }
  }
  type EventoConfiancaRow = {
    tenantId: string
    sinal: string
    peso: number
    origemTipo: string
    criadoEm: Date
  }

  const [posts, comentariosTotal, reacoesTotal, pedidos, saldosConfianca, eventosConfianca]: [
    PostRow[],
    number,
    number,
    PedidoRow[],
    SaldoConfiancaRow[],
    EventoConfiancaRow[],
  ] = await Promise.all([
    db.post.findMany({
      where: { autorId: userId },
      select: {
        id: true,
        titulo: true,
        conteudo: true,
        criadoEm: true,
        tenant: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    }),
    db.comentario.count({ where: { autorId: userId } }),
    db.reacao.count({ where: { userId } }),
    db.saasPedido.findMany({
      where: { userId },
      select: {
        id: true,
        total: true,
        status: true,
        criadoEm: true,
        tenant: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    }),
    db.confiancaSaldo.findMany({
      where: { userId },
      select: {
        tenantId: true,
        score: true,
        nivel: true,
        atualizadoEm: true,
        tenant: { select: { nome: true } },
      },
    }),
    db.confiancaEvento.findMany({
      where: { userId },
      select: { tenantId: true, sinal: true, peso: true, origemTipo: true, criadoEm: true },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    }),
  ])

  return {
    exportadoEm: new Date().toISOString(),
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      nickname: usuario.nickname,
      criadoEm: usuario.criadoEm.toISOString(),
      ultimoAcessoEm: usuario.ultimoAcessoEm?.toISOString() ?? null,
    },
    vinculos: usuario.membros.map((m) => ({
      tenantId: m.tenant.id,
      tenantNome: m.tenant.nome,
      tenantSlug: m.tenant.slug,
      status: m.status,
      tipo: m.tipo,
    })),
    posts: posts.map((p) => ({
      id: p.id,
      tenantNome: p.tenant.nome,
      titulo: p.titulo,
      conteudo: p.conteudo,
      criadoEm: p.criadoEm.toISOString(),
    })),
    comentariosTotal,
    reacoesTotal,
    pedidos: pedidos.map((p) => ({
      id: p.id,
      tenantNome: p.tenant.nome,
      total: p.total.toString(),
      status: p.status,
      criadoEm: p.criadoEm.toISOString(),
    })),
    confianca: saldosConfianca.map((s) => ({
      tenantId: s.tenantId,
      tenantNome: s.tenant.nome,
      score: s.score,
      nivel: s.nivel,
      atualizadoEm: s.atualizadoEm.toISOString(),
      eventos: eventosConfianca
        .filter((e) => e.tenantId === s.tenantId)
        .map((e) => ({
          sinal: e.sinal,
          peso: e.peso,
          origemTipo: e.origemTipo,
          criadoEm: e.criadoEm.toISOString(),
        })),
    })),
  }
}
