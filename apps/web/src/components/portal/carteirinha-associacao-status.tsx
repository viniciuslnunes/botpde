import Link from 'next/link'
import {
  formatarMoedaBRL,
  formatDataCompetenciaInput,
} from '@torcida/types'
import {
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Wallet,
} from 'lucide-react'
import { CarteirinhaReveal } from '@/components/portal/carteirinha-motion'
import type { HomeAssociadoSnapshot } from '@/lib/associacao-home'

type Props = {
  home: HomeAssociadoSnapshot
  /** Índice inicial dos reveals (após blocos da carteirinha). */
  revealFrom?: number
}

/** Status financeiro / vínculo migrado do antigo Início do portal. */
export function CarteirinhaAssociacaoStatus({ home, revealFrom = 0 }: Props) {
  let i = revealFrom

  return (
    <>
      {home.membro?.desligadoEm && (
        <CarteirinhaReveal index={i++}>
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Você está registrado como desligado(a) desta torcida.</p>
          </div>
        </CarteirinhaReveal>
      )}

      {home.membro && home.membro.status === 'APROVADO' && !home.membro.desligadoEm && (
        <CarteirinhaReveal index={i++}>
          <div
            className={[
              'flex items-center gap-3 rounded-xl border px-4 py-3',
              home.membro.adimplente
                ? 'alert-success'
                : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
            ].join(' ')}
          >
            {home.membro.adimplente ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-700 dark:text-red-400" />
            )}
            <div className="min-w-0">
              <p
                className={[
                  'text-sm font-semibold',
                  home.membro.adimplente
                    ? 'text-success'
                    : 'text-red-900 dark:text-red-100',
                ].join(' ')}
              >
                {home.membro.adimplente ? 'Situação regular' : 'Inadimplente'}
              </p>
              {home.membro.planoNome && (
                <p
                  className={[
                    'text-xs',
                    home.membro.adimplente
                      ? 'text-success'
                      : 'text-red-800/80 dark:text-red-200/80',
                  ].join(' ')}
                >
                  Plano: {home.membro.planoNome}
                </p>
              )}
            </div>
          </div>
        </CarteirinhaReveal>
      )}

      {home.cobrancaAberta && (
        <CarteirinhaReveal index={i++}>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <div className="flex items-start gap-3">
              <Wallet className="mt-0.5 h-5 w-5 text-[rgb(var(--color-primary-fg))]" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                  Cobrança em aberto
                </p>
                <p className="text-sm text-[rgb(var(--foreground-muted))]">
                  {home.cobrancaAberta.descricao}
                </p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {formatarMoedaBRL(home.cobrancaAberta.valor)}
                </p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  Venc. {formatDataCompetenciaInput(home.cobrancaAberta.vencimento)}
                  {home.cobrancaAberta.status === 'VENCIDA' ? ' · Vencida' : ''}
                </p>
                <Link
                  href={`/portal/cobrancas/${home.cobrancaAberta.id}`}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-primary-on"
                >
                  Pagar agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </CarteirinhaReveal>
      )}

      {home.membro && home.membro.status === 'APROVADO' && !home.membro.desligadoEm && (
        <CarteirinhaReveal index={i++}>
          <Link
            href="/portal/cobrancas"
            className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <Wallet className="h-5 w-5 text-[rgb(var(--color-primary-fg))]" />
            <div>
              <p className="text-sm font-semibold">Mensalidades</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">Histórico de cobranças</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          </Link>
        </CarteirinhaReveal>
      )}
    </>
  )
}
