'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'

export interface SubmitButtonProps {
  /** Texto exibido quando não está enviando */
  label: string
  /** Texto exibido durante o envio (padrão: "Salvando...") */
  pendingLabel?: string
  /** Ícone exibido do lado do texto indicado por `iconPosition` (some durante o envio, dá lugar ao spinner) */
  icon?: ReactNode
  /** Lado onde o ícone aparece — "leading" (padrão, ex: ícone de salvar) ou "trailing" (ex: seta de "avançar") */
  iconPosition?: 'leading' | 'trailing'
  /** Ocupa 100% da largura do container, com padding maior — usado em formulários de página inteira (ex: cadastro) */
  fullWidth?: boolean
}

/**
 * Botão de submit para formulários com Server Actions (useActionState/action).
 * Lê o estado de pending via useFormStatus — precisa estar dentro do <form>.
 */
export function SubmitButton({
  label,
  pendingLabel = 'Salvando...',
  icon,
  iconPosition = 'leading',
  fullWidth = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus()
  const spinner = <Loader2 className="h-4 w-4 animate-spin" />

  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        'flex items-center justify-center gap-2 rounded-lg bg-[rgb(var(--color-primary))] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60',
        fullWidth ? 'w-full rounded-xl px-6 py-3 text-sm' : 'px-5 py-2.5 text-sm',
      ].join(' ')}
    >
      {iconPosition === 'leading' && (pending ? spinner : icon)}
      {pending ? pendingLabel : label}
      {iconPosition === 'trailing' && (pending ? spinner : icon)}
    </button>
  )
}
