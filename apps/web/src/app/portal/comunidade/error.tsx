'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ComunidadeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[portal/comunidade]', error.digest ?? error.message)
  }, [error])

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center">
      <h1 className="text-lg font-semibold text-[rgb(var(--foreground))]">
        Não foi possível carregar a comunidade
      </h1>
      <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
        Algo falhou ao montar o feed. Tente recarregar; se persistir, volte ao portal e entre de
        novo.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-[rgb(var(--foreground-muted))]">
          ref: {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-[rgb(var(--primary))] px-5 py-2 text-sm font-semibold text-white"
        >
          Tentar de novo
        </button>
        <Link
          href="/portal/comunidade"
          className="rounded-full border border-[rgb(var(--border))] px-5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))]"
        >
          Recarregar página
        </Link>
      </div>
    </div>
  )
}
