'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Loader2, MessageCircle } from 'lucide-react'
import { toast } from '@torcida/ui'

interface PerfilMensagemActionsProps {
  userId: string
  /** Pode iniciar DM direta (visibilidade tenant/aliados, sem bloqueio). */
  podeConversar: boolean
  /** Precisa enviar solicitação com mensagem inicial. */
  podeSolicitarMensagem?: boolean
  /** Eu já bloqueei este usuário. */
  bloqueadoPorMim: boolean
}

export function PerfilMensagemActions({
  userId,
  podeConversar,
  podeSolicitarMensagem = false,
  bloqueadoPorMim,
}: PerfilMensagemActionsProps) {
  const router = useRouter()
  const [abrindo, setAbrindo] = useState(false)
  const [bloqueado, setBloqueado] = useState(bloqueadoPorMim)
  const [alternando, setAlternando] = useState(false)
  const [mostrarSolicitacao, setMostrarSolicitacao] = useState(false)
  const [mensagemInicial, setMensagemInicial] = useState('')

  async function abrirConversa(conteudo?: string) {
    setAbrindo(true)
    try {
      const res = await fetch('/api/conversas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'DIRETA',
          destinatarioId: userId,
          ...(conteudo ? { conteudo } : {}),
        }),
      })
      const data = (await res.json()) as {
        conversaId?: string
        error?: string
        precisaMensagem?: boolean
        solicitacao?: boolean
      }
      if (!res.ok || !data.conversaId) {
        if (data.precisaMensagem) {
          setMostrarSolicitacao(true)
          setAbrindo(false)
          return
        }
        throw new Error(data.error ?? 'Erro ao abrir conversa.')
      }
      if (data.solicitacao) {
        toast.success('Solicitação enviada. Aguarde a aprovação do membro.')
      }
      router.push(`/portal/mensagens?c=${data.conversaId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao abrir conversa.')
      setAbrindo(false)
    }
  }

  async function alternarBloqueio() {
    setAlternando(true)
    try {
      const res = await fetch(`/api/usuarios/${userId}/bloqueio`, {
        method: bloqueado ? 'DELETE' : 'POST',
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erro ao atualizar bloqueio.')
      setBloqueado(!bloqueado)
      toast.success(bloqueado ? 'Usuário desbloqueado.' : 'Usuário bloqueado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar bloqueio.')
    } finally {
      setAlternando(false)
    }
  }

  const podeAcionarMensagem = (podeConversar || podeSolicitarMensagem) && !bloqueado

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {podeAcionarMensagem && !mostrarSolicitacao && (
          <button
            type="button"
            disabled={abrindo}
            onClick={() => {
              if (podeSolicitarMensagem && !podeConversar) {
                setMostrarSolicitacao(true)
                return
              }
              void abrirConversa()
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {abrindo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            {podeSolicitarMensagem && !podeConversar ? 'Solicitar conversa' : 'Mensagem'}
          </button>
        )}
        <button
          type="button"
          disabled={alternando}
          onClick={() => void alternarBloqueio()}
          className={[
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60',
            bloqueado
              ? 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]'
              : 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30',
          ].join(' ')}
        >
          {alternando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
          {bloqueado ? 'Desbloquear' : 'Bloquear'}
        </button>
      </div>

      {mostrarSolicitacao && podeSolicitarMensagem && (
        <div className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Envie uma mensagem inicial. O membro precisa aprovar antes da conversa continuar.
          </p>
          <textarea
            value={mensagemInicial}
            onChange={(e) => setMensagemInicial(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Olá! Gostaria de conversar com você…"
            className="w-full resize-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={abrindo || mensagemInicial.trim().length === 0}
              onClick={() => void abrirConversa(mensagemInicial.trim())}
              className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {abrindo ? 'Enviando…' : 'Enviar solicitação'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarSolicitacao(false)
                setMensagemInicial('')
              }}
              className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
