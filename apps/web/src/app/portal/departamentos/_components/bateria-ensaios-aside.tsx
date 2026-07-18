import Link from 'next/link'
import { ArrowRight, Music2, Shield } from 'lucide-react'
import { carregarPainelEventosTipo, getEventoEmbarque, listarEventosPorTipo } from '@/lib/eventos-tipo'

export async function BateriaEnsaiosAside({
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
          <Music2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Ensaios</h2>
        </div>
        <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
          Você faz parte de {nome}, mas o acesso aos ensaios exige ser membro deste departamento ou ter
          permissão de eventos.
        </p>
      </div>
    )
  }

  const [{ proximos, totalProximos, confirmadosProximos }, recentes] = await Promise.all([
    carregarPainelEventosTipo(tenantId, 'ENSAIO', 5),
    listarEventosPorTipo(tenantId, 'ENSAIO', { futuros: false, limite: 1 }),
  ])

  const ultimo = recentes[0] ?? null
  const ultimoDetalhe = ultimo
    ? await getEventoEmbarque(tenantId, ultimo.id, 'ENSAIO')
    : null
  const ultimoConfirmados =
    ultimoDetalhe?.rsvps.filter((r) => r.status === 'CONFIRMADO') ?? []
  const ultimoPresentes = ultimoConfirmados.filter((r) => r.checkedInAt).length
  const pctPresenca =
    ultimoConfirmados.length > 0
      ? Math.round((ultimoPresentes / ultimoConfirmados.length) * 100)
      : null

  return (
    <div className="space-y-4">
      <div id="ensaios" className="scroll-mt-20 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Ensaios</h2>
        </div>
        {totalProximos > 0 || pctPresenca != null ? (
          <>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[rgb(var(--foreground-muted))]">Próximos</dt>
                <dd className="font-semibold tabular-nums">{totalProximos}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[rgb(var(--foreground-muted))]">Confirmados</dt>
                <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {confirmadosProximos}
                </dd>
              </div>
              {pctPresenca != null && ultimo && (
                <div className="flex justify-between gap-3 border-t border-[rgb(var(--border))] pt-2">
                  <dt className="text-[rgb(var(--foreground-muted))]">
                    Presença · {ultimo.titulo}
                  </dt>
                  <dd className="font-semibold tabular-nums">{pctPresenca}%</dd>
                </div>
              )}
            </dl>
            <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-3">
              {proximos.map((e) => (
                <li key={e.id} className="text-xs">
                  <Link
                    href={`/portal/eventos/${e.id}`}
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
            Nenhum ensaio futuro. Gestores agendam no módulo.
          </p>
        )}
      </div>
      {moduloHref && (
        <Link
          href={moduloHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Abrir bateria
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      <Link
        href="/portal/patrimonio"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
      >
        Patrimônio do departamento
        <ArrowRight className="h-4 w-4" />
      </Link>
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

export function BateriaEnsaiosSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-40 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
      <div className="h-10 rounded-lg bg-[rgb(var(--border))]" />
    </div>
  )
}
