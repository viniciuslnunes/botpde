'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, ShoppingBag, Store } from 'lucide-react'
import { AnchoredPopover } from '@/components/portal/anchored-popover'
import { LogoImage } from '@/components/media/logo-image'
import { labelTipoUnidade } from '@/lib/canais-shared'
import type { LojaResumo } from '@/lib/loja-lojas'

export type LojaSwitcherItem = Pick<
  LojaResumo,
  'tenantId' | 'nome' | 'tipo' | 'cidade' | 'logoUrl' | 'principal' | 'totalProdutos'
>

export function LojaStoreSwitcher({
  atual,
  lojas,
}: {
  atual: LojaSwitcherItem
  lojas: LojaSwitcherItem[]
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const multi = lojas.length > 1

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointer(e: MouseEvent | PointerEvent) {
      const target = e.target
      if (!(target instanceof Node)) return
      if (anchorRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-anchored-popover]')) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open])

  return (
    <div className="min-w-0">
      <button
        ref={anchorRef}
        type="button"
        disabled={!multi}
        aria-expanded={multi ? open : undefined}
        aria-haspopup={multi ? 'listbox' : undefined}
        onClick={() => {
          if (multi) setOpen((v) => !v)
        }}
        className={[
          'flex max-w-full items-center gap-3 rounded-xl text-left transition-colors',
          multi
            ? 'hover:bg-[rgb(var(--background-subtle))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary)_/_0.45)]'
            : 'cursor-default',
          'px-1 py-1',
        ].join(' ')}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[rgb(var(--background-subtle))] ring-1 ring-[rgb(var(--border))]">
          {atual.logoUrl ? (
            <LogoImage src={atual.logoUrl} alt={atual.nome} size={40} className="h-10 w-10 object-cover" />
          ) : (
            <ShoppingBag className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{atual.nome}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
            {atual.principal ? 'Torcida principal' : labelTipoUnidade(atual.tipo)}
            {atual.cidade ? ` · ${atual.cidade}` : ''}
          </p>
        </div>
        {multi && (
          <ChevronDown
            className={`ml-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {multi && (
        <AnchoredPopover
          open={open}
          anchorRef={anchorRef}
          placement="bottom-start"
          minWidth={280}
          maxWidth={360}
          className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg"
        >
          <div className="border-b border-[rgb(var(--border))] px-3 py-2">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[rgb(var(--foreground-muted))]">
              <Store className="h-3 w-3" />
              Trocar loja
            </p>
          </div>
          <ul role="listbox" aria-label="Lojas disponíveis" className="max-h-72 overflow-y-auto p-1.5">
            {lojas.map((loja) => {
              const active = loja.tenantId === atual.tenantId
              return (
                <li key={loja.tenantId} role="option" aria-selected={active}>
                  <Link
                    href={`/portal/loja/${loja.tenantId}`}
                    onClick={() => setOpen(false)}
                    className={[
                      'flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors',
                      active
                        ? 'bg-[rgb(var(--color-primary)_/_0.12)]'
                        : 'hover:bg-[rgb(var(--background-subtle))]',
                    ].join(' ')}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[rgb(var(--background-subtle))]">
                      {loja.logoUrl ? (
                        <LogoImage
                          src={loja.logoUrl}
                          alt={loja.nome}
                          size={36}
                          className="h-9 w-9 object-cover"
                        />
                      ) : (
                        <ShoppingBag className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                        {loja.nome}
                      </p>
                      <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                        {loja.totalProdutos} produto{loja.totalProdutos !== 1 ? 's' : ''}
                        {' · '}
                        {loja.principal ? 'Principal' : labelTipoUnidade(loja.tipo)}
                      </p>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </AnchoredPopover>
      )}
    </div>
  )
}
