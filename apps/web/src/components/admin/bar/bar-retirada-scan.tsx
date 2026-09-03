'use client'

import { useState, useTransition } from 'react'
import { Camera, CheckCircle2, Minus, Plus, StopCircle, Ticket, X } from 'lucide-react'
import { AppButton } from '@/components/ui/button'
import { useQrScanner } from '@/lib/use-qr-scanner'
import {
  confirmarRetiradaVendaBar,
  lerValeVendaBar,
  type ItemValeBar,
  type ResultadoValeBar,
} from '@/app/admin/bar/retirada-actions'

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

type ValeAberto = Extract<ResultadoValeBar, { ok: true }>

/**
 * Balcão: bipa o vale da compra antecipada e entrega.
 *
 * São **dois passos de propósito** — ler e depois confirmar. Entregar direto na
 * leitura seria mais rápido e erraria mais: o operador precisa ver o nome e os
 * itens antes de soltar a sacola, e a mercadoria sai da mão para nunca mais
 * voltar. É a mesma razão de a confirmação de embarque ser um toque, não o
 * carregamento da página.
 *
 * A quantidade vem preenchida com **o que falta** e pode ser reduzida: quem
 * compra quatro cervejas leva duas agora e volta no intervalo.
 */
export function BarRetiradaScan() {
  const [codigo, setCodigo] = useState('')
  const [vale, setVale] = useState<ValeAberto | null>(null)
  const [erroVale, setErroVale] = useState<string | null>(null)
  const [levar, setLevar] = useState<Record<string, number>>({})
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const {
    videoRef,
    iniciar: abrirCamera,
    parar: fecharCamera,
    ativo,
    erro: erroCamera,
  } = useQrScanner(lerVale)

  function lerVale(bruto: string): boolean {
    const limpo = bruto.trim()
    if (!limpo || pendente) return false

    iniciar(async () => {
      setFeito(null)
      const r = await lerValeVendaBar(limpo)
      if (r.ok) {
        setVale(r)
        setErroVale(null)
        setCodigo(limpo)
        setLevar(Object.fromEntries(r.itens.map((i) => [i.id, i.restante])))
      } else {
        setVale(null)
        setErroVale(r.error)
      }
    })
    return true // achou um código: encerra a câmera enquanto processa
  }

  function ajustar(item: ItemValeBar, delta: number) {
    setLevar((atual) => ({
      ...atual,
      [item.id]: Math.min(Math.max((atual[item.id] ?? 0) + delta, 0), item.restante),
    }))
  }

  function entregar() {
    if (!vale) return
    iniciar(async () => {
      const r = await confirmarRetiradaVendaBar({ payload: codigo, quantidades: levar })
      if (r.ok) {
        setVale(null)
        setLevar({})
        setCodigo('')
        setFeito(
          r.completo
            ? `${r.comprador} — entregue: ${r.entregue}`
            : `${r.comprador} — entregue: ${r.entregue}. Falta: ${r.restante
                .map((i) => `${i.produtoNome} ×${i.restante}`)
                .join(', ')}`,
        )
      } else {
        setErroVale(r.error)
      }
    })
  }

  const totalLevar = Object.values(levar).reduce((a, b) => a + b, 0)

  return (
    <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <Ticket className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          Retirada de compra antecipada
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
            Escanear vale
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

      {erroCamera && <p className="text-xs text-amber-700 dark:text-amber-400">{erroCamera}</p>}

      {!vale && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            lerVale(codigo)
          }}
          className="flex gap-2"
        >
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ou cole o código do vale"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 font-mono text-xs"
          />
          <AppButton
            variant="secondary"
            icon={Ticket}
            type="submit"
            disabled={pendente || !codigo.trim()}
            loading={pendente}
          >
            Abrir vale
          </AppButton>
        </form>
      )}

      {vale && (
        <div className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                {vale.comprador}
              </p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                {formatarPreco(vale.total)}
              </p>
            </div>
            <AppButton
              variant="none"
              iconOnly
              icon={X}
              aria-label="Fechar vale"
              type="button"
              onClick={() => {
                setVale(null)
                setCodigo('')
              }}
              className="app-touch-target rounded-lg border border-[rgb(var(--border))]"
            />
          </div>

          <ul className="divide-y divide-[rgb(var(--border))]">
            {vale.itens.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[rgb(var(--foreground))]">
                    {i.produtoNome}
                  </span>
                  <span className="text-[11px] text-[rgb(var(--foreground-muted))]">
                    {i.retiradoQtd > 0
                      ? `já levou ${i.retiradoQtd} de ${i.quantidade}`
                      : `${i.quantidade} comprado${i.quantidade > 1 ? 's' : ''}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <AppButton
                    variant="none"
                    iconOnly
                    icon={Minus}
                    aria-label={`Entregar menos ${i.produtoNome}`}
                    type="button"
                    disabled={pendente || (levar[i.id] ?? 0) === 0}
                    onClick={() => ajustar(i, -1)}
                    className="app-touch-target rounded-lg border border-[rgb(var(--border))] disabled:opacity-40"
                  />
                  <span className="w-5 text-center text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
                    {levar[i.id] ?? 0}
                  </span>
                  <AppButton
                    variant="none"
                    iconOnly
                    icon={Plus}
                    aria-label={`Entregar mais ${i.produtoNome}`}
                    type="button"
                    disabled={pendente || (levar[i.id] ?? 0) >= i.restante}
                    onClick={() => ajustar(i, 1)}
                    className="app-touch-target rounded-lg border border-[rgb(var(--border))] disabled:opacity-40"
                  />
                </span>
              </li>
            ))}
          </ul>

          <AppButton
            variant="primary"
            icon={Ticket}
            type="button"
            disabled={pendente || totalLevar === 0}
            loading={pendente}
            onClick={entregar}
            block
          >
            {totalLevar === 0 ? 'Escolha o que entregar' : `Entregar ${totalLevar} item(ns)`}
          </AppButton>
        </div>
      )}

      {feito && (
        <div className="alert-success rounded-xl border p-3">
          <p className="inline-flex items-start gap-1.5 text-xs text-[rgb(var(--foreground))]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {feito}
          </p>
        </div>
      )}

      {erroVale && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {erroVale}
        </p>
      )}
    </section>
  )
}
