'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { toast } from '@torcida/ui'
import { alternarMemoriaPresenca } from '../actions'
import { MemoriaFoto } from './memoria-foto'
import type { MemoriaPresenca } from '../_lib/carregar-memoria'

type Props = {
  presenca: MemoriaPresenca
}

export function MemoriaPresencaBloco({ presenca }: Props) {
  const [pending, start] = useTransition()
  const extra = presenca.total - presenca.pessoas.length

  function aparecer() {
    start(async () => {
      const res = await alternarMemoriaPresenca({ visivel: true })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Você passa a aparecer neste dia para quem também fez check-in.')
    })
  }

  if (
    presenca.pessoas.length === 0 &&
    !(presenca.viewerCheckIn && !presenca.viewerOptIn)
  ) {
    return null
  }

  return (
    <section className="space-y-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
        Quem estava
      </h3>
      {presenca.pessoas.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2">
          {presenca.pessoas.map((p) => (
            <li key={p.userId}>
              <Link
                href={`/portal/comunidade/perfil/${p.userId}`}
                className="flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 pl-1 pr-3"
              >
                <span className="relative flex h-8 w-8 overflow-hidden rounded-full bg-[rgb(var(--background-subtle))]">
                  {p.avatarUrl ? (
                    <MemoriaFoto src={p.avatarUrl} alt="" sizes="32px" className="object-cover" />
                  ) : null}
                </span>
                <span className="max-w-[8rem] truncate text-sm text-[rgb(var(--foreground))]">
                  {p.nome}
                </span>
              </Link>
            </li>
          ))}
          {extra > 0 && (
            <li className="text-xs text-[rgb(var(--foreground-muted))]">e mais {extra}</li>
          )}
        </ul>
      )}
      {presenca.viewerCheckIn && !presenca.viewerOptIn && (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Você estava.{' '}
          <button
            type="button"
            disabled={pending}
            onClick={aparecer}
            className="app-touch-line font-medium text-[rgb(var(--color-primary-fg))] disabled:opacity-60"
          >
            Aparecer neste dia?
          </button>{' '}
          <Link
            href={`/portal/comunidade/perfil/${presenca.viewerUserId}?aba=sobre`}
            className="app-touch-line text-[rgb(var(--foreground-muted))]"
          >
            Sobre
          </Link>
        </p>
      )}
    </section>
  )
}
