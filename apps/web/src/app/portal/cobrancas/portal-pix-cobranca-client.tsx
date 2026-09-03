'use client'

import { useTransition } from 'react'
import { Check, Copy, CheckCircle2 } from 'lucide-react'
import { confirmarPixMock } from './actions'
import { runPersistAction } from '@/lib/toast-action'
import { useState } from 'react'
import { AppButton } from '@/components/ui/button'

export function PortalPixCobrancaClient({
  cobrancaId,
  pixCopiaCola,
  provider,
  status,
}: {
  cobrancaId: string
  pixCopiaCola: string | null
  provider: string | null
  status: string
}) {
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const aberta = status === 'PENDENTE' || status === 'VENCIDA'
  const mock = provider === 'mock' || provider === null

  async function copiar() {
    if (!pixCopiaCola) return
    await navigator.clipboard.writeText(pixCopiaCola)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!aberta) {
    if (status === 'PAGA') {
      return (
        <div className="flex items-center gap-2 rounded-xl border alert-success px-4 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4" /> Pagamento confirmado
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Pagamento via Pix</h2>

      {pixCopiaCola ? (
        <>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(pixCopiaCola)}`}
              alt="QR Code Pix"
              width={160}
              height={160}
              className="rounded-lg border border-[rgb(var(--border))]"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-[rgb(var(--foreground-muted))]">Pix copia e cola</p>
            <p className="break-all rounded-lg bg-[rgb(var(--background-subtle))] p-3 font-mono text-xs">
              {pixCopiaCola}
            </p>
          </div>
          <button
            type="button"
            onClick={copiar}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copiado!' : 'Copiar código'}
          </button>
        </>
      ) : (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          O Pix ainda não foi gerado. Aguarde a administração ou entre em contato com o financeiro.
        </p>
      )}

      {mock && (
        <AppButton
          variant="primary"
          icon={Check}
          loading={pending}
          type="button"
          block
          onClick={() =>
            startTransition(async () => {
              await runPersistAction(() => confirmarPixMock(cobrancaId), {
                success: 'Pagamento confirmado (mock).',
              })
            })
          }
        >
          Já paguei (mock)
        </AppButton>
      )}
    </div>
  )
}
