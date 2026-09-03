'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, CheckCircle2, PackageCheck, QrCode, StopCircle } from 'lucide-react'
import { AppButton } from '@/components/ui/button'
import { useQrScanner } from '@/lib/use-qr-scanner'
import {
  confirmarRetiradaPorQr,
  type ResultadoRetirada,
} from '@/app/admin/loja/retirada-actions'

/**
 * Balcão: bipa o QR que o comprador mostra e entrega o pedido.
 *
 * O nome de quem comprou e os itens voltam na resposta **de propósito** — o
 * conferente precisa dizer "Maria, 2 camisas?" antes de soltar a sacola. Um
 * "ok" verde sozinho entregaria pedido trocado sem ninguém perceber.
 */
export function RetiradaPorQr() {
  const [codigo, setCodigo] = useState('')
  const [resultado, setResultado] = useState<ResultadoRetirada | null>(null)
  const [pendente, iniciar] = useTransition()
  const ultimoRef = useRef('')

  // `confirmar` é declaração de função (içada); o hook guarda a versão mais
  // recente por dentro, então não é preciso ref no corpo do render.
  const {
    videoRef,
    iniciar: abrirCamera,
    parar: fecharCamera,
    ativo,
    erro: erroCamera,
  } = useQrScanner(confirmar)

  function confirmar(bruto: string) {
    const limpo = bruto.trim()
    if (!limpo || limpo === ultimoRef.current || pendente) return
    ultimoRef.current = limpo

    iniciar(async () => {
      const r = await confirmarRetiradaPorQr(limpo)
      setResultado(r)
      if (r.ok) {
        setCodigo('')
        // Libera a mesma leitura só depois de dar certo, para o próximo da fila
        // poder ser bipado sem recarregar a tela.
        ultimoRef.current = ''
      }
    })
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <PackageCheck className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          Retirada no balcão
        </h2>
        {ativo ? (
          <AppButton
            variant="secondary-soft"
            size="sm"
            icon={StopCircle}
            type="button"
            onClick={fecharCamera}
          >
            Parar câmera
          </AppButton>
        ) : (
          <AppButton
            variant="secondary-soft"
            size="sm"
            icon={Camera}
            type="button"
            onClick={() => void abrirCamera()}
          >
            Abrir câmera
          </AppButton>
        )}
      </div>

      <video
        ref={videoRef}
        muted
        playsInline
        className={
          ativo
            ? 'aspect-video w-full max-w-md rounded-xl bg-black object-cover'
            : 'pointer-events-none absolute h-0 w-0 opacity-0'
        }
      />

      {erroCamera && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{erroCamera}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          confirmar(codigo)
        }}
        className="flex gap-2"
      >
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Ou cole o código do pedido"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 font-mono text-xs"
        />
        <AppButton
          variant="primary"
          icon={QrCode}
          type="submit"
          disabled={pendente || !codigo.trim()}
          loading={pendente}
        >
          Entregar
        </AppButton>
      </form>

      {resultado?.ok && (
        <div className="alert-success rounded-xl border p-3">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[rgb(var(--foreground))]">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Pedido {resultado.idCurto} entregue
          </p>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            {resultado.comprador} · {resultado.itens}
          </p>
        </div>
      )}

      {resultado && !resultado.ok && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {resultado.error}
        </p>
      )}
    </section>
  )
}
