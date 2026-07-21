'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  trocarTorcidaAction,
  type TrocarTorcidaState,
} from '@/app/portal/tenant-context-actions'
import { labelTorcidaComClube, type TorcidaOpcao } from '@/lib/torcida-labels'
import { useReportNavPending } from '@/components/portal/nav-pending-context'

type Props = {
  torcidas: TorcidaOpcao[]
  atualSlug: string | null
  destino?: 'admin' | 'portal'
}

/**
 * Dropdown leve para trocar entre torcidas onde o usuário tem vínculo de
 * sócio APROVADO (2-4 opções tipicamente) — diferente do `TenantSwitcher`
 * de super-admin (combobox de busca sobre todas as torcidas do SaaS).
 */
export function TorcidaContextSwitcher({ torcidas, atualSlug, destino = 'portal' }: Props) {
  const [state, action, pending] = useActionState<TrocarTorcidaState, FormData>(
    trocarTorcidaAction,
    {},
  )
  const wasPending = useRef(false)
  const [slugPendente, setSlugPendente] = useState<string | null>(null)

  // A troca envolve round-trip + redirect — sem isso, o dropdown fecharia
  // no clique e o usuário ficaria sem nenhum sinal de progresso até a nova
  // torcida carregar. Reaproveita a mesma barra de progresso da navegação.
  useReportNavPending(pending)

  useEffect(() => {
    if (wasPending.current && !pending && state.message) {
      toast.error(state.message)
      setSlugPendente(null)
    }
    wasPending.current = pending
  }, [pending, state.message])

  if (torcidas.length < 2) return null

  return (
    <ul className="space-y-0.5" aria-label="Torcidas disponíveis">
      {torcidas.map((t) => {
        const ativa = t.slug === atualSlug
        const carregandoEsta = pending && slugPendente === t.slug
        return (
          <li key={t.id}>
            <form action={action} onSubmit={() => setSlugPendente(t.slug)}>
              <input type="hidden" name="slug" value={t.slug} />
              <input type="hidden" name="destino" value={destino} />
              <button
                type="submit"
                disabled={ativa || pending}
                className={[
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-default',
                  ativa
                    ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))]'
                    : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                <span className="min-w-0 flex-1 truncate">{labelTorcidaComClube(t)}</span>
                {ativa ? (
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : carregandoEsta ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                ) : null}
              </button>
            </form>
          </li>
        )
      })}
    </ul>
  )
}
