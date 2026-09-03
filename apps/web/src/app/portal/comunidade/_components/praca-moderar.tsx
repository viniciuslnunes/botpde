'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@torcida/ui'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { moderarRespostaAction, moderarTopicoAction } from '../praca-actions'
import { AppButton } from '@/components/ui/button'
import { Check, EyeOff, Pin, PinOff, RotateCcw, XCircle } from 'lucide-react'

const btnModerarClass =
  'app-touch-target rounded-lg px-2 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-50'

export function ModerarTopicoBotoes({
  escopo,
  topicoId,
  fixado,
  status,
}: {
  escopo: EscopoComunidade
  topicoId: string
  fixado: boolean
  status: 'PENDENTE' | 'VISIVEL' | 'REJEITADO' | 'OCULTO' | 'REMOVIDO'
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [rejeitando, setRejeitando] = useState(false)
  const [motivo, setMotivo] = useState('')

  function agir(acao: 'fixar' | 'ocultar' | 'aprovar' | 'rejeitar') {
    if (acao === 'rejeitar' && !motivo.trim()) {
      toast.error('Diga o motivo da recusa.')
      return
    }
    const fd = new FormData()
    fd.set('escopo', escopo)
    fd.set('topicoId', topicoId)
    fd.set('acao', acao)
    if (acao === 'rejeitar') fd.set('motivo', motivo.trim())
    start(async () => {
      const r = await moderarTopicoAction(fd)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(
        acao === 'aprovar'
          ? 'Tópico no ranking.'
          : acao === 'rejeitar'
            ? 'Tópico recusado.'
            : acao === 'ocultar'
              ? 'Tópico oculto.'
              : fixado
                ? 'Tópico desafixado.'
                : 'Tópico fixado.',
      )
      if (acao === 'ocultar' || acao === 'rejeitar') {
        router.push(`/portal/comunidade/forum?escopo=${escopo}`)
        return
      }
      setRejeitando(false)
      setMotivo('')
      router.refresh()
    })
  }

  return (
    <div className="contents">
      <div className="flex flex-wrap items-center gap-0.5">
        {status === 'PENDENTE' || status === 'REJEITADO' ? (
          <AppButton
            variant="none"
            icon={Check}
            type="button"
            disabled={pending}
            onClick={() => agir('aprovar')}
            className="app-touch-target rounded-lg bg-[rgb(var(--color-primary)_/_0.14)] px-2 text-xs font-semibold text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--color-primary)_/_0.22)] disabled:opacity-50"
          >
            Aprovar
          </AppButton>
        ) : null}
        {status !== 'REJEITADO' ? (
          <AppButton
            variant="none"
            icon={XCircle}
            type="button"
            disabled={pending}
            onClick={() => setRejeitando((v) => !v)}
            className={btnModerarClass}
          >
            Recusar
          </AppButton>
        ) : null}
        {status === 'VISIVEL' ? (
          <AppButton
            variant="none"
            icon={fixado ? PinOff : Pin}
            type="button"
            disabled={pending}
            onClick={() => agir('fixar')}
            className={btnModerarClass}
          >
            {fixado ? 'Desafixar' : 'Fixar no topo'}
          </AppButton>
        ) : null}
        {status === 'VISIVEL' ? (
          <AppButton
            variant="none"
            icon={EyeOff}
            type="button"
            disabled={pending}
            onClick={() => agir('ocultar')}
            className={btnModerarClass}
          >
            Ocultar
          </AppButton>
        ) : null}
      </div>
      {rejeitando ? (
        <div className="w-full basis-full space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
          <label className="block text-xs font-medium text-[rgb(var(--foreground))]">
            Motivo da recusa
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="O que precisa mudar para este tópico entrar no fórum?"
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            />
          </label>
          <AppButton
            variant="none"
            icon={Check}
            type="button"
            disabled={pending}
            onClick={() => agir('rejeitar')}
            className="app-touch-target rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Confirmar recusa
          </AppButton>
        </div>
      ) : null}
    </div>
  )
}

export function ModerarRespostaBotao({
  escopo,
  respostaId,
  oculto,
  className,
}: {
  escopo: EscopoComunidade
  respostaId: string
  oculto: boolean
  className?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')

  function agir(acao: 'rejeitar' | 'restaurar') {
    if (acao === 'rejeitar' && !motivo.trim()) {
      toast.error('Diga o motivo da recusa.')
      return
    }
    const fd = new FormData()
    fd.set('escopo', escopo)
    fd.set('respostaId', respostaId)
    fd.set('acao', acao)
    if (acao === 'rejeitar') fd.set('motivo', motivo.trim())
    start(async () => {
      const r = await moderarRespostaAction(fd)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(acao === 'rejeitar' ? 'Resposta recusada.' : 'Resposta restaurada.')
      setAberto(false)
      setMotivo('')
      router.refresh()
    })
  }

  const btnClass = [
    'app-touch-line text-[11px] font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:opacity-50',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  if (oculto) {
    return (
      <AppButton
        variant="none"
        icon={RotateCcw}
        type="button"
        disabled={pending}
        onClick={() => agir('restaurar')}
        className={[
          'app-touch-line text-[11px] font-medium text-[rgb(var(--color-primary-fg))] hover:underline disabled:opacity-50',
          className ?? '',
        ].join(' ')}
      >
        Restaurar
      </AppButton>
    )
  }

  return (
    <div className="contents">
      <AppButton
        variant="none"
        icon={XCircle}
        type="button"
        disabled={pending}
        onClick={() => setAberto((v) => !v)}
        className={btnClass}
      >
        Recusar publicação
      </AppButton>
      {aberto ? (
        <div className="mt-2 w-full basis-full space-y-2">
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Motivo da recusa"
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm outline-none focus:border-[rgb(var(--primary))]"
          />
          <AppButton
            variant="none"
            icon={Check}
            type="button"
            disabled={pending}
            onClick={() => agir('rejeitar')}
            className="app-touch-target rounded-lg px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950 disabled:opacity-50"
          >
            Confirmar
          </AppButton>
        </div>
      ) : null}
    </div>
  )
}
