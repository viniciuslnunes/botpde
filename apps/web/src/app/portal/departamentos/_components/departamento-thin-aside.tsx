import Link from 'next/link'
import {
  ArrowRight,
  Calendar,
  MessageCircle,
  PartyPopper,
  Shield,
  ShoppingBag,
  Users,
} from 'lucide-react'
import { TIPO_EVENTO_LABEL, thinCopyPorSlug, THIN_COM_AGENDA } from '@torcida/types'
import { listarProximosEventosTenant } from '@/lib/eventos-tipo'

const ICONS: Record<string, typeof Users> = {
  'social-e-eventos': Calendar,
  'materiais-loja': ShoppingBag,
  comunicacao: MessageCircle,
  feminino: Users,
  carnaval: PartyPopper,
}

export async function DepartamentoThinAside({
  tenantId,
  slug,
  nome,
  isGestor,
  moduloHref,
  operacaoHref,
}: {
  tenantId: string
  slug: string
  nome: string
  isGestor: boolean
  moduloHref: string | null
  operacaoHref: string | null
}) {
  const copy = thinCopyPorSlug(slug)
  const titulo = copy?.titulo ?? nome
  const descricao =
    copy?.descricao ??
    'Use a equipe ao lado e o módulo vinculado. Gestores incluem pessoas e abrem a operação do domínio.'
  const ctaModulo = copy?.ctaModulo ?? 'Abrir módulo'
  const Icon = ICONS[slug] ?? Users
  const comAgenda = (THIN_COM_AGENDA as readonly string[]).includes(slug)

  const proximos = comAgenda ? await listarProximosEventosTenant(tenantId, 5) : []

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[rgb(var(--primary))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</h2>
        </div>
        <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">{descricao}</p>

        {comAgenda && (
          <div className="mt-4 border-t border-[rgb(var(--border))] pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
              Próximos na agenda
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
                      href={
                        e.tipo === 'CARAVANA'
                          ? `/portal/caravanas/${e.id}`
                          : e.tipo === 'ENSAIO'
                            ? `/portal/bateria/${e.id}`
                            : `/portal/eventos/${e.id}`
                      }
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
