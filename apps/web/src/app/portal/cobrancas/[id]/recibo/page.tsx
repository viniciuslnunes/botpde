import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getActiveTenant } from '@/lib/tenant'
import { carregarTenantCarteirinha } from '@/lib/associacao-escopo-server'
import { formatarMoedaBRL, formatDataCompetenciaInput } from '@torcida/types'
import { ReciboPrintButton } from './recibo-print-button'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Recibo' }

type Props = { params: Promise<{ id: string }> }

export default async function ReciboCobrancaPage({ params }: Props) {
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
    pagoEm: Date | null
    metodoPagamento: string | null
    user: { nome: string | null; email: string | null }
  }

  const cob: Row | null = await db.cobrancaAssociacao.findFirst({
    where: { id, tenantId: tenant.id, userId: session.user.id, status: 'PAGA' },
    select: {
      id: true,
      descricao: true,
      valor: true,
      vencimento: true,
      pagoEm: true,
      metodoPagamento: true,
      user: { select: { nome: true, email: true } },
    },
  })

  if (!cob || !cob.pagoEm) notFound()

  return (
    <div className="mx-auto max-w-md print:max-w-none">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .recibo-print, .recibo-print * { visibility: visible; }
          .recibo-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="recibo-print rounded-2xl border border-[rgb(var(--border))] bg-white p-8 text-black shadow-sm dark:bg-white dark:text-black">
        <header className="border-b border-gray-200 pb-4 text-center">
          <h1 className="text-lg font-bold">{tenant.nome}</h1>
          <p className="text-sm text-gray-600">Recibo de pagamento</p>
        </header>

        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-600">Associado</dt>
            <dd className="text-right font-medium">{cob.user.nome ?? cob.user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-600">Descrição</dt>
            <dd className="text-right">{cob.descricao}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-600">Vencimento</dt>
            <dd>{formatDataCompetenciaInput(cob.vencimento)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-600">Pago em</dt>
            <dd>{cob.pagoEm.toLocaleDateString('pt-BR')}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-600">Forma</dt>
            <dd>{cob.metodoPagamento ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-gray-200 pt-3 text-base font-bold">
            <dt>Valor pago</dt>
            <dd>{formatarMoedaBRL(cob.valor.toNumber())}</dd>
          </div>
        </dl>

        <p className="mt-8 text-center text-xs text-gray-500">
          Comprovante gerado em {new Date().toLocaleString('pt-BR')} · ID {cob.id.slice(0, 8)}
        </p>
      </div>

      <ReciboPrintButton />
    </div>
  )
}
