'use client'

import { useActionState, useEffect, useRef } from 'react'
import { toast } from '@torcida/ui'
import {
  selecionarTorcidaAction,
  type SelecionarTorcidaState,
} from '@/app/admin/tenant-context-actions'
import { SearchableContextSwitcher } from '@/components/admin/searchable-context-switcher'
import {
  labelClubeComUf,
  labelTorcidaComClube,
  type TorcidaOpcao,
} from '@/lib/torcida-labels'

type TorcidaItem = TorcidaOpcao & { id: string; recentKey: string }

type Props = {
  torcidas: TorcidaOpcao[]
  torcidaAtualSlug: string | null
  destino?: 'admin' | 'portal' | 'super-admin'
  variant?: 'admin' | 'super-admin'
  /** Quando true, omite o subtítulo do clube (já há select de clube acima). */
  omitirSubtituloClube?: boolean
}

export function TenantSwitcher({
  torcidas,
  torcidaAtualSlug,
  destino = 'admin',
  variant = 'admin',
  omitirSubtituloClube = false,
}: Props) {
  const [state, action, pending] = useActionState<SelecionarTorcidaState, FormData>(
    selecionarTorcidaAction,
    {},
  )
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !pending && state.message) {
      toast.error(state.message)
    }
    wasPending.current = pending
  }, [pending, state.message])

  const items: TorcidaItem[] = torcidas.map((t) => ({
    ...t,
    id: t.slug,
    recentKey: t.slug,
  }))

  const isSuper = variant === 'super-admin'

  return (
    <SearchableContextSwitcher<TorcidaItem>
      label="Torcida ativa"
      placeholder="Buscar torcida, clube ou UF…"
      emptyMessage="Nenhuma torcida encontrada."
      items={items}
      valueId={torcidaAtualSlug}
      getLabel={(t) => (omitirSubtituloClube ? t.nome : labelTorcidaComClube(t))}
      getSubLabel={(t) => (omitirSubtituloClube ? null : (labelClubeComUf(t) ?? t.slug))}
      getSearchText={(t) =>
        [t.nome, t.clubeNome ?? '', t.clubeUf ?? '', t.slug].join(' ')
      }
      recentNamespace="torcida"
      variant={variant}
      pending={pending}
      formAction={action}
      valueFieldName="slug"
      hiddenFields={{ destino }}
      footer={
        isSuper ? (
          <p className="text-xs text-zinc-500">
            Ao trocar, você entra no admin da torcida escolhida (membros, aprovações,
            eventos…).
          </p>
        ) : null
      }
    />
  )
}
