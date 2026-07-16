'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink } from 'lucide-react'

/**
 * QR sem terceiros: evita enviar o token HMAC a APIs externas (LGPD).
 * Mostra link de validação + cópia do payload; leitores de câmera abrem o link.
 */
export function CarteirinhaQrPanel({
  validarUrl,
  qrPayload,
}: {
  validarUrl: string
  qrPayload: string
}) {
  const [copied, setCopied] = useState(false)
  const absolute =
    typeof window !== 'undefined'
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
      <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-xl border-2 border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3 text-center">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
          Abra o link de validação
        </span>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={validarUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-xs font-medium text-white"
        >
          Abrir validação
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado' : 'Copiar link'}
        </button>
      </div>
      <p className="break-all text-center font-mono text-[9px] text-[rgb(var(--foreground-muted))]">
        {qrPayload}
      </p>
    </div>
  )
}
