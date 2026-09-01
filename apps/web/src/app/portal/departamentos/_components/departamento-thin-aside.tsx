import Link from 'next/link'
import {
  ArrowRight,
  Calendar,
  MessageCircle,
  Shield,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react'
import { TIPO_EVENTO_LABEL, thinCopyPorSlug, THIN_COM_AGENDA } from '@torcida/types'
import type { TipoEvento } from '@torcida/db'
import { db } from '@torcida/db'
import { listarProximosEventosTenant } from '@/lib/eventos-tipo'

const ICONS: Record<string, typeof Users> = {
  'social-e-eventos': Calendar,
  'materiais-loja': ShoppingBag,
  comunicacao: MessageCircle,
  feminino: Users,
}

const AGENDA_TIPOS: Record<string, TipoEvento[]> = {
  'social-e-eventos': ['GERAL'],
  feminino: ['GERAL'],
}

type ProximoLite = {
  id: string
  titulo: string
  tipo: TipoEvento
  data: Date
  _count: { rsvps: number }
  projetoTitulo: string | null
}

/** Preferir eventos com `projetoId` do departamento; senão agenda genérica. */
async function proximosAgendaDepartamento(opts: {
  tenantId: string
  departamentoId: string
  tipos?: TipoEvento[]
}): Promise<{ proximos: ProximoLite[]; priorizouProjeto: boolean }> {
  type Row = {
    id: string
    titulo: string
    tipo: TipoEvento
    data: Date
    _count: { rsvps: number }
    projeto: { titulo: string } | null
  }
  const comProjeto: Row[] = await db.evento.findMany({
    where: {
      tenantId: opts.tenantId,
      data: { gte: new Date() },
      projeto: { departamentoId: opts.departamentoId, tenantId: opts.tenantId },
      ...(opts.tipos && opts.tipos.length > 0 ? { tipo: { in: opts.tipos } } : {}),
    },
    orderBy: { data: 'asc' },
    take: 5,
    select: {
      id: true,
      titulo: true,
      tipo: true,
      data: true,
      projeto: { select: { titulo: true } },
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })

  if (comProjeto.length > 0) {
    return {
      priorizouProjeto: true,
      proximos: comProjeto.map((e) => ({
        id: e.id,
        titulo: e.titulo,
        tipo: e.tipo,
        data: e.data,
        _count: e._count,
        projetoTitulo: e.projeto?.titulo ?? null,
      })),
    }
  }

  const genericos = await listarProximosEventosTenant(opts.tenantId, 5, opts.tipos)
  return {
    priorizouProjeto: false,
    proximos: genericos.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      tipo: e.tipo,
      data: e.data,
      _count: e._count,
      projetoTitulo: null,
    })),
  }
}

export async function DepartamentoThinAside({
  tenantId,
  slug,
  nome,
  departamentoId,
  isGestor,
  moduloHref,
  operacaoHref,
  podeVerPedidos = false,
  podeModerar = false,
  podeVerFinanceiro = false,
  podeGerirFinanceiro = false,
}: {
  tenantId: string
  slug: string
  nome: string
  /** Usado para agenda por projeto e nudge de rateio. */
  departamentoId?: string
  isGestor: boolean
  moduloHref: string | null
  operacaoHref: string | null
  podeVerPedidos?: boolean
  podeModerar?: boolean
  podeVerFinanceiro?: boolean
  podeGerirFinanceiro?: boolean
}) {
  const copy = thinCopyPorSlug(slug)
  const titulo = copy?.titulo ?? nome
  const descricao =
    copy?.descricao ??
    'Use a equipe ao lado e o módulo vinculado. Gestores incluem pessoas e abrem a operação do domínio.'
  const ctaModulo = copy?.ctaModulo ?? 'Abrir módulo'
  const Icon = ICONS[slug] ?? Users
  const comAgenda = (THIN_COM_AGENDA as readonly string[]).includes(slug)
  const tiposAgenda = AGENDA_TIPOS[slug]

  let proximos: ProximoLite[] = []
  let priorizouProjeto = false
  let projetosAtivos = 0
  let despesasSemProjeto = 0

  if (comAgenda && departamentoId) {
    const agenda = await proximosAgendaDepartamento({
      tenantId,
      departamentoId,
      tipos: tiposAgenda,
    })
    proximos = agenda.proximos
    priorizouProjeto = agenda.priorizouProjeto
  } else if (comAgenda) {
    const genericos = await listarProximosEventosTenant(tenantId, 5, tiposAgenda)
    proximos = genericos.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      tipo: e.tipo,
      data: e.data,
      _count: e._count,
      projetoTitulo: null,
    }))
  }

  if (departamentoId && (slug === 'social-e-eventos' || slug === 'feminino')) {
    projetosAtivos = await db.projeto.count({
      where: {
        tenantId,
        departamentoId,
        status: { in: ['PLANEJADO', 'ATIVO'] },
      },
    })
  }

  if (slug === 'social-e-eventos' && departamentoId && isGestor && projetosAtivos > 0) {
    const desde = new Date()
    desde.setDate(desde.getDate() - 90)
    despesasSemProjeto = await db.financeiroLancamento.count({
      where: {
        tenantId,
        tipo: 'DESPESA',
        departamentoId,
        projetoId: null,
        data: { gte: desde },
      },
    })
  }

  type UltimoComunicado = { id: string; titulo: string; publicadoEm: Date; prioridade: string }
  let ultimoComunicado: UltimoComunicado | null = null
  let denunciasAbertas = 0
  let pedidosAbertos = 0
  let produtoDestaque: { id: string; nome: string } | null = null

  if (slug === 'comunicacao') {
    const [anuncio, denuncias]: [UltimoComunicado | null, number] = await Promise.all([
      db.announcement.findFirst({
        where: { tenantId },
        orderBy: { publicadoEm: 'desc' },
        select: { id: true, titulo: true, publicadoEm: true, prioridade: true },
      }),
      podeModerar
        ? db.denuncia.count({ where: { tenantId, status: 'PENDENTE' } })
        : Promise.resolve(0),
    ])
    ultimoComunicado = anuncio
    denunciasAbertas = denuncias
  }

  if (slug === 'materiais-loja') {
    const [pedidos, destaque]: [number, { id: string; nome: string } | null] = await Promise.all([
      podeVerPedidos
        ? db.saasPedido.count({ where: { tenantId, status: 'PENDENTE' } })
        : Promise.resolve(0),
      db.saasProduto.findFirst({
        where: { tenantId, ativo: true, destaque: true },
        orderBy: { atualizadoEm: 'desc' },
        select: { id: true, nome: true },
      }),
    ])
    pedidosAbertos = pedidos
    produtoDestaque = destaque
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</h2>
        </div>
        <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">{descricao}</p>

        {slug === 'comunicacao' && (
          <div id="avisos" className="mt-4 scroll-mt-20 space-y-3 border-t border-[rgb(var(--border))] pt-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
                Último comunicado
              </p>
              {ultimoComunicado ? (
                <div className="mt-1">
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                    {ultimoComunicado.titulo}
                  </p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {ultimoComunicado.prioridade !== 'NORMAL' ? `${ultimoComunicado.prioridade} · ` : ''}
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
                      ultimoComunicado.publicadoEm,
                    )}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                  Nenhum comunicado publicado ainda.
                </p>
              )}
            </div>
            {podeModerar && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[rgb(var(--foreground-muted))]">Denúncias abertas</span>
                <span
                  className={[
                    'font-semibold tabular-nums',
                    denunciasAbertas > 0 ? 'text-amber-700 dark:text-amber-400' : '',
                  ].join(' ')}
                >
                  {denunciasAbertas}
                </span>
              </div>
            )}
            {podeModerar && denunciasAbertas > 0 && (
              <Link
                href="/admin/comunidade/moderacao"
                prefetch={false}
                className="block text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Abrir moderação →
              </Link>
            )}
          </div>
        )}

        {slug === 'materiais-loja' && (
          <div id="pedidos" className="mt-4 scroll-mt-20 space-y-3 border-t border-[rgb(var(--border))] pt-3">
            {podeVerPedidos && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[rgb(var(--foreground-muted))]">Pedidos abertos</span>
                <span
                  className={[
                    'font-semibold tabular-nums',
                    pedidosAbertos > 0 ? 'text-amber-700 dark:text-amber-400' : '',
                  ].join(' ')}
                >
                  {pedidosAbertos}
                </span>
              </div>
            )}
            {produtoDestaque && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
                  Destaque no catálogo
                </p>
                <Link
                  href={`/portal/loja/${tenantId}/${produtoDestaque.id}`}
                  className="mt-1 block text-sm font-medium text-[rgb(var(--foreground))] hover:underline"
                >
                  {produtoDestaque.nome}
                </Link>
              </div>
            )}
            {podeVerPedidos && pedidosAbertos > 0 && (
              <Link
                href="/portal/loja/pedidos"
                className="block text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Ver pedidos →
              </Link>
            )}
          </div>
        )}

        {slug === 'social-e-eventos' && isGestor && projetosAtivos > 0 && (
          <div
            id="rateio"
            className="mt-4 scroll-mt-20 space-y-2 rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.5)] p-3"
          >
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]" />
              <p className="text-xs font-semibold text-[rgb(var(--foreground))]">
                Rateio no livro-caixa
              </p>
            </div>
            <p className="text-[11px] leading-relaxed text-[rgb(var(--foreground-muted))]">
              O gasto dos projetos vem das despesas lançadas no Financeiro com departamento/projeto
              preenchidos — não digite “quanto gastei” no projeto.
              {despesasSemProjeto > 0
                ? ` Há ${despesasSemProjeto} despesa${despesasSemProjeto === 1 ? '' : 's'} deste departamento sem projeto nos últimos 90 dias.`
                : ''}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Link
                href={`/portal/departamentos/${slug}/projetos`}
                className="text-[11px] font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Ver projetos
              </Link>
              {podeGerirFinanceiro ? (
                <Link
                  href="/admin/financeiro"
                  prefetch={false}
                  className="text-[11px] font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                >
                  Lançar no financeiro →
                </Link>
              ) : podeVerFinanceiro ? (
                <Link
                  href="/portal/financeiro"
                  className="text-[11px] font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                >
                  Ver livro-caixa →
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {comAgenda && (
          <div id="agenda" className="mt-4 scroll-mt-20 border-t border-[rgb(var(--border))] pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
              {priorizouProjeto
                ? 'Agenda dos projetos'
                : slug === 'feminino'
                  ? 'Agenda de ações'
                  : 'Próximos na agenda'}
            </p>
            {proximos.length === 0 ? (
              <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                Nenhum evento futuro. Gestores agendam em Eventos
                {projetosAtivos > 0 ? ' e podem vincular ao projeto' : ''}.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {proximos.map((e) => (
                  <li key={e.id} className="text-xs">
                    <Link
                      href={`/portal/eventos/${e.id}`}
                      className="font-medium text-[rgb(var(--foreground))] hover:underline"
                    >
                      {e.titulo}
                    </Link>
                    <p className="text-[rgb(var(--foreground-muted))]">
                      {e.projetoTitulo ? (
                        <>
                          <span className="text-[rgb(var(--color-primary-fg))]">{e.projetoTitulo}</span>
                          {' · '}
                        </>
                      ) : (
                        <>
                          {TIPO_EVENTO_LABEL[e.tipo] ?? e.tipo}
                          {' · '}
                        </>
                      )}
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(e.data)}
                      {' · '}
                      {e._count.rsvps} confirmado{e._count.rsvps === 1 ? '' : 's'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {(slug === 'feminino' || slug === 'social-e-eventos') && (
              <Link
                href="/portal/eventos"
                className="mt-2 inline-block text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Ver todos os eventos →
              </Link>
            )}
            {projetosAtivos > 0 && (
              <Link
                href={`/portal/departamentos/${slug}/projetos`}
                className="mt-2 block text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--color-primary-fg))]"
              >
                {projetosAtivos} projeto{projetosAtivos === 1 ? '' : 's'} em andamento →
              </Link>
            )}
          </div>
        )}
      </div>

      {moduloHref && (
        <Link
          href={moduloHref}
          className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
        >
          {ctaModulo}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {isGestor && operacaoHref && (
        <Link
          href={operacaoHref}
          prefetch={false}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <Shield className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          Operação (admin)
        </Link>
      )}
    </div>
  )
}

export function DepartamentoThinSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-36 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
      <div className="h-10 rounded-lg bg-[rgb(var(--border))]" />
    </div>
  )
}
