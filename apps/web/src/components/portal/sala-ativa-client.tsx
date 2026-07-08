'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MessageSquare, Power, Users } from 'lucide-react'
import { MeetRoom } from '@/components/portal/meet-room'
import { SalaChat, type SalaMensagem } from '@/components/portal/sala-chat'
import { SalaParticipantes, type ParticipanteSala } from '@/components/portal/sala-participantes'

type SalaAtivaClientProps = {
  sala: {
    id: string
    titulo: string
    linkConvite: string
    tipo: string
    criadoEm: string
    encerradaEm: string | null
    host: { id: string; nome: string | null }
    evento: { titulo: string } | null
  }
  isHost: boolean
  userId: string
  userName: string
  livekitOk: boolean
  token: string | null
  livekitUrl: string | null
  initialParticipantes: ParticipanteSala[]
  initialMensagens: SalaMensagem[]
  encerrarSalaAction: () => void
}

function formatarData(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export function SalaAtivaClient({
  sala,
  isHost,
  userId,
  userName,
  livekitOk,
  token,
  livekitUrl,
  initialParticipantes,
  initialMensagens,
  encerrarSalaAction,
}: SalaAtivaClientProps) {
  const [onlineCount, setOnlineCount] = useState(initialParticipantes.length)

  const handleCountChange = useCallback((count: number) => {
    setOnlineCount(count)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/portal/comunidade/salas"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para salas
          </Link>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{sala.titulo}</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Anfitrião: {sala.host.nome ?? 'Membro'} · {onlineCount} participante(s) online
          </p>
        </div>

        {isHost && !sala.encerradaEm && (
          <form action={encerrarSalaAction}>
            <button className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950">
              <Power className="h-4 w-4" />
              Encerrar sala
            </button>
          </form>
        )}
      </div>

      {sala.evento && (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-sm text-[rgb(var(--foreground))]">
          Sala vinculada ao evento <strong>{sala.evento.titulo}</strong>
        </div>
      )}

      {sala.encerradaEm ? (
        <div className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center">
          <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
            Esta sala foi encerrada em {formatarData(sala.encerradaEm)}
          </p>
        </div>
      ) : !livekitOk ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Vídeo indisponível — LiveKit não configurado neste ambiente.
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            O chat da sala abaixo continua funcionando.
          </p>
        </div>
      ) : (
        token &&
        livekitUrl && (
          <section className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm">
            <MeetRoom
              salaId={sala.id}
              token={token}
              serverUrl={livekitUrl}
              isHost={isHost}
              userId={userId}
              userName={userName}
              onOnlineCountChange={handleCountChange}
            />
          </section>
        )
      )}

      {!sala.encerradaEm && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              <MessageSquare className="h-4 w-4" />
              Chat da sala
            </h2>
            <SalaChat salaId={sala.id} currentUserId={userId} initialMensagens={initialMensagens} />
          </section>

          <aside className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              <Users className="h-4 w-4" />
              Participantes online
            </h2>
            <SalaParticipantes
              salaId={sala.id}
              initialParticipantes={initialParticipantes}
              onCountChange={handleCountChange}
            />

            <dl className="mt-6 space-y-2 border-t border-[rgb(var(--border))] pt-4 text-sm">
              <div>
                <dt className="text-[rgb(var(--foreground-muted))]">Convite</dt>
                <dd className="font-mono text-[rgb(var(--foreground))]">{sala.linkConvite}</dd>
              </div>
              <div>
                <dt className="text-[rgb(var(--foreground-muted))]">Criada em</dt>
                <dd className="text-[rgb(var(--foreground))]">{formatarData(sala.criadoEm)}</dd>
              </div>
              <div>
                <dt className="text-[rgb(var(--foreground-muted))]">Tipo</dt>
                <dd className="text-[rgb(var(--foreground))]">{sala.tipo}</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
    </div>
  )
}
