'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Loader2, MessageCircle } from 'lucide-react'
import { toast } from '@torcida/ui'

interface PerfilMensagemActionsProps {
  userId: string
  /** Pode iniciar DM (visibilidade tenant/aliados, sem bloqueio). */
  podeConversar: boolean
  /** Eu já bloqueei este usuário. */
  bloqueadoPorMim: boolean
}

export function PerfilMensagemActions({
  userId,
  podeConversar,
  bloqueadoPorMim,
}: PerfilMensagemActionsProps) {
  const router = useRouter()
  const [abrindo, setAbrindo] = useState(false)
  const [bloqueado, setBloqueado] = useState(bloqueadoPorMim)
  const [alternando, setAlternando] = useState(false)

  async function abrirConversa() {
    setAbrindo(true)
    try {
      const res = await fetch('/api/conversas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'DIRETA', destinatarioId: userId }),
      })
      const data = (await res.json()) as { conversaId?: string; error?: string }
      if (!res.ok || !data.conversaId) throw new Error(data.error ?? 'Erro ao abrir conversa.')
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

  return (
    <div className="flex items-center gap-2">
      {podeConversar && !bloqueado && (
        <button
          type="button"
          disabled={abrindo}
          onClick={() => void abrirConversa()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {abrindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          Mensagem
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
            : 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950',
        ].join(' ')}
      >
        <Ban className="h-4 w-4" />
        {bloqueado ? 'Desbloquear' : 'Bloquear'}
      </button>
    </div>
  )
}
