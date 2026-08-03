'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { registrarCheckInPorQr } from '@/app/admin/eventos/actions'
import { Camera, CloudOff, QrCode, StopCircle, Wifi } from 'lucide-react'
import {
  enqueueCheckinOffline,
  listCheckinOffline,
  removeCheckinOffline,
  type CheckinOfflineItem,
} from '@/lib/checkin-offline'

type State = { ok?: boolean; error?: string; nome?: string; aviso?: string }

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike
  }
}

function supportsBarcodeDetector() {
  return typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function'
}

export function CheckInPorQr({ eventoId }: { eventoId: string }) {
  const [payload, setPayload] = useState('')
  const [pending, start] = useTransition()
  const [state, setState] = useState<State>({})
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [fila, setFila] = useState<CheckinOfflineItem[]>([])
  const [online, setOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const lastScanRef = useRef('')

  const refreshFila = useCallback(() => {
    setFila(listCheckinOffline(eventoId))
  }, [eventoId])

  const syncFila = useCallback(async () => {
    const items = listCheckinOffline(eventoId)
    if (items.length === 0 || !navigator.onLine) {
      refreshFila()
      return
    }
    setSyncing(true)
    for (const item of items) {
      const result = await registrarCheckInPorQr(eventoId, item.token)
      if (result.ok) {
        removeCheckinOffline(eventoId, item.id)
      } else if (
        result.error.toLowerCase().includes('já') ||
        result.error.toLowerCase().includes('ja ')
      ) {
        removeCheckinOffline(eventoId, item.id)
      }
    }
    refreshFila()
    setSyncing(false)
  }, [eventoId, refreshFila])

  useEffect(() => {
    refreshFila()
    setOnline(navigator.onLine)
    const onOnline = () => {
      setOnline(true)
      void syncFila()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    void syncFila()
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refreshFila, syncFila])

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  function registrar(token: string) {
    const trimmed = token.trim()
    if (!trimmed || trimmed === lastScanRef.current) return
    lastScanRef.current = trimmed
    setPayload(trimmed)
    setState({})

    if (!navigator.onLine) {
      enqueueCheckinOffline(eventoId, trimmed)
      refreshFila()
      setState({ ok: true, nome: 'Na fila (offline)' })
      setPayload('')
      lastScanRef.current = ''
      return
    }

    start(async () => {
      try {
        const result = await registrarCheckInPorQr(eventoId, trimmed)
        setState(result)
        if (result.ok) {
          setPayload('')
          lastScanRef.current = ''
        }
      } catch {
        enqueueCheckinOffline(eventoId, trimmed)
        refreshFila()
        setState({ ok: true, nome: 'Na fila (rede falhou)' })
        setPayload('')
        lastScanRef.current = ''
      }
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    registrar(payload)
  }

  async function startCamera() {
    setCameraError(null)
    if (!supportsBarcodeDetector()) {
      setCameraError('Este navegador não lê QR pela câmera. Cole o código abaixo.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      await video.play()
      setScanning(true)

      const detector = new window.BarcodeDetector!({ formats: ['qr_code'] })
      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(() => void tick())
          return
        }
        try {
          const codes = await detector.detect(videoRef.current)
          const raw = codes[0]?.rawValue
          if (raw) registrar(raw)
        } catch {
          /* frame skip */
        }
        rafRef.current = requestAnimationFrame(() => void tick())
      }
      rafRef.current = requestAnimationFrame(() => void tick())
    } catch {
      setCameraError('Não foi possível abrir a câmera. Verifique a permissão.')
      stopCamera()
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--foreground))]">
          <QrCode className="h-3.5 w-3.5 text-[rgb(var(--color-primary-fg))]" />
          Check-in pela carteirinha (QR)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {!online && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              <CloudOff className="h-3 w-3" />
              Offline
            </span>
          )}
          {fila.length > 0 && (
            <button
              type="button"
              onClick={() => void syncFila()}
              disabled={syncing || !online}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-[10px] font-medium text-[rgb(var(--foreground-muted))] disabled:opacity-50"
            >
              <Wifi className="h-3 w-3" />
              {syncing ? 'Sincronizando…' : `Fila ${fila.length}`}
            </button>
          )}
          {scanning ? (
            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))]"
            >
              <StopCircle className="h-3.5 w-3.5" />
              Parar câmera
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]"
            >
              <Camera className="h-3.5 w-3.5" />
              Abrir câmera
            </button>
          )}
        </div>
      </div>

      <video
        ref={videoRef}
        muted
        playsInline
        className={
          scanning
            ? 'aspect-video w-full rounded-lg bg-black object-cover'
            : 'pointer-events-none absolute h-0 w-0 opacity-0'
        }
      />

      {cameraError && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{cameraError}</p>
      )}

      <form onSubmit={submit}>
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Aponte a câmera ou cole o código / parâmetro <code className="font-mono">t</code>.
          Sem rede, o check-in fica na fila local até sincronizar.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder="token.assinatura"
            className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs font-mono"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={pending || !payload.trim()}
            className="rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-medium text-[rgb(var(--color-primary-on))] disabled:opacity-50"
          >
            {pending ? '…' : 'Registrar'}
          </button>
        </div>
      </form>

      {state.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.ok && state.nome && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          Check-in ok: {state.nome}
          {state.aviso ? (
            <span className="mt-0.5 block font-normal text-amber-700 dark:text-amber-400">
              {state.aviso}
            </span>
          ) : null}
        </p>
      )}
    </div>
  )
}
