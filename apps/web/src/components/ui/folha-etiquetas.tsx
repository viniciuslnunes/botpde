'use client'

import { Printer } from 'lucide-react'
import { AppButton } from '@/components/ui/button'
import { QrCodeVisual } from '@/components/ui/qr-code'
import { useHidratado } from '@/lib/use-hidratado'

export type EtiquetaQr = {
  id: string
  titulo: string
  subtitulo?: string | null
  /**
   * Conteúdo do QR. Payload assinado vai como está; valor começando com `/` é
   * tratado como caminho e recebe a origem no cliente — o servidor não conhece
   * o host que o navegador está usando.
   */
  valor: string
}

/**
 * Folha de etiquetas QR para imprimir, recortar e colar.
 *
 * Serve dois usos que parecem diferentes e têm a mesma mecânica: etiqueta do
 * item do acervo (colada na bandeira, no instrumento) e placa da vitrine física
 * (ao lado do produto exposto na sede). Um QR por card na tela resolve o caso
 * unitário; **colar etiqueta em 200 bandeiras assim é inviável**, e foi por isso
 * que esta folha existe.
 *
 * A grade só materializa na impressão (`.app-folha-etiquetas` em `globals.css`),
 * com `break-inside: avoid` — etiqueta cortada ao meio na quebra de página não
 * escaneia.
 */
export function FolhaEtiquetas({
  etiquetas,
  rotuloBotao = 'Imprimir etiquetas',
  rodape,
}: {
  etiquetas: EtiquetaQr[]
  rotuloBotao?: string
  /** Linha fixa no pé de cada etiqueta (ex.: nome da torcida). */
  rodape?: string | null
}) {
  const hidratado = useHidratado()

  if (etiquetas.length === 0) return null

  return (
    <>
      <AppButton
        variant="secondary-soft"
        size="sm"
        icon={Printer}
        type="button"
        onClick={() => window.print()}
      >
        {rotuloBotao} ({etiquetas.length})
      </AppButton>

      <div className="app-folha-etiquetas">
        {hidratado &&
          etiquetas.map((e) => (
            <div key={e.id}>
              <QrCodeVisual
                value={e.valor.startsWith('/') ? `${window.location.origin}${e.valor}` : e.valor}
                size={120}
                label={`QR de ${e.titulo}`}
              />
              <p style={{ fontSize: '9pt', fontWeight: 700, margin: '0.3em 0 0' }}>{e.titulo}</p>
              {e.subtitulo && (
                <p style={{ fontSize: '7pt', margin: 0, color: '#444' }}>{e.subtitulo}</p>
              )}
              {rodape && <p style={{ fontSize: '6pt', margin: '0.2em 0 0', color: '#666' }}>{rodape}</p>}
            </div>
          ))}
      </div>
    </>
  )
}
