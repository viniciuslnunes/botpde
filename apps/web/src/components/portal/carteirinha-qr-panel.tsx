'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { QrCodeVisual } from '@/components/ui/qr-code'
import { useHidratado } from '@/lib/use-hidratado'

/**
 * QR sem terceiros: o código é desenhado localmente (`QrCodeVisual`), então o
 * token HMAC nunca sai para uma API de imagem externa — que era o motivo de
 * este painel ter vivido como um quadrado tracejado. O link de validação e a
 * cópia do payload continuam como saída para quem não consegue escanear.
 */
export function CarteirinhaQrPanel({
  validarUrl,
  qrPayload,
}: {
  validarUrl: string
  qrPayload: string
}) {
  const [copied, setCopied] = useState(false)
  const hidratado = useHidratado()
  const absolute = hidratado
    ? new URL(validarUrl, window.location.origin).toString()
    : validarUrl

  async function copy() {
    try {
      await navigator.clipboard.writeText(absolute)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <p className="text-center text-sm font-semibold text-[rgb(var(--foreground))]">
        Validação da carteirinha
      </p>
      <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
        Mostre este link na entrada ou peça para escanear o código do celular (câmera abre a
        validação pública). O segredo não é enviado a serviços externos.
      </p>
      <div className="flex justify-center">
        {hidratado ? (
          <QrCodeVisual value={absolute} size={168} label="QR de validação da carteirinha" />
        ) : (
          <div
            className="h-[192px] w-[192px] animate-pulse rounded-xl bg-[rgb(var(--background-subtle))]"
            aria-hidden
          />
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={validarUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-xs font-medium text-primary-on"
        >
          Abrir validação
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado' : 'Copiar link'}
        </button>
      </div>
      <p className="break-all text-center font-mono text-[9px] text-[rgb(var(--foreground-muted))]">
        {qrPayload}
      </p>
    </div>
  )
}
