'use client'

import { useState } from 'react'
import { Camera, ScanLine, StopCircle } from 'lucide-react'
import { AppButton } from '@/components/ui/button'
import { useQrScanner } from '@/lib/use-qr-scanner'
import { dadosDoQrOuUrl } from '@/lib/qr-payload'

/**
 * Escanear o QR que o sócio mostra para escolher a comanda no PDV.
 *
 * **Não faz round-trip nem verifica assinatura, e isso é correto aqui.** As
 * comandas abertas da unidade já estão carregadas nesta tela — escanear apenas
 * escolhe uma delas. Um QR forjado, no máximo, seleciona algo que o operador
 * podia selecionar no `<select>` ao lado; nada é autorizado, então nada precisa
 * ser verificado. Em troca, a leitura é instantânea e funciona com a rede do
 * bar caindo, que é o normal no subsolo da sede.
 *
 * Um id que não está na lista é recusado com mensagem própria: quase sempre é
 * comanda de outra unidade, ou já fechada.
 */
export function BarComandaScan({
  idsAbertos,
  onSelecionar,
}: {
  idsAbertos: string[]
  onSelecionar: (comandaId: string) => void
}) {
  const [aviso, setAviso] = useState<string | null>(null)

  const { videoRef, iniciar, parar, ativo, erro } = useQrScanner((bruto) => {
    const id = dadosDoQrOuUrl(bruto)
    if (!id) return false
    if (!idsAbertos.includes(id)) {
      setAviso('Comanda não está aberta nesta unidade.')
      return false
    }
    setAviso(null)
    onSelecionar(id)
    return true // achou: o hook encerra a câmera
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {ativo ? (
          <AppButton
            variant="none"
            icon={StopCircle}
            type="button"
            onClick={parar}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-[rgb(var(--border))] px-2.5 text-xs font-bold text-[rgb(var(--foreground))]"
          >
            Parar
          </AppButton>
        ) : (
          <AppButton
            variant="none"
            icon={Camera}
            type="button"
            onClick={() => {
              setAviso(null)
              void iniciar()
            }}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-[rgb(var(--border))] px-2.5 text-xs font-bold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Escanear
          </AppButton>
        )}
        {!ativo && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[rgb(var(--foreground-muted))]">
            <ScanLine className="h-3 w-3" aria-hidden />
            QR do sócio
          </span>
        )}
      </div>

      <video
        ref={videoRef}
        muted
        playsInline
        className={
          ativo
            ? 'aspect-video w-full rounded-xl bg-black object-cover'
            : 'pointer-events-none absolute h-0 w-0 opacity-0'
        }
      />

      {(erro ?? aviso) && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{erro ?? aviso}</p>
      )}
    </div>
  )
}
