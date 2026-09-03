'use client'

import { Eye, Sparkles } from 'lucide-react'
import type { MemoriaConvite } from '@/lib/memoria-acervo'
import { AppButton } from '@/components/ui/button'

type Props = {
  convite: MemoriaConvite
  onAceitar: () => void
}

export function MemoriaConviteBloco({ convite, onAceitar }: Props) {
  return (
    <div className="flex gap-3 rounded-2xl border border-[rgb(var(--color-primary)_/_0.28)] bg-[rgb(var(--color-primary)_/_0.06)] p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
        <Sparkles className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[rgb(var(--foreground))]">{convite.titulo}</p>
        <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
          {convite.descricao}
        </p>
        {convite.abrirComposer && (
          <AppButton
            variant="none"
            icon={Eye}
            type="button"
            onClick={onAceitar}
            className="app-touch-line mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--color-primary-fg))]"
          >
            Abrir editor
          </AppButton>
        )}
      </div>
    </div>
  )
}
