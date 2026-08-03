import Link from 'next/link'
import { ArrowRight, ClipboardList, Music2, Shield } from 'lucide-react'
import { db } from '@torcida/db'
import { carregarPainelEventosTipo, getEventoEmbarque, listarEventosPorTipo } from '@/lib/eventos-tipo'

type EscalaLite = {
  id: string
  titulo: string
  data: Date
  partidaId: string | null
  confirmados: number
  presentes: number
}

async function carregarEscalasJogo(
  tenantId: string,
  departamentoId: string,
): Promise<EscalaLite[]> {
  const area: { id: string } | null = await db.departamentoArea.findFirst({
    where: { tenantId, departamentoId, slug: 'escala-de-jogo', ativa: true },
    select: { id: true },
  })

  type Row = {
    id: string
    titulo: string
    data: Date
    partidaId: string | null
    rsvps: Array<{ status: string; checkedInAt: Date | null }>
  }

  const agora = new Date()
  const rows: Row[] = await db.evento.findMany({
    where: {
      tenantId,
      data: { gte: agora },
      OR: [
        ...(area
          ? [{ projeto: { areaId: area.id, departamentoId, tenantId } } as const]
          : []),
        { partidaId: { not: null } },
      ],
    },
    orderBy: { data: 'asc' },
    take: 5,
    select: {
      id: true,
      titulo: true,
      data: true,
      partidaId: true,
      rsvps: {
        where: { status: { in: ['CONFIRMADO', 'LISTA_ESPERA'] } },
        select: { status: true, checkedInAt: true },
      },
    },
  })

  return rows.map((e) => {
    const confirmados = e.rsvps.filter((r) => r.status === 'CONFIRMADO')
    return {
      id: e.id,
      titulo: e.titulo,
      data: e.data,
      partidaId: e.partidaId,
      confirmados: confirmados.length,
      presentes: confirmados.filter((r) => r.checkedInAt).length,
    }
  })
}

export async function BateriaEnsaiosAside({
  tenantId,
  departamentoId,
  nome,
  isGestor,
  moduloHref,
  operacaoHref,
  podeVer,
}: {
  tenantId: string
  departamentoId: string
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

  const [{ proximos, totalProximos, confirmadosProximos }, recentes, escalas] = await Promise.all([
    carregarPainelEventosTipo(tenantId, 'ENSAIO', 5),
    listarEventosPorTipo(tenantId, 'ENSAIO', { futuros: false, limite: 1 }),
    carregarEscalasJogo(tenantId, departamentoId),
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

  const fmt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

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
                    {fmt.format(e.data)}
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

      <div
        id="escala"
        className="scroll-mt-20 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Escala de jogo</h2>
        </div>
        <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
          RSVP e presença na Agenda — quem toca no jogo, sem lista paralela.
        </p>
        {escalas.length === 0 ? (
          <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
            Nenhum jogo/escala futura. Vincule o evento ao projeto da área Escala ou a uma partida
            na Agenda.
          </p>
        ) : (
          <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-3">
            {escalas.map((e) => (
              <li key={e.id} className="text-xs">
                <Link
                  href={`/portal/eventos/${e.id}`}
                  className="font-medium text-[rgb(var(--foreground))] hover:underline"
                >
                  {e.titulo}
                </Link>
                <p className="text-[rgb(var(--foreground-muted))]">
                  {fmt.format(e.data)}
                  {e.partidaId ? ' · jogo' : ''}
                  {' · '}
                  {e.confirmados} confirmado{e.confirmados === 1 ? '' : 's'}
                  {e.confirmados > 0
                    ? ` · ${e.presentes} presente${e.presentes === 1 ? '' : 's'}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/portal/eventos"
          className="mt-3 inline-block text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Abrir agenda →
        </Link>
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
          <Shield className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
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
      <div className="h-40 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
      <div className="h-10 rounded-lg bg-[rgb(var(--border))]" />
    </div>
  )
}
