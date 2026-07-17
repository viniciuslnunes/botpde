import Link from 'next/link'
import {
  ArrowRight,
  Calendar,
  MessageCircle,
  Shield,
  ShoppingBag,
  Users,
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

export async function DepartamentoThinAside({
  tenantId,
  slug,
  nome,
  isGestor,
  moduloHref,
  operacaoHref,
  podeVerPedidos = false,
  podeModerar = false,
}: {
  tenantId: string
  slug: string
  nome: string
  isGestor: boolean
  moduloHref: string | null
  operacaoHref: string | null
  podeVerPedidos?: boolean
  podeModerar?: boolean
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

  const proximos = comAgenda
    ? await listarProximosEventosTenant(tenantId, 5, tiposAgenda)
    : []

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
          <Icon className="h-4 w-4 text-[rgb(var(--primary))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</h2>
        </div>
        <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">{descricao}</p>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
          Compõe · módulo existente
        </p>

        {slug === 'comunicacao' && (
          <div className="mt-4 space-y-3 border-t border-[rgb(var(--border))] pt-3">
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
                className="block text-xs font-medium text-[rgb(var(--primary))] hover:underline"
              >
                Abrir moderação →
              </Link>
            )}
          </div>
        )}

        {slug === 'materiais-loja' && (
          <div className="mt-4 space-y-3 border-t border-[rgb(var(--border))] pt-3">
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
                  href={`/portal/loja/${produtoDestaque.id}`}
                  className="mt-1 block text-sm font-medium text-[rgb(var(--foreground))] hover:underline"
                >
                  {produtoDestaque.nome}
                </Link>
              </div>
            )}
            {podeVerPedidos && pedidosAbertos > 0 && (
              <Link
                href="/admin/loja/pedidos"
                prefetch={false}
                className="block text-xs font-medium text-[rgb(var(--primary))] hover:underline"
              >
                Ver pedidos no admin →
              </Link>
            )}
          </div>
        )}

        {comAgenda && (
          <div className="mt-4 border-t border-[rgb(var(--border))] pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
              {slug === 'feminino' ? 'Agenda de ações' : 'Próximos na agenda'}
            </p>
            {proximos.length === 0 ? (
              <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                Nenhum evento futuro. Gestores agendam em Eventos.
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
                      {TIPO_EVENTO_LABEL[e.tipo] ?? e.tipo}
                      {' · '}
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
                className="mt-2 inline-block text-xs font-medium text-[rgb(var(--primary))] hover:underline"
              >
                Ver todos os eventos →
              </Link>
            )}
          </div>
        )}
      </div>

      {moduloHref && (
        <Link
          href={moduloHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {ctaModulo}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {slug === 'feminino' && (
        <Link
          href="/portal/eventos"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          Agenda de eventos
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {isGestor && operacaoHref && (
        <Link
          href={operacaoHref}
          prefetch={false}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <Shield className="h-4 w-4 text-[rgb(var(--primary))]" />
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
