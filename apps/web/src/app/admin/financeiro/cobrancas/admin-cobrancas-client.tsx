'use client'

import { useTransition } from 'react'
import { Check, QrCode, X } from 'lucide-react'
import {
  baixarCobrancaManual,
  cancelarCobranca,
  dispararLembretesCobrancas,
  gerarPixCobranca,
} from './actions'
import { AdminRowActions } from '@/components/admin/ui'
import { runPersistAction } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'

export function AdminCobrancaAcoes({
  cobrancaId,
  status,
}: {
  cobrancaId: string
  status: string
}) {
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()
  const aberta = status === 'PENDENTE' || status === 'VENCIDA'

  if (!aberta) return null

  return (
    <AdminRowActions
      ariaLabel="Ações da cobrança"
      items={[
        {
          id: 'pix',
          label: pending ? 'Gerando…' : 'Gerar Pix',
          icon: QrCode,
          disabled: pending,
          onSelect: () =>
            startTransition(async () => {
              await runPersistAction(() => gerarPixCobranca(cobrancaId), {
                success: 'Pix gerado.',
              })
            }),
        },
        {
          id: 'baixar',
          label: 'Baixar manual',
          icon: Check,
          tone: 'success',
          disabled: pending,
          onSelect: () => {
            void confirmAction({
              titulo: 'Baixar cobrança manualmente?',
              descricao: 'A cobrança será marcada como paga sem pagamento online.',
              labelConfirmar: 'Baixar',
              variante: 'success',
              cancelled: 'Baixa cancelada.',
              run: () => baixarCobrancaManual(cobrancaId),
              success: 'Baixa registrada.',
            })
          },
        },
        {
          id: 'cancelar',
          label: 'Cancelar',
          icon: X,
          tone: 'danger',
          disabled: pending,
          onSelect: () => {
            void confirmAction({
              titulo: 'Cancelar esta cobrança?',
              descricao: 'A cobrança deixa de ficar aberta para pagamento.',
              labelConfirmar: 'Cancelar cobrança',
              variante: 'destructive',
              cancelled: 'Ação cancelada.',
              run: () => cancelarCobranca(cobrancaId),
              success: 'Cobrança cancelada.',
            })
          },
        },
      ]}
    />
  )
}

export function DispararLembretesButton() {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await runPersistAction(dispararLembretesCobrancas, {
            success: 'Lembretes enviados.',
          })
        })
      }
      className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
    >
      {pending ? 'Enviando…' : 'Disparar lembretes'}
    </button>
  )
}
