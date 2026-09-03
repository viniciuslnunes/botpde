'use client'

import { useCallback, useState, useTransition } from 'react'
import { Bus, DoorClosed, DoorOpen, QrCode, Users } from 'lucide-react'
import type { TrechoEmbarque } from '@torcida/db'
import { TRECHOS, TRECHOS_EMBARQUE } from '@torcida/types'
import {
  abrirEmbarque,
  encerrarEmbarque,
  obterEstadoPainelEmbarque,
  type EstadoPainelEmbarque,
} from '@/app/admin/eventos/actions'
import { AppButton } from '@/components/ui/button'
import { QrCodeVisual } from '@/components/ui/qr-code'
import { useHidratado } from '@/lib/use-hidratado'
import { useVisibleInterval } from '@/lib/use-visible-interval'

/**
 * Painel de embarque do gestor — abre a porta, mostra o QR e conta quem entrou.
 *
 * A tela existe para responder **uma** pergunta operacional: "posso fechar a
 * porta?". Por isso o contador e o botão de encerrar têm mais peso visual que
 * o QR: o QR é o meio, o número é a decisão.
 *
 * O polling só roda com um trecho aberto, e só com a aba visível
 * (`useVisibleInterval`). Fechado o embarque, a tela para de falar com o
 * servidor — não é um painel que fica girando a viagem inteira.
 */
/**
 * `caravana` tem duas pernas (ida e volta); `presenca` tem uma só — ensaio da
 * bateria e evento na sede não têm volta, e mostrar um seletor de trecho ali
 * seria pedir uma decisão que não existe. Por baixo é o mesmo ledger: o modo
 * de presença sempre abre `IDA`, que é o trecho que materializa `checkedInAt`.
 */
export type ModoPainelEmbarque = 'caravana' | 'presenca'

export function PainelEmbarque({
  eventoId,
  estadoInicial,
  modo = 'caravana',
}: {
  eventoId: string
  estadoInicial: EstadoPainelEmbarque
  modo?: ModoPainelEmbarque
}) {
  const [estado, setEstado] = useState(estadoInicial)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [trechoEscolhido, setTrechoEscolhido] = useState<TrechoEmbarque>(
    estadoInicial.trechoAtivo ?? 'IDA',
  )
  const hidratado = useHidratado()

  const aberto = estado.trechoAtivo != null
  const ehCaravana = modo === 'caravana'
  const substantivo = ehCaravana ? 'embarque' : 'presença'

  // Renova o QR antes de a janela virar e traz o contador junto — uma
  // chamada só, porque as duas informações mudam no mesmo ritmo.
  const sincronizar = useCallback(() => {
    void obterEstadoPainelEmbarque(eventoId).then(setEstado).catch(() => {})
  }, [eventoId])

  useVisibleInterval(sincronizar, 10_000, aberto)

  function abrir() {
    setErro(null)
    iniciar(async () => {
      // Fora da caravana só existe uma perna, e ela é a que materializa
      // `checkedInAt` — nunca deixar a escolha escapar para VOLTA.
      const r = await abrirEmbarque(eventoId, ehCaravana ? trechoEscolhido : 'IDA')
      if (r.ok) setEstado(r.estado)
      else setErro(r.error)
    })
  }

  function encerrar() {
    setErro(null)
    iniciar(async () => {
      const r = await encerrarEmbarque(eventoId)
      if (r.ok) setEstado(r.estado)
      else setErro(r.error)
    })
  }

  const embarcados = estado.trechoAtivo ? estado.contagem[estado.trechoAtivo] : 0
  const faltando = Math.max(estado.confirmados - embarcados, 0)

  const urlQr =
    hidratado && estado.qr ? `${window.location.origin}/embarque?t=${estado.qr.payload}` : null

  return (
    <section className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold capitalize text-[rgb(var(--foreground))]">
          {ehCaravana ? (
            <Bus className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          ) : (
            <Users className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          )}
          {substantivo}
        </h3>
        {aberto && estado.trechoAtivo && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
            <DoorOpen className="h-3.5 w-3.5" />
            {ehCaravana ? `${TRECHOS_EMBARQUE[estado.trechoAtivo].curto} aberta` : 'Aberta'}
          </span>
        )}
      </header>

      {!aberto ? (
        <div className="space-y-3">
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            {ehCaravana
              ? 'Abra o trecho para exibir o QR. Enquanto estiver fechado, ninguém consegue registrar embarque pelo celular.'
              : 'Abra a presença para exibir o QR. Enquanto estiver fechada, ninguém consegue registrar presença pelo celular.'}
          </p>
          <div className={ehCaravana ? 'flex flex-wrap gap-2' : 'hidden'}>
            {TRECHOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrechoEscolhido(t)}
                aria-pressed={trechoEscolhido === t}
                className={[
                  'app-touch-target rounded-lg border px-3 py-2 text-xs font-medium transition',
                  trechoEscolhido === t
                    ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary-fg))]'
                    : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {TRECHOS_EMBARQUE[t].label}
              </button>
            ))}
          </div>
          <AppButton
            variant="primary"
            icon={DoorOpen}
            type="button"
            onClick={abrir}
            disabled={pendente}
            loading={pendente}
          >
            {ehCaravana ? 'Abrir embarque' : 'Abrir presença'}
          </AppButton>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="shrink-0">
              {urlQr ? (
                <QrCodeVisual value={urlQr} size={200} label="QR para o sócio registrar embarque" />
              ) : (
                <div
                  className="h-[224px] w-[224px] animate-pulse rounded-xl bg-[rgb(var(--background-subtle))]"
                  aria-hidden
                />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
              <div>
                <p className="text-3xl font-bold tabular-nums text-[rgb(var(--foreground))]">
                  {embarcados}
                  <span className="text-lg font-medium text-[rgb(var(--foreground-muted))]">
                    {' / '}
                    {estado.confirmados}
                  </span>
                </p>
                <p className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                  <Users className="h-3.5 w-3.5" />
                  {ehCaravana ? 'embarcaram' : 'presentes'} ·{' '}
                  <strong className="font-semibold">{faltando}</strong> faltando
                </p>
              </div>

              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Peça para apontarem a câmera. O código muda a cada{' '}
                {estado.qr?.janelaSegundos ?? 30}s — print compartilhado não vale.
              </p>

              <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                Sem rede no celular do sócio? Use o check-in pela carteirinha abaixo.
              </p>
              {!ehCaravana && (
                <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                  Só quem confirmou presença consegue registrar sozinho — os demais entram pelo
                  check-in manual.
                </p>
              )}

              <AppButton
                variant="danger"
                icon={DoorClosed}
                type="button"
                onClick={encerrar}
                disabled={pendente}
                loading={pendente}
              >
                {ehCaravana ? 'Encerrar embarque' : 'Encerrar presença'}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}

      {ehCaravana && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-[rgb(var(--foreground-muted))]">
          <QrCode className="h-3 w-3" />
          Ida e volta contam separado — abra a volta na saída do estádio.
        </p>
      )}
    </section>
  )
}
