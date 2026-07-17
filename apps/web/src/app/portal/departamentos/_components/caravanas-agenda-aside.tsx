import Link from 'next/link'
import { ArrowRight, Bus, Shield } from 'lucide-react'
import { formatarMoedaBRL } from '@torcida/types'
import { db } from '@torcida/db'
import { carregarPainelEventosTipo, getEventoEmbarque } from '@/lib/eventos-tipo'

export async function CaravanasAgendaAside({
  tenantId,
  nome,
  isGestor,
  moduloHref,
  operacaoHref,
  podeVer,
}: {
  tenantId: string
  nome: string
  isGestor: boolean
  moduloHref: string | null
  operacaoHref: string | null
  podeVer: boolean
}) {
  if (!podeVer) {
    return (
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-2">
          <Bus className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Caravanas</h2>
        </div>
        <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
          Você faz parte de {nome}, mas o acesso à agenda de caravanas exige ser membro desta
          área ou ter permissão de eventos.
        </p>
      </div>
    )
  }

  const { proximos, totalProximos, confirmadosProximos } = await carregarPainelEventosTipo(
    tenantId,
    'CARAVANA',
    5,
  )

  const proxima = proximos[0] ?? null
  const embarque = proxima
    ? await getEventoEmbarque(tenantId, proxima.id, 'CARAVANA')
    : null
  const confirmados = embarque?.rsvps.filter((r) => r.status === 'CONFIRMADO') ?? []
  const embarcados = confirmados.filter((r) => r.checkedInAt).length
  const capacidade = embarque?.sede?.capacidade ?? null

  const valorVagaNum =
    proxima?.valorVaga == null
      ? null
      : typeof proxima.valorVaga === 'number'
        ? proxima.valorVaga
        : proxima.valorVaga.toNumber()

  const vagasPagas =
    proxima && valorVagaNum != null && valorVagaNum > 0
      ? await db.cobrancaAssociacao.count({
          where: { tenantId, eventoId: proxima.id, status: 'PAGA' },
        })
      : null

  return (
    <div className="space-y-4">
      <div id="agenda" className="scroll-mt-20 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-2">
          <Bus className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Agenda</h2>
        </div>
        {totalProximos > 0 ? (
          <>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[rgb(var(--foreground-muted))]">Próximas</dt>
                <dd className="font-semibold tabular-nums">{totalProximos}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[rgb(var(--foreground-muted))]">Confirmados</dt>
                <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {confirmadosProximos}
                </dd>
              </div>
              {proxima && capacidade != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[rgb(var(--foreground-muted))]">
                    Lotação · {proxima.titulo}
                  </dt>
                  <dd
                    className={[
                      'font-semibold tabular-nums',
                      confirmados.length >= capacidade
                        ? 'text-amber-700 dark:text-amber-400'
                        : '',
                    ].join(' ')}
                  >
                    {confirmados.length}/{capacidade}
                  </dd>
                </div>
              )}
              {proxima && valorVagaNum != null && valorVagaNum > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[rgb(var(--foreground-muted))]">
                    Vaga · {formatarMoedaBRL(valorVagaNum)}
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {vagasPagas ?? 0}/{confirmados.length} pagas
                  </dd>
                </div>
              )}
              {proxima && (
                <div
                  id="embarque"
                  className="flex scroll-mt-20 justify-between gap-3 border-t border-[rgb(var(--border))] pt-2"
                >
                  <span className="text-[rgb(var(--foreground-muted))]">Checklist embarque</span>
                  <span className="font-semibold tabular-nums">
                    {embarcados}/{confirmados.length}
                  </span>
                </div>
              )}
            </dl>
            <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-3">
              {proximos.map((e) => (
                <li key={e.id} className="text-xs">
                  <Link
                    href={`/portal/caravanas/${e.id}`}
                    className="font-medium text-[rgb(var(--foreground))] hover:underline"
                  >
                    {e.titulo}
                  </Link>
                  <p className="text-[rgb(var(--foreground-muted))]">
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
          </>
        ) : (
          <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma caravana futura. Gestores agendam no módulo.
          </p>
        )}
      </div>
      {moduloHref && (
        <Link
          href={moduloHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Abrir caravanas
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {isGestor && operacaoHref && (
        <Link
          href={operacaoHref}
          prefetch={false}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
        >
          <Shield className="h-4 w-4 text-[rgb(var(--primary))]" />
          Operação (admin)
        </Link>
      )}
    </div>
  )
}

export function CaravanasAgendaSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-40 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
      <div className="h-10 rounded-lg bg-[rgb(var(--border))]" />
    </div>
  )
}
