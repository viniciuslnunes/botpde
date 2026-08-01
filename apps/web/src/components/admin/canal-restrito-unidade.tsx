'use client'

import { useState, useTransition } from 'react'
import { Loader2, LockOpen, ShieldAlert } from 'lucide-react'
import { useConfirmAction } from '@/lib/confirm-action'
import { runPersistAction } from '@/lib/toast-action'
import {
  imporReativacaoCanal,
  solicitarReativacaoCanal,
} from '@/app/admin/(estrutura)/sedes/actions'

interface CanalRestritoUnidadeProps {
  tenantId: string
  nome: string
  /** Já existe pedido aguardando resposta da liderança. */
  solicitacaoPendente: boolean
  /** Dias restantes do pedido em aberto (0 = vence hoje). */
  diasRestantes: number | null
  /** Presidente/Vice (TORCIDA_GLOBAL_VIEW na Sede). */
  podeSolicitar: boolean
  /** Só o owner da Sede pode passar por cima de uma recusa. */
  podeImpor: boolean
}

const DESCRICAO_SOLICITAR = [
  'A liderança da unidade recebe o pedido e tem 5 dias para responder.',
  '',
  '• Se aprovar, o canal reabre na hora;',
  '• se não responder até o prazo, o canal é reaberto automaticamente;',
  '• se recusar, você ainda pode impor a reabertura com justificativa.',
  '',
  'Enquanto isso, nada muda: a unidade segue operando normalmente por dentro.',
].join('\n')

/**
 * Ações da Sede sobre uma unidade com canal restrito. Ficam junto da unidade na
 * árvore — a Sede continua enxergando a unidade, com a marcação de que o
 * fechamento foi decisão da liderança local.
 */
export function CanalRestritoUnidade({
  tenantId,
  nome,
  solicitacaoPendente,
  diasRestantes,
  podeSolicitar,
  podeImpor,
}: CanalRestritoUnidadeProps) {
  const confirmarAcao = useConfirmAction()
  const [pending, startTransition] = useTransition()
  const [impondo, setImpondo] = useState(false)
  const [motivo, setMotivo] = useState('')

  /**
   * Confirmação fora de `startTransition`: esperar o modal dentro da transição
   * trava o botão em pending para sempre (o modal só monta quando a transição
   * termina, e a transição só termina depois do clique no modal).
   */
  function solicitar() {
    const fd = new FormData()
    fd.set('tenantId', tenantId)

    void confirmarAcao({
      titulo: `Pedir a reabertura do canal de ${nome}?`,
      descricao: DESCRICAO_SOLICITAR,
      labelConfirmar: 'Enviar solicitação',
      run: () => solicitarReativacaoCanal(fd),
      success: 'Solicitação enviada à liderança da unidade.',
    })
  }

  function impor() {
    const fd = new FormData()
    fd.set('tenantId', tenantId)
    fd.set('motivo', motivo)
    startTransition(async () => {
      const ok = await runPersistAction(() => imporReativacaoCanal(fd), {
        success: 'Reabertura imposta. Os vínculos da unidade foram reestabelecidos.',
      })
      if (ok) {
        setImpondo(false)
        setMotivo('')
      }
    })
  }

  if (!podeSolicitar && !podeImpor) return null

  return (
    <div className="w-full space-y-2">
      {solicitacaoPendente ? (
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Reabertura solicitada —{' '}
          {diasRestantes === null || diasRestantes <= 0
            ? 'reabre automaticamente em menos de um dia'
            : `reabre automaticamente em ${diasRestantes} dia${diasRestantes > 1 ? 's' : ''}`}
        </p>
      ) : podeSolicitar ? (
        <button
          type="button"
          disabled={pending}
          onClick={solicitar}
          className="inline-flex w-full items-center justify-center gap-1 rounded-xl bg-[rgb(var(--color-primary)_/_0.12)] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.28)] disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LockOpen className="h-3.5 w-3.5" />
          )}
          Solicitar reativação
        </button>
      ) : null}

      {podeImpor ? (
        impondo ? (
          <div className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-2">
            <label
              htmlFor={`motivo-impor-${tenantId}`}
              className="block text-[11px] font-medium text-[rgb(var(--foreground))]"
            >
              Justificativa (fica registrada e vai para a liderança)
            </label>
            <textarea
              id={`motivo-impor-${tenantId}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Mínimo de 10 caracteres."
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1.5 text-xs text-[rgb(var(--foreground))]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || motivo.trim().length < 10}
                onClick={impor}
                className="inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--foreground))] px-2.5 py-1.5 text-[11px] font-semibold text-[rgb(var(--background))] disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Confirmar imposição
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setImpondo(false)}
                className="rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))]"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setImpondo(true)}
            className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] disabled:opacity-50"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Impor reativação
          </button>
        )
      ) : null}
    </div>
  )
}
