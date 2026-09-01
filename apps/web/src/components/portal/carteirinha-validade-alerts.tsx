'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

interface CarteirinhaValidadeAlertsProps {
  validadeIso: string
}

interface ValidadeStatus {
  vencida: boolean
  diasRestantes: number
  validadeLabel: string
}

export function CarteirinhaValidadeAlerts({ validadeIso }: CarteirinhaValidadeAlertsProps) {
  const [status, setStatus] = useState<ValidadeStatus | null>(null)

  useEffect(() => {
    const validade = new Date(validadeIso)
    const diffMs = validade.getTime() - Date.now()
    const next: ValidadeStatus = {
      vencida: diffMs < 0,
      diasRestantes: Math.ceil(diffMs / (1000 * 60 * 60 * 24)),
      validadeLabel: validade.toLocaleDateString('pt-BR'),
    }
    const timer = window.setTimeout(() => setStatus(next), 0)
    return () => window.clearTimeout(timer)
  }, [validadeIso])

  if (!status) return null

  const { vencida, diasRestantes, validadeLabel } = status

  if (vencida) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
        <div>
          <p className="font-semibold text-red-800 dark:text-red-200">Carteirinha vencida</p>
          <p className="mt-0.5 text-sm text-red-700 dark:text-red-300">
            Sua carteirinha venceu em {validadeLabel}. Entre em contato com a administração para renovar.
          </p>
        </div>
      </div>
    )
  }

  if (diasRestantes <= 30) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-semibold text-amber-800 dark:text-amber-200">Vence em breve</p>
          <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-300">
            Sua carteirinha vence em {diasRestantes} {diasRestantes === 1 ? 'dia' : 'dias'}. Entre em
            contato com a administração para renovar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="alert-success flex items-start gap-3 rounded-xl p-4">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">Carteirinha ativa</p>
        <p className="mt-0.5 text-sm opacity-90">
          Válida por mais {diasRestantes} {diasRestantes === 1 ? 'dia' : 'dias'}, até {validadeLabel}.
        </p>
      </div>
    </div>
  )
}
