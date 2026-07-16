import { CheckCircle2, XCircle } from 'lucide-react'
import { validarCarteirinhaPorPayload } from '@/lib/carteirinha-qr'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Validar carteirinha' }

type Props = { searchParams: Promise<{ t?: string }> }

export default async function ValidarCarteirinhaPage({ searchParams }: Props) {
  const sp = await searchParams
  const payload = sp.t?.trim()

  if (!payload) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <XCircle className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />
        <h1 className="text-lg font-semibold">QR inválido</h1>
        <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
          Escaneie o QR Code da carteirinha ou use o link completo de validação.
        </p>
      </div>
    )
  }

  const result = await validarCarteirinhaPorPayload(payload)

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-12">
      <div
        className={[
          'rounded-2xl border p-6 text-center',
          result.ok
            ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40'
            : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
        ].join(' ')}
      >
        {result.ok ? (
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-600 dark:text-green-400" />
        ) : (
          <XCircle className="mx-auto mb-3 h-12 w-12 text-red-600 dark:text-red-400" />
        )}
        <h1 className="text-lg font-bold text-[rgb(var(--foreground))]">
          {result.ok ? 'Carteirinha válida' : 'Carteirinha inválida'}
        </h1>
        {!result.ok && result.motivo && (
          <p className="mt-2 text-sm font-medium text-red-800 dark:text-red-300">{result.motivo}</p>
        )}
      </div>

      {(result.nome || result.tenantNome) && (
        <dl className="mt-6 space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-sm">
          {result.tenantNome && (
            <div className="flex justify-between gap-4">
              <dt className="text-[rgb(var(--foreground-muted))]">Torcida</dt>
              <dd className="font-medium">{result.tenantNome}</dd>
            </div>
          )}
          {result.nome && (
            <div className="flex justify-between gap-4">
              <dt className="text-[rgb(var(--foreground-muted))]">Nome</dt>
              <dd className="font-medium">{result.nome}</dd>
            </div>
          )}
          {result.numeroSocio !== undefined && (
            <div className="flex justify-between gap-4">
              <dt className="text-[rgb(var(--foreground-muted))]">Nº sócio</dt>
              <dd className="font-mono">{String(result.numeroSocio).padStart(5, '0')}</dd>
            </div>
          )}
          {result.validade && (
            <div className="flex justify-between gap-4">
              <dt className="text-[rgb(var(--foreground-muted))]">Validade</dt>
              <dd>{new Date(result.validade).toLocaleDateString('pt-BR')}</dd>
            </div>
          )}
          {result.adimplente !== undefined && (
            <div className="flex justify-between gap-4">
              <dt className="text-[rgb(var(--foreground-muted))]">Adimplência</dt>
              <dd>{result.adimplente ? 'Regular' : 'Inadimplente'}</dd>
            </div>
          )}
        </dl>
      )}

      <p className="mt-6 text-center text-xs text-[rgb(var(--foreground-muted))]">
        Validação pública — não exibe dados sensíveis (CPF, endereço).
      </p>
    </div>
  )
}
