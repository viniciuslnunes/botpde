'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import { toast } from '@torcida/ui/services/toast'
import { isRedirectError } from '@/lib/toast-action'
import {
  adiarFluxoDepartamento,
  ativarFluxoDepartamento,
} from '@/app/portal/departamentos/fluxos-actions'
import { AppButton } from '@/components/ui/button'

const ADIAR_DIAS = 7

export type FluxoCtaItem = {
  id: string
  href: string
  cta: string
  ativavel: boolean
}

export function DepartamentoFluxoCta({
  fluxo,
  departamentoId,
  slug,
  isGestor,
  destaque,
}: {
  fluxo: FluxoCtaItem
  departamentoId: string
  slug: string
  isGestor: boolean
  destaque: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (!isGestor) {
    return (
      <Link
        href={fluxo.href}
        className={
          destaque
            ? 'app-action btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium'
            : 'app-touch-target inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline'
        }
      >
        {fluxo.cta}
        <ArrowRight className={destaque ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden />
      </Link>
    )
  }

  function onAtivar() {
    start(async () => {
      try {
        const res = await ativarFluxoDepartamento(departamentoId, slug, fluxo.id)
        if (res.error) {
          toast.error(res.error)
          return
        }
        toast.success('Fluxo ativado')
        if (res.href) router.push(res.href)
        else router.refresh()
      } catch (e) {
        if (isRedirectError(e)) throw e
        toast.error(e instanceof Error ? e.message : 'Não foi possível ativar')
      }
    })
  }

  function onAdiar() {
    start(async () => {
      try {
        const res = await adiarFluxoDepartamento(departamentoId, slug, fluxo.id)
        if (res.error) {
          toast.error(res.error)
          return
        }
        toast.success(`Sugestão adiada por ${ADIAR_DIAS} dias`)
        router.refresh()
      } catch (e) {
        if (isRedirectError(e)) throw e
        toast.error(e instanceof Error ? e.message : 'Não foi possível adiar')
      }
    })
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {fluxo.ativavel ? (
        <button
          type="button"
          disabled={pending}
          onClick={onAtivar}
          className="app-action btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? 'Ativando…' : fluxo.cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <Link
          href={fluxo.href}
          className={
            destaque
              ? 'app-action btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium'
              : 'app-touch-target inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline'
          }
        >
          {fluxo.cta}
          <ArrowRight className={destaque ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden />
        </Link>
      )}
      <AppButton
        variant="none"
        icon={Clock}
        type="button"
        disabled={pending}
        onClick={onAdiar}
        className="app-touch-target inline-flex items-center text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:opacity-60"
      >
        Agora não
      </AppButton>
    </div>
  )
}
