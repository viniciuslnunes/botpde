
'use client'

import { AppButton } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export function ReciboPrintButton() {
  return (
    <AppButton
      variant="primary"
      icon={Printer}
      type="button"
      onClick={() => window.print()}
      className="no-print mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-medium"
    >
      Imprimir recibo
    </AppButton>
  )
}
