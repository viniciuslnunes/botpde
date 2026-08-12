import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { db } from '@torcida/db'
import { CAMPOS_COMPLETUDE_CLUBE, completudeClube } from '@torcida/types'

export const metadata: Metadata = { title: 'Qualidade do clube — Super Admin' }

/**
 * Qualidade **deste** clube — lacunas de `completudeClube`, sem a fila nacional.
 */
export default async function ClubeQualidadePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const clube = await db.afiliacao.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      slug: true,
      serie: true,
      estado: true,
      cidade: true,
      escudoUrl: true,
      torcedoresEstimados: true,
    },
  })
  if (!clube) notFound()

  const { completo, faltando, percentual } = completudeClube(clube)
  const faltandoSet = new Set(faltando)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Qualidade do cadastro
          </h2>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            Campos que outros módulos consomem sem checar nulo — lacuna apaga funcionalidade em
            silêncio.
          </p>
        </div>
        <p
          className={[
            'text-2xl font-semibold tabular-nums',
            completo
              ? 'text-[rgb(var(--color-success-fg))]'
              : 'text-[rgb(var(--color-warning-fg))]',
          ].join(' ')}
        >
          {percentual}%
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[rgb(var(--border))]">
        <div
          className="h-full rounded-full bg-[rgb(var(--color-primary))]"
          style={{ width: `${percentual}%` }}
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CAMPOS_COMPLETUDE_CLUBE.map((campo) => {
          const ok = !faltandoSet.has(campo.campo)
          return (
            <div
              key={campo.campo}
              className={[
                'rounded-2xl border p-4',
                ok
                  ? 'border-[rgb(var(--color-success)_/_0.35)] bg-[rgb(var(--color-success)_/_0.06)]'
                  : 'border-[rgb(var(--color-warning)_/_0.4)] bg-[rgb(var(--color-warning)_/_0.08)]',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  {campo.label}
                </p>
                {ok ? (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-[rgb(var(--color-success-fg))]"
                    aria-label="Preenchido"
                  />
                ) : (
                  <CircleAlert
                    className="h-4 w-4 shrink-0 text-[rgb(var(--color-warning-fg))]"
                    aria-label="Faltando"
                  />
                )}
              </div>
              <p
                className={[
                  'mt-1 text-sm font-semibold',
                  ok
                    ? 'text-[rgb(var(--color-success-fg))]'
                    : 'text-[rgb(var(--color-warning-fg))]',
                ].join(' ')}
              >
                {ok ? 'Ok' : 'Faltando'}
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">{campo.impacto}</p>
            </div>
          )
        })}
      </section>

      {completo ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-[rgb(var(--color-success-fg))]" aria-hidden />
          <p className="font-medium text-[rgb(var(--foreground))]">Cadastro completo</p>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Slug, série, UF, cidade, escudo e estimativa estão preenchidos.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <p className="text-sm text-[rgb(var(--foreground))]">
            Corrija as lacunas na aba <strong>Catálogo</strong> (formulário em etapas).
          </p>
          <Link
            href={`/super-admin/clubes/${id}`}
            className="mt-3 inline-flex rounded-xl bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] hover:opacity-90"
          >
            Ir para dados do clube
          </Link>
        </div>
      )}
    </div>
  )
}
