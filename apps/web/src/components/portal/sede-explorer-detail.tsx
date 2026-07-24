'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  Navigation,
  Phone,
  Users,
} from 'lucide-react'
import {
  buildDirectionsUrl,
  buildGoogleMapsUrl,
  resolveSedeLocationImage,
} from '@/lib/google-maps'
import { formatarDistanciaKm } from '@/lib/onboarding-unidade'
import {
  TIPO_CLASS,
  TIPO_LABEL,
  type SedeExplorerItem,
} from '@/components/portal/sede-explorer-types'

const HERO_W = 800
const HERO_H = 360

type Props = {
  sede: SedeExplorerItem
  distanciaKm: number | null
  onSelectFilho: (id: string) => void
}

export function SedeExplorerDetail({ sede, distanciaKm, onSelectFilho }: Props) {
  const mapsUrl = buildGoogleMapsUrl(sede)
  const directionsUrl = buildDirectionsUrl(sede)
  const heroUrl = resolveSedeLocationImage(sede, { width: HERO_W, height: HERO_H })
  const enderecoCompleto = [sede.endereco, sede.cidade, sede.estado, sede.cep]
    .filter(Boolean)
    .join(', ')
  const distanciaLabel = distanciaKm != null ? formatarDistanciaKm(distanciaKm) : null

  const infoRows: Array<{ icon: typeof MapPin; label: string; value: string }> = [
    ...(enderecoCompleto
      ? [{ icon: MapPin, label: 'Endereço', value: enderecoCompleto }]
      : []),
    ...(distanciaLabel
      ? [{ icon: Navigation, label: 'Distância', value: `cerca de ${distanciaLabel}` }]
      : []),
    ...(sede.responsavel
      ? [{ icon: Users, label: 'Responsável', value: sede.responsavel }]
      : []),
    ...(sede.telefone ? [{ icon: Phone, label: 'Telefone', value: sede.telefone }] : []),
    ...(sede.capacidade != null
      ? [{ icon: Building2, label: 'Capacidade', value: `${sede.capacidade} pessoas` }]
      : []),
    ...(sede.horarios ? [{ icon: Clock, label: 'Horários', value: sede.horarios }] : []),
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="relative aspect-[16/7] min-h-[9rem] bg-[rgb(var(--background-subtle))] sm:aspect-[21/8]">
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt={`Fachada — ${sede.nome}`}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 60vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[rgb(var(--foreground-muted))]">
            <MapPin className="h-7 w-7 opacity-50" />
            <span className="text-xs">Sem imagem da fachada</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-4 pt-14">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TIPO_CLASS[sede.tipo]}`}>
              {TIPO_LABEL[sede.tipo]}
            </span>
            {distanciaLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--color-primary))] px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                <Navigation className="h-2.5 w-2.5" aria-hidden />
                {distanciaLabel}
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-balance text-lg font-bold text-white sm:text-xl">{sede.nome}</h2>
          {sede.sedePai && (
            <p className="mt-0.5 text-xs text-white/80">
              Pertence a{' '}
              <button
                type="button"
                onClick={() => onSelectFilho(sede.sedePai!.id)}
                className="font-medium underline underline-offset-2 hover:text-white"
              >
                {sede.sedePai.nome}
              </button>
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              <Navigation className="h-3.5 w-3.5" />
              Como chegar
            </a>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--color-primary))]/50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir no Maps
            </a>
          )}
          {sede.telefone && (
            <a
              href={`tel:${sede.telefone.replace(/\s/g, '')}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--color-primary))]/50"
            >
              <Phone className="h-3.5 w-3.5" />
              Ligar
            </a>
          )}
        </div>

        {infoRows.length > 0 && (
          <div className="space-y-2.5">
            {infoRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                  <Icon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-[rgb(var(--foreground-muted))]">{label}</p>
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {sede.descricao && (
          <div className="flex gap-3 border-t border-[rgb(var(--border))] pt-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
              <FileText className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            </div>
            <p className="whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">{sede.descricao}</p>
          </div>
        )}

        {sede.filhos.length > 0 && (
          <div className="border-t border-[rgb(var(--border))] pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Locais vinculados ({sede.filhos.length})
            </h3>
            <ul className="space-y-1.5">
              {sede.filhos.map((filho) => (
                <li key={filho.id}>
                  <button
                    type="button"
                    onClick={() => onSelectFilho(filho.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-left text-sm transition-colors hover:border-[rgb(var(--color-primary))]/45"
                  >
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${TIPO_CLASS[filho.tipo]}`}>
                      {TIPO_LABEL[filho.tipo]}
                    </span>
                    <span className="min-w-0 truncate font-medium text-[rgb(var(--foreground))]">{filho.nome}</span>
                    {filho.cidade && (
                      <span className="ml-auto shrink-0 text-[11px] text-[rgb(var(--foreground-muted))]">
                        {filho.cidade}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {sede.eventos.length > 0 && (
          <div className="border-t border-[rgb(var(--border))] pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Próximos eventos aqui
            </h3>
            <ul className="space-y-1.5">
              {sede.eventos.map((evento) => (
                <li key={evento.id}>
                  <Link
                    href={`/portal/eventos/${evento.id}`}
                    className="flex items-center gap-3 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm transition-colors hover:border-[rgb(var(--color-primary))]/45"
                  >
                    <Calendar className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[rgb(var(--foreground))]">{evento.titulo}</p>
                      <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(evento.data))}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
