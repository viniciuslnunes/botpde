import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, MessageSquare, Power, Send, Users } from 'lucide-react'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { env } from '@/lib/env'
import { createRoomToken } from '@/lib/livekit'
import { getSalaById } from '@/lib/salas'
import { getTenantFromHost } from '@/lib/tenant'
import { encerrarSala, enviarMensagemSala } from '../actions'
import { MeetRoom } from '@/components/portal/meet-room'

export const metadata: Metadata = { title: 'Sala de vídeo' }
export const dynamic = 'force-dynamic'

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

export default async function SalaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  await assertMembroAtivo(tenant.id, session.user.id)

  const sala = await getSalaById(tenant.id, id)
  if (!sala) notFound()

  const isHost = session.user.id === sala.hostId
  const token = await createRoomToken(
    sala.livekitRoomName,
    session.user.id,
    session.user.name ?? 'Torcedor',
    isHost,
  )

  const enviarMensagemBound = enviarMensagemSala
  const encerrarSalaBound = encerrarSala.bind(null, sala.id)

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
            Anfitrião: {sala.host.nome ?? 'Membro'} · {sala._count.participantes} participante(s) online
          </p>
        </div>

        {isHost && !sala.encerradaEm && (
          <form action={encerrarSalaBound}>
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
            Esta sala foi encerrada em {formatarData(new Date(sala.encerradaEm))}
          </p>
        </div>
      ) : (
        <MeetRoom token={token} serverUrl={env.LIVEKIT_URL} />
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            <MessageSquare className="h-4 w-4" />
            Chat da sala
          </h2>

          <form action={enviarMensagemBound} className="mb-4 flex gap-2">
            <input type="hidden" name="salaId" value={sala.id} />
            <input
              name="conteudo"
              required
              maxLength={800}
              placeholder="Escreva uma mensagem para o grupo"
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
            />
            <button className="inline-flex items-center gap-1 rounded-xl bg-[rgb(var(--primary))] px-3 py-2 text-sm font-semibold text-white">
              <Send className="h-4 w-4" />
              Enviar
            </button>
          </form>

          {sala.mensagens.length === 0 ? (
            <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem mensagens ainda.</p>
          ) : (
            <div className="space-y-3">
              {sala.mensagens
                .slice()
                .reverse()
                .map((mensagem) => (
                  <div
                    key={mensagem.id}
                    className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3"
                  >
                    <div className="mb-1 text-xs text-[rgb(var(--foreground-muted))]">
                      {mensagem.autor.nome ?? 'Membro'} · {formatarData(new Date(mensagem.criadoEm))}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                      {mensagem.conteudo}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            <Users className="h-4 w-4" />
            Informações
          </h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-[rgb(var(--foreground-muted))]">Convite</dt>
              <dd className="font-mono text-[rgb(var(--foreground))]">{sala.linkConvite}</dd>
            </div>
            <div>
              <dt className="text-[rgb(var(--foreground-muted))]">Criada em</dt>
              <dd className="text-[rgb(var(--foreground))]">{formatarData(new Date(sala.criadoEm))}</dd>
            </div>
            <div>
              <dt className="text-[rgb(var(--foreground-muted))]">Tipo</dt>
              <dd className="text-[rgb(var(--foreground))]">{sala.tipo}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  )
}
