'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

const STORAGE_KEY = 'torcida:loja-ultima'

/** Grava a última loja visitada (catálogo/PDP) para “Continuar comprando”. */
export function LojaRememberStore({ tenantId }: { tenantId: string }) {
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, tenantId)
    } catch {
      /* private mode */
    }
  }, [tenantId])
  return null
}

export function useUltimaLojaHref(fallback = '/portal/loja'): string {
  const [href, setHref] = useState(fallback)
  useEffect(() => {
    try {
      const id = sessionStorage.getItem(STORAGE_KEY)
      if (id) setHref(`/portal/loja/${id}`)
    } catch {
      /* ignore */
    }
  }, [fallback])
  return href
}

export function ContinuarComprandoLink({
  className,
  children = 'Continuar comprando',
}: {
  className?: string
  children?: React.ReactNode
}) {
  const href = useUltimaLojaHref()
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

type Step = 'sacola' | 'checkout' | 'pedido'

const STEPS: { id: Step; label: string; href?: string }[] = [
  { id: 'sacola', label: 'Sacola', href: '/portal/loja/sacola' },
  { id: 'checkout', label: 'Checkout', href: '/portal/loja/checkout' },
  { id: 'pedido', label: 'Pedido' },
]

export function LojaCheckoutStepper({
  atual,
  lojasCount,
}: {
  atual: Step
  /** Quando > 1, deixa claro que o checkout abre N pedidos. */
  lojasCount?: number
}) {
  const idx = STEPS.findIndex((s) => s.id === atual)

  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap items-center gap-2 sm:gap-3">
        {STEPS.map((step, i) => {
          const done = i < idx
          const active = i === idx
          const content = (
            <span
              className={[
                'inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]',
                active
                  ? 'text-[rgb(var(--color-primary-fg))]'
                  : done
                    ? 'text-[rgb(var(--foreground))]'
                    : 'text-[rgb(var(--foreground-muted))]',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-flex h-5 w-5 items-center justify-center text-[10px]',
                  active || done
                    ? 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-on))]'
                    : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {step.label}
            </span>
          )

          return (
            <li key={step.id} className="flex items-center gap-2 sm:gap-3">
              {i > 0 && (
                <span className="text-[rgb(var(--foreground-muted)_/_0.45)]" aria-hidden>
                  /
                </span>
              )}
              {step.href && !active && i <= idx ? (
                <Link href={step.href} className="hover:underline">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          )
        })}
      </ol>
      {lojasCount != null && lojasCount > 1 && atual !== 'pedido' ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
          [ {lojasCount} lojas — um pedido por unidade ]
        </p>
      ) : null}
    </div>
  )
}
