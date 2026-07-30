'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { m } from 'motion/react'
import { Radio, Users } from 'lucide-react'
import { toast } from '@torcida/ui'
import { formatNomeTorcida } from '@torcida/types'
import { entrarCanal, pedirEntradaCanal } from '@/app/portal/comunidade/actions'
import { Avatar } from '@/components/portal/avatar'
import { springSnappy } from '@/lib/motion-presets'
import {
  linkCanalComunidade,
  type SugestaoCanalAside,
} from '@/lib/canais-shared'

type CanalEstado = SugestaoCanalAside & {
  /** Após pedir entrada com sucesso — some o botão de ação. */
  pedidoEnviado?: boolean
}

export function CanaisSugeridosAside({
  canais: initial,
  tenantAtualId,
}: {
  canais: SugestaoCanalAside[]
  tenantAtualId: string
}) {
  const [canais, setCanais] = useState<CanalEstado[]>(initial)
  const [pending, startTransition] = useTransition()

  if (canais.length === 0) return null

  function entrar(id: string) {
    startTransition(async () => {
      try {
        await entrarCanal(id)
        toast.success('Inscrito no canal!')
        setCanais((prev) => prev.filter((c) => c.id !== id))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível entrar.')
      }
    })
  }

  function pedir(id: string) {
    startTransition(async () => {
      try {
        await pedirEntradaCanal(id)
        toast.success('Pedido enviado — aguarde a aprovação.')
        setCanais((prev) =>
          prev.map((c) => (c.id === id ? { ...c, pedidoEnviado: true } : c)),
        )
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
        <Radio className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
        Canais sugeridos
      </h2>
      <div className="mt-3 space-y-3">
        {canais.map((canal) => {
          // Sempre pelo id: oficiais Caso A (SUBSEDE/PDE) compartilham tenantId.
          const href = linkCanalComunidade(canal.id)
          const tenantNome = formatNomeTorcida(canal.tenantNome)
          const canalNome = canal.canalOficial
            ? formatNomeTorcida(canal.nome ?? tenantNome)
            : (canal.nome ?? 'Canal')
          return (
            <div key={canal.id} className="flex items-center gap-2">
              <Link href={href} className="shrink-0">
                <Avatar
                  nome={canalNome}
                  avatarUrl={canal.avatarUrl}
                  size="sm"
                  fit="contain"
                />
              </Link>
              <Link href={href} className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[rgb(var(--foreground))] hover:underline">
                  {canalNome}
                </p>
                <p className="truncate text-[10px] text-[rgb(var(--foreground-muted))]">
                  <span className="inline-flex items-center gap-0.5">
                    <Users className="h-2.5 w-2.5" />
                    {canal.membros}
                  </span>
                  {' · '}
                  {canal.canalOficial ? 'Oficial' : 'Temático'}
                  {canal.tenantId !== tenantAtualId ? ` · ${tenantNome}` : null}
                </p>
              </Link>
              {canal.pedidoEnviado ? (
                <span className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                  Pedido enviado
                </span>
              ) : canal.publica ? (
                <m.button
                  type="button"
                  disabled={pending}
                  onClick={() => entrar(canal.id)}
                  whileTap={{ scale: 0.94 }}
                  transition={springSnappy}
                  className="shrink-0 rounded-lg bg-[rgb(var(--color-primary))] px-2.5 py-1 text-[10px] font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
                >
                  Entrar
                </m.button>
              ) : (
                <m.button
                  type="button"
                  disabled={pending}
                  onClick={() => pedir(canal.id)}
                  whileTap={{ scale: 0.94 }}
                  transition={springSnappy}
                  className="shrink-0 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-[10px] font-medium transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                >
                  Solicitar
                </m.button>
              )}
            </div>
          )
        })}
      </div>
      <Link
        href="/portal/comunidade/canais"
        className="mt-3 flex w-full items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
      >
        Ver canais
      </Link>
    </div>
  )
}
