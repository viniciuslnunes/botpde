'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLatestRef } from '@/lib/use-latest-ref'

/**
 * Leitura de QR pela câmera, com dois motores.
 *
 * O `BarcodeDetector` é nativo, rápido e não custa bundle — mas **não existe no
 * Safari/iOS**. Como o produto vira app de telefone e metade da diretoria opera
 * de iPhone, o gestor ficava só com o campo de colar o código na porta do
 * ônibus. O fallback é o `jsQR`, carregado por `import()` **dinâmico**: quem
 * tem motor nativo nunca baixa esses bytes.
 *
 * O fallback roda em canvas reduzido (`LARGURA_ANALISE`) e a cada 2 frames —
 * decodificar 1080p a 60fps esquenta o telefone e não lê melhor.
 */

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike
  }
}

export type MotorQr = 'nativo' | 'fallback'

const LARGURA_ANALISE = 480

function temDetectorNativo(): boolean {
  return typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function'
}

/**
 * @param onLeitura Chamada a cada código lido. Devolver `true` **encerra a
 *   câmera** — quem só precisa de uma leitura (escolher uma comanda) não
 *   precisa fechar o ciclo chamando `parar()` de dentro do próprio callback,
 *   o que exigiria usar a função antes de ela existir.
 */
export function useQrScanner(onLeitura: (bruto: string) => void | boolean) {
  const [ativo, setAtivo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [motor, setMotor] = useState<MotorQr | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef(0)

  // A callback muda a cada render do consumidor; a ref evita reiniciar a
  // câmera por isso. `useLatestRef` escreve em `useInsertionEffect` — escrever
  // no corpo do render quebra com render concorrente (ver o hook).
  const onLeituraRef = useLatestRef(onLeitura)

  const parar = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setAtivo(false)
  }, [])

  useEffect(() => () => parar(), [parar])

  const iniciar = useCallback(async () => {
    setErro(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
    } catch {
      setErro('Não foi possível abrir a câmera. Verifique a permissão do navegador.')
      return
    }

    streamRef.current = stream
    const video = videoRef.current
    if (!video) {
      stream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      return
    }

    video.srcObject = stream
    try {
      await video.play()
    } catch {
      setErro('A câmera abriu mas não iniciou. Toque na tela e tente de novo.')
      parar()
      return
    }

    const nativo = temDetectorNativo()
    setMotor(nativo ? 'nativo' : 'fallback')
    setAtivo(true)

    const detector = nativo ? new window.BarcodeDetector!({ formats: ['qr_code'] }) : null
    const jsQR = nativo ? null : (await import('jsqr')).default

    const tick = async () => {
      const v = videoRef.current
      if (!v || v.readyState < 2) {
        rafRef.current = requestAnimationFrame(() => void tick())
        return
      }

      try {
        if (detector) {
          const codigos = await detector.detect(v)
          const bruto = codigos[0]?.rawValue
          if (bruto && onLeituraRef.current(bruto) === true) {
            parar()
            return
          }
        } else if (jsQR) {
          frameRef.current += 1
          if (frameRef.current % 2 === 0) {
            const canvas = (canvasRef.current ??= document.createElement('canvas'))
            const escala = Math.min(1, LARGURA_ANALISE / (v.videoWidth || LARGURA_ANALISE))
            canvas.width = Math.max(1, Math.round(v.videoWidth * escala))
            canvas.height = Math.max(1, Math.round(v.videoHeight * escala))
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (ctx) {
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
              const achado = jsQR(img.data, img.width, img.height, {
                inversionAttempts: 'dontInvert',
              })
              if (achado?.data && onLeituraRef.current(achado.data) === true) {
                parar()
                return
              }
            }
          }
        }
      } catch {
        /* frame ruim: segue para o próximo */
      }

      rafRef.current = requestAnimationFrame(() => void tick())
    }

    rafRef.current = requestAnimationFrame(() => void tick())
  }, [parar, onLeituraRef])

  return { videoRef, iniciar, parar, ativo, erro, motor }
}
