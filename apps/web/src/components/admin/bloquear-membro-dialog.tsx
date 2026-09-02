'use client'

import { useState } from 'react'
import { MOTIVO_BLOQUEIO_MIN, MOTIVO_BLOQUEIO_MAX } from '@torcida/types'
import { AppModal, AppModalBody } from '@/components/ui/app-modal'
import { runPersistAction } from '@/lib/toast-action'
import { AppButton } from '@/components/ui/button'
import { X } from 'lucide-react'

interface BloquearMembroDialogProps {
  aberto: boolean
  nomeMembro?: string | null
  onFechar: () => void
  bloquear: (motivo: string) => Promise<unknown>
}

/**
 * Motivo é obrigatório e vai para o `AuditLog` — bloqueio sem justificativa
 * registrada é o tipo de decisão que ninguém consegue revisar depois.
 * Quem renderiza troca a `key` ao abrir, então o estado nasce do zero.
 */
export function BloquearMembroDialog({
  aberto,
  nomeMembro,
  onFechar,
  bloquear,
}: BloquearMembroDialogProps) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [tentouEnviar, setTentouEnviar] = useState(false)

  const motivoCurto = motivo.trim().length < MOTIVO_BLOQUEIO_MIN

  async function handleConfirmar() {
    setTentouEnviar(true)
    if (motivoCurto) return
    setEnviando(true)
    try {
      const ok = await runPersistAction(() => bloquear(motivo.trim()), {
        success: 'Usuário bloqueado.',
        successDescription:
          'Novas solicitações para esta unidade e as unidades abaixo dela serão recusadas.',
        errorFallback: 'Não foi possível bloquear.',
      })
      if (ok) onFechar()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AppModal
      open={aberto}
      onClose={onFechar}
      size="sm"
      layer="nested"
      busy={enviando}
    >
      <div className="border-b border-[rgb(var(--border))] px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">
          Bloquear {nomeMembro?.trim() || 'usuário'}
        </h2>
        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
          A pessoa deixa de conseguir enviar solicitações para esta unidade e para as
          unidades abaixo dela. Não desliga quem já é associado.
        </p>
      </div>

      <AppModalBody className="px-4 py-3 sm:px-5">
          <label
            htmlFor="motivo-bloqueio"
            className="block text-sm font-medium text-[rgb(var(--foreground))]"
          >
            Motivo
          </label>
          <textarea
            id="motivo-bloqueio"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={MOTIVO_BLOQUEIO_MAX}
            rows={4}
            autoFocus
            className="mt-1.5 w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))]"
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            <p
              className={[
                'text-xs',
                tentouEnviar && motivoCurto
                  ? 'text-danger'
                  : 'text-[rgb(var(--foreground-muted))]',
              ].join(' ')}
            >
              Mínimo de {MOTIVO_BLOQUEIO_MIN} caracteres. Fica registrado na auditoria.
            </p>
            <span className="shrink-0 text-xs text-[rgb(var(--foreground-muted))]">
              {motivo.trim().length}/{MOTIVO_BLOQUEIO_MAX}
            </span>
          </div>
      </AppModalBody>

        <div className="flex items-center justify-end gap-2 border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5">
          <AppButton
            variant="none"
            icon={X}
            type="button"
            onClick={onFechar}
            disabled={enviando}
            className="rounded-lg px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] disabled:opacity-50"
          >
            Cancelar
          </AppButton>
          <button
            type="button"
            onClick={() => void handleConfirmar()}
            disabled={enviando}
            className="rounded-lg bg-[rgb(var(--color-danger))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--color-danger-fg))] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? 'Bloqueando…' : 'Bloquear'}
          </button>
        </div>
    </AppModal>
  )
}
