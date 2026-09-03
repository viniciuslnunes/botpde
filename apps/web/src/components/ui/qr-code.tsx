'use client'

import { QRCodeSVG } from 'qrcode.react'

/**
 * QR do produto — desenhado no cliente, nunca por serviço externo.
 *
 * O payload de um QR nosso é um token HMAC (carteirinha, embarque de
 * caravana). Mandá-lo para uma API de imagem de terceiro entregaria a
 * credencial junto, que é por que o painel da carteirinha viveu tanto tempo
 * como um quadrado tracejado em vez de um código de verdade. `qrcode.react`
 * resolve isso desenhando SVG local, sem rede.
 *
 * **Fundo branco nos dois temas, de propósito.** A especificação do QR espera
 * módulos escuros sobre claro; invertê-lo no tema escuro deixa o código bonito
 * na tela e recusado por parte dos leitores — e o lugar onde isso quebraria é
 * a fila do embarque, no escuro, com o ônibus esperando.
 */
export function QrCodeVisual({
  value,
  size = 220,
  label,
  className,
}: {
  value: string
  size?: number
  label: string
  className?: string
}) {
  return (
    <div
      className={['inline-flex rounded-xl bg-white p-3 shadow-sm', className ?? ''].join(' ')}
      role="img"
      aria-label={label}
    >
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        marginSize={0}
        bgColor="#ffffff"
        fgColor="#000000"
      />
    </div>
  )
}
