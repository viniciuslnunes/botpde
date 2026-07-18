'use client'

import { useRef, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { atualizarCorDepartamento } from '../actions'
import { runPersistAction } from '@/lib/toast-action'
import { iconeDepartamento } from './departamento-icone'

const HEX_COR = /^#[0-9a-fA-F]{6}$/

export function DepartamentoCorPicker({
  departamentoId,
  cor,
  nome,
  slug,
}: {
  departamentoId: string
  cor: string
  nome: string
  /** Resolve o ícone no client — não passar componente Lucide do Server Component. */
  slug: string
}) {
  const Icon = iconeDepartamento(slug)
  const inputRef = useRef<HTMLInputElement>(null)
  const [corAtual, setCorAtual] = useState(cor)
  const [pending, startTransition] = useTransition()

  function abrirSeletor() {
    inputRef.current?.click()
  }

  function onChange(next: string) {
    if (!HEX_COR.test(next)) return
    setCorAtual(next)
    startTransition(async () => {
      const ok = await runPersistAction(
        () => atualizarCorDepartamento(departamentoId, next),
        { success: `Cor de ${nome} atualizada.` },
      )
      if (!ok) setCorAtual(cor)
    })
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={abrirSeletor}
        disabled={pending}
        title={`Alterar cor de ${nome}`}
        aria-label={`Alterar cor de ${nome}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface))] disabled:opacity-70"
        style={{ backgroundColor: corAtual }}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Icon className="h-5 w-5" aria-hidden />
        )}
      </button>
      <input
        ref={inputRef}
        type="color"
        value={HEX_COR.test(corAtual) ? corAtual : '#6b7280'}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  )
}
