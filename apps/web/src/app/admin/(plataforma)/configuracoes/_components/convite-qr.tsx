'use client'

import { Printer, QrCode } from 'lucide-react'
import { AppButton } from '@/components/ui/button'
import { QrCodeVisual } from '@/components/ui/qr-code'
import { useHidratado } from '@/lib/use-hidratado'

/**
 * QR do link de convite — e o cartaz para imprimir e colar na sede.
 *
 * **Não usa a primitiva `qr-token.ts` de propósito.** O link `/convite/<slug>`
 * já *é* a credencial: tem slug rotacionável, liga/desliga e revogação
 * próprios (`lib/convite.ts`). Assinar de novo por cima só criaria um segundo
 * segredo para manter em sincronia com o primeiro — e um jeito a mais de o
 * cartaz impresso parar de funcionar.
 *
 * É por isso que este é o caso de melhor retorno do estudo de expansão
 * (`docs/data/plano-qr-multi-modulo.md` §4.2): zero schema, zero action, zero
 * regra nova. É `QrCodeVisual` sobre uma URL que já existe — e ataca o jeito
 * como torcida organizada de fato cresce, que é no presencial.
 */
export function ConviteQr({
  link,
  torcidaNome,
  ativo,
}: {
  link: string | null
  torcidaNome: string
  ativo: boolean
}) {
  const hidratado = useHidratado()

  if (!link) return null

  return (
    <details className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-primary-fg))]">
        <QrCode className="h-3.5 w-3.5" aria-hidden />
        QR do convite
      </summary>

      <div className="mt-3 space-y-3">
        {!ativo && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            O convite está pausado — quem escanear não consegue entrar. Ative antes de imprimir.
          </p>
        )}

        <div className="flex flex-col items-center gap-2">
          {hidratado ? (
            <QrCodeVisual value={link} size={180} label="QR do convite da torcida" />
          ) : (
            <div
              className="h-[204px] w-[204px] animate-pulse rounded-xl bg-[rgb(var(--background-subtle))]"
              aria-hidden
            />
          )}
          <p className="text-center text-[11px] text-[rgb(var(--foreground-muted))]">
            Aponte a câmera para entrar na torcida
          </p>
        </div>

        <AppButton
          variant="secondary-soft"
          size="sm"
          icon={Printer}
          type="button"
          onClick={() => window.print()}
          block
        >
          Imprimir cartaz
        </AppButton>
      </div>

      {/* Só existe no papel — ver `.app-cartaz` em globals.css. */}
      <div className="app-cartaz">
        <div style={{ textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <p style={{ fontSize: '14pt', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Faça parte da
          </p>
          <h1 style={{ fontSize: '34pt', fontWeight: 800, margin: '0.2em 0 0.6em' }}>
            {torcidaNome}
          </h1>
          {hidratado && <QrCodeVisual value={link} size={320} label="QR do convite" />}
          <p style={{ fontSize: '18pt', fontWeight: 600, marginTop: '0.8em' }}>
            Aponte a câmera do celular
          </p>
          <p style={{ fontSize: '11pt', marginTop: '0.4em', wordBreak: 'break-all' }}>{link}</p>
        </div>
      </div>
    </details>
  )
}
