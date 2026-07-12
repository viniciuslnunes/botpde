import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  MapPin,
  Building2,
  Phone,
  Clock,
  Users,
  FileText,
} from 'lucide-react'
import type { Metadata } from 'next'
import { SedeDetailReveal, SedeLinksAnimated } from '@/components/portal/sede-detail-motion'

export const metadata: Metadata = { title: 'Sede' }

const tipoLabel: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'Ponto de Encontro',
}

const tipoCor: Record<string, string> = {
  SEDE: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  SUBSEDE: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  PONTO_ENCONTRO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
}

export default async function SedeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const tenant = await getTenantFromHost()

  const sede = await db.sede.findUnique({
    where: { id },
    include: {
      sede: { select: { id: true, nome: true, tipo: true } },
      filhos: {
        where: { ativa: true },
        orderBy: { nome: 'asc' },
      },
      eventos: {
        where: { data: { gte: new Date() } },
        orderBy: { data: 'asc' },
        take: 5,
      },
    },
  })

  if (!sede || (tenant && sede.tenantId !== tenant.id) || !sede.ativa) notFound()

  type InfoRow = { icon: React.ElementType; label: string; value: string }

  const infoRows: InfoRow[] = [
    ...(sede.cidade || sede.endereco
      ? [
          {
            icon: MapPin,
            label: 'Endereço',
            value: [sede.endereco, sede.cidade, sede.estado].filter(Boolean).join(', '),
          },
        ]
      : []),
    ...(sede.cep ? [{ icon: MapPin, label: 'CEP', value: sede.cep }] : []),
    ...(sede.responsavel ? [{ icon: Users, label: 'Responsável', value: sede.responsavel }] : []),
    ...(sede.telefone ? [{ icon: Phone, label: 'Telefone', value: sede.telefone }] : []),
    ...(sede.capacidade
      ? [{ icon: Building2, label: 'Capacidade', value: `${sede.capacidade} pessoas` }]
      : []),
    ...(sede.horarios ? [{ icon: Clock, label: 'Horários', value: sede.horarios }] : []),
  ]

  return (
    <div className="space-y-6">
      <SedeDetailReveal index={0}>
      <div>
        <Link
          href="/portal/sedes"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Todas as sedes
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tipoCor[sede.tipo]}`}>
            {tipoLabel[sede.tipo]}
          </span>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{sede.nome}</h1>
        </div>

        {sede.sede && (
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            Pertence a{' '}
            <Link
              href={`/portal/sedes/${sede.sede.id}`}
              className="font-medium text-[rgb(var(--foreground))] underline underline-offset-2"
            >
              {sede.sede.nome}
            </Link>
          </p>
        )}
      </div>
      </SedeDetailReveal>

      {infoRows.length > 0 && (
        <SedeDetailReveal index={1}>
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
          <div className="space-y-3">
            {infoRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                  <Icon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">{label}</p>
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {sede.descricao && (
            <div className="mt-5 flex gap-3 border-t border-[rgb(var(--border))] pt-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                <FileText className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              </div>
              <p className="text-sm text-[rgb(var(--foreground))] whitespace-pre-wrap">{sede.descricao}</p>
            </div>
          )}
        </div>
        </SedeDetailReveal>
      )}

      {sede.filhos.length > 0 && (
        <SedeDetailReveal index={2}>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Locais vinculados ({sede.filhos.length})
          </h2>
          <SedeLinksAnimated
            variant="filho"
            items={sede.filhos.map((filho: (typeof sede.filhos)[number]) => ({
              id: filho.id,
              href: `/portal/sedes/${filho.id}`,
              tipoLabel: tipoLabel[filho.tipo],
              tipoClass: tipoCor[filho.tipo],
              titulo: filho.nome,
              subtitulo: filho.cidade,
            }))}
          />
        </div>
        </SedeDetailReveal>
      )}

      {sede.eventos.length > 0 && (
        <SedeDetailReveal index={3}>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Próximos eventos aqui
          </h2>
          <SedeLinksAnimated
            variant="evento"
            items={sede.eventos.map((evento: (typeof sede.eventos)[number]) => ({
              id: evento.id,
              href: `/portal/eventos/${evento.id}`,
              tipoLabel: '',
              tipoClass: '',
              titulo: evento.titulo,
              subtitulo: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                new Date(evento.data),
              ),
            }))}
          />
        </div>
        </SedeDetailReveal>
      )}
    </div>
  )
}
