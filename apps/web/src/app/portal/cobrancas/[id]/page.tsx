import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getActiveTenant } from '@/lib/tenant'
import { carregarTenantCarteirinha } from '@/lib/associacao-escopo-server'
import {
  formatarMoedaBRL,
  formatDataCompetenciaInput,
  STATUS_COBRANCA_LABEL,
} from '@torcida/types'
import { PortalPixCobrancaClient } from '../portal-pix-cobranca-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cobrança' }

type Props = { params: Promise<{ id: string }> }

export default async function PortalCobrancaDetalhePage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const ativo = await getActiveTenant(session.user.id, session.user.email)
  if (!ativo) redirect('/portal/comunidade')
  const tenant = await carregarTenantCarteirinha(ativo, session.user.id)

  const { id } = await params

  type Row = {
    id: string
    descricao: string
    valor: { toNumber(): number }
    vencimento: Date
    status: string
    pagoEm: Date | null
    pixCopiaCola: string | null
    gatewayProvider: string | null
  }

  const cob: Row | null = await db.cobrancaAssociacao.findFirst({
    where: { id, tenantId: tenant.id, userId: session.user.id },
    select: {
      id: true,
      descricao: true,
      valor: true,
      vencimento: true,
      status: true,
      pagoEm: true,
      pixCopiaCola: true,
      gatewayProvider: true,
    },
  })

  if (!cob) notFound()

  const statusLabel =
    STATUS_COBRANCA_LABEL[cob.status as keyof typeof STATUS_COBRANCA_LABEL] ?? cob.status

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link
        href="/portal/cobrancas"
        className="text-sm text-[rgb(var(--foreground-muted))] hover:underline"
      >
        ← Minhas cobranças
      </Link>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h1 className="text-lg font-semibold text-[rgb(var(--foreground))]">{cob.descricao}</h1>
        <p className="mt-1 font-mono text-2xl font-bold text-[rgb(var(--foreground))]">
          {formatarMoedaBRL(cob.valor.toNumber())}
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[rgb(var(--foreground-muted))]">Vencimento</dt>
            <dd>{formatDataCompetenciaInput(cob.vencimento)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[rgb(var(--foreground-muted))]">Status</dt>
            <dd>{statusLabel}</dd>
          </div>
          {cob.pagoEm && (
            <div className="flex justify-between">
              <dt className="text-[rgb(var(--foreground-muted))]">Pago em</dt>
              <dd>{cob.pagoEm.toLocaleDateString('pt-BR')}</dd>
            </div>
          )}
        </dl>
        {cob.status === 'PAGA' && (
          <Link
            href={`/portal/cobrancas/${cob.id}/recibo`}
            className="mt-4 inline-block text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Ver recibo
          </Link>
        )}
      </div>

      <PortalPixCobrancaClient
        cobrancaId={cob.id}
        pixCopiaCola={cob.pixCopiaCola}
        provider={cob.gatewayProvider}
        status={cob.status}
      />
    </div>
  )
}
