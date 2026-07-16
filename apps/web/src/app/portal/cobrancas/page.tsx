import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getActiveTenant } from '@/lib/tenant'
import {
  formatarMoedaBRL,
  formatDataCompetenciaInput,
  STATUS_COBRANCA_LABEL,
} from '@torcida/types'
import { listarCobrancasTenant } from '@/lib/cobrancas'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minhas cobranças' }

export default async function PortalCobrancasPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant) redirect('/portal/comunidade')

  const cobrancas = await listarCobrancasTenant(tenant.id, {
    userId: session.user.id,
    limite: 50,
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <MotionReveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Mensalidades</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Cobranças da sua associação em {tenant.nome}
            </p>
          </div>
          <Link href="/portal" className="text-sm font-medium text-[rgb(var(--primary))] hover:underline">
            Início
          </Link>
        </div>
      </MotionReveal>

      {cobrancas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhuma cobrança registrada.
        </p>
      ) : (
        <div className="divide-y divide-[rgb(var(--border))] overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
          {cobrancas.map((c) => {
            const statusLabel =
              STATUS_COBRANCA_LABEL[c.status as keyof typeof STATUS_COBRANCA_LABEL] ?? c.status
            return (
              <Link
                key={c.id}
                href={`/portal/cobrancas/${c.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <div>
                  <p className="font-medium text-[rgb(var(--foreground))]">{c.descricao}</p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    Venc. {formatDataCompetenciaInput(c.vencimento)} · {statusLabel}
                  </p>
                </div>
                <span className="font-mono text-sm font-semibold">
                  {formatarMoedaBRL(Number(c.valor))}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
