import Link from 'next/link'
import type { Metadata } from 'next'
import { CheckCircle2 } from 'lucide-react'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { CAMPOS_COMPLETUDE_CLUBE, completudeClube } from '@torcida/types'
import { EscudoClube } from '@/components/onboarding/escudo-clube'

export const metadata: Metadata = { title: 'Qualidade do catálogo — Super Admin' }

/** Teto da fila exibida: é lista de trabalho, não relatório de tudo. */
const LIMITE_FILA = 30

type ClubeIncompleto = {
  id: string
  nome: string
  apelido: string | null
  escudoUrl: string | null
  slug: string | null
  serie: string | null
  estado: string | null
  cidade: string | null
  torcedoresEstimados: number | null
}

/**
 * Qualidade do catálogo: o que está incompleto (fila acionável).
 *
 * Cada linha é acionável (leva ao detalhe do clube) e cada contagem sai de um
 * `count` no banco — a fila em si é limitada a `LIMITE_FILA`, porque o objetivo
 * é dar o próximo trabalho, não paginar o catálogo inteiro (isso é o Catálogo).
 */
export default async function ClubesQualidadePage() {
  const filtroBase: Prisma.AfiliacaoWhereInput = { ativo: true }

  const clausulaPorCampo: Record<string, Prisma.AfiliacaoWhereInput> = {
    slug: { OR: [{ slug: null }, { slug: '' }] },
    serie: { serie: null },
    estado: { OR: [{ estado: null }, { estado: '' }] },
    escudoUrl: { OR: [{ escudoUrl: null }, { escudoUrl: '' }] },
    cidade: { OR: [{ cidade: null }, { cidade: '' }] },
    torcedoresEstimados: { OR: [{ torcedoresEstimados: null }, { torcedoresEstimados: 0 }] },
  }

  const incompleto: Prisma.AfiliacaoWhereInput = {
    AND: [filtroBase, { OR: Object.values(clausulaPorCampo) }],
  }

  const [contagens, fila, totalIncompletos]: [number[], ClubeIncompleto[], number] =
    await Promise.all([
    Promise.all(
      CAMPOS_COMPLETUDE_CLUBE.map((campo) =>
        db.afiliacao.count({ where: { AND: [filtroBase, clausulaPorCampo[campo.campo]!] } }),
      ),
    ),
    db.afiliacao.findMany({
      where: incompleto,
      select: {
        id: true,
        nome: true,
        apelido: true,
        escudoUrl: true,
        slug: true,
        serie: true,
        estado: true,
        cidade: true,
        torcedoresEstimados: true,
      },
      // Clube com torcida na plataforma primeiro: é onde a falta dói hoje.
      orderBy: [{ tenants: { _count: 'desc' } }, { nome: 'asc' }],
      take: LIMITE_FILA,
    }),
    db.afiliacao.count({ where: incompleto }),
  ])

  const labelPorCampo = new Map(CAMPOS_COMPLETUDE_CLUBE.map((c) => [c.campo, c.label]))

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CAMPOS_COMPLETUDE_CLUBE.map((campo, indice) => (
          <Link
            key={campo.campo}
            href={`/super-admin/clubes?completude=${campo.filtro}`}
            className="app-action rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Sem {campo.label.toLowerCase()}
            </p>
            <p
              className={[
                'mt-1 text-2xl font-semibold tabular-nums',
                contagens[indice] === 0
                  ? 'text-[rgb(var(--color-success-fg))]'
                  : 'text-[rgb(var(--color-warning-fg))]',
              ].join(' ')}
            >
              {contagens[indice]}
            </p>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">{campo.impacto}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-[rgb(var(--foreground))]">Fila de correção</h2>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            {totalIncompletos === 0
              ? 'Nada pendente'
              : `Mostrando ${Math.min(LIMITE_FILA, totalIncompletos)} de ${totalIncompletos} — clubes com torcida na plataforma primeiro`}
          </p>
        </div>

        {fila.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-[rgb(var(--color-success-fg))]" aria-hidden />
            <p className="font-medium text-[rgb(var(--foreground))]">Catálogo completo</p>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Todo clube ativo tem slug, série, UF, cidade, escudo e estimativa.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-[rgb(var(--border))]">
            {fila.map((clube) => {
              const { faltando, percentual } = completudeClube(clube)
              return (
                <li key={clube.id}>
                  <Link
                    href={`/super-admin/clubes/${clube.id}`}
                    className="app-action flex items-center gap-3 py-3 transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <EscudoClube
                      nome={clube.nome}
                      apelido={clube.apelido}
                      escudoUrl={clube.escudoUrl}
                      size="xs"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[rgb(var(--foreground))]">
                        {clube.nome}
                      </span>
                      <span className="block truncate text-xs text-[rgb(var(--foreground-muted))]">
                        Faltam: {faltando.map((c) => labelPorCampo.get(c) ?? c).join(', ')}
                      </span>
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-[rgb(var(--color-warning-fg))]">
                      {percentual}%
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
