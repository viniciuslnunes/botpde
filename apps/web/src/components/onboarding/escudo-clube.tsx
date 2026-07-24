'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Shield } from 'lucide-react'
import { detectarEscudoCircular } from '@/lib/escudo-forma'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'

const SIZES = {
  sm: { box: 'h-11 w-11', px: 44, icon: 'h-4 w-4', text: 'text-sm' },
  md: { box: 'h-14 w-14', px: 56, icon: 'h-5 w-5', text: 'text-lg' },
  lg: { box: 'h-16 w-16', px: 64, icon: 'h-6 w-6', text: 'text-xl' },
  xl: { box: 'h-20 w-20', px: 80, icon: 'h-7 w-7', text: 'text-2xl' },
  /** Preenche o pai (ex.: painel à direita do card de torcida). */
  fill: { box: 'h-full w-full', px: 128, icon: 'h-8 w-8', text: 'text-3xl' },
} as const

export type EscudoClubeSize = keyof typeof SIZES
export type EscudoClubeShape = 'rounded' | 'circle' | 'auto'

type Props = {
  nome: string
  apelido?: string | null
  escudoUrl?: string | null
  size?: EscudoClubeSize
  /**
   * Forma do frame.
   * - `auto` (default): só aplica máscara circular quando detecta logo redondo
   *   com cantos brancos opacos (fundo assado). PNG com alpha (ex.: Gaviões)
   *   permanece natural — o card já aparece pelo transparência.
   * - `circle` / `rounded`: força o placeholder; com imagem, `circle` mascara.
   */
  shape?: EscudoClubeShape
  /** Prioriza decode/fetch (primeiros cards acima da dobra). */
  priority?: boolean
  /** Classes extras no frame (ex.: ring para empilhar). */
  className?: string
}

/** Inicial exibida no placeholder — apelido curto ou nome sem sufixo "(UF)". */
export function inicialClubeEscudo(nome: string, apelido?: string | null): string {
  const base = (apelido?.trim() || nome.trim()).replace(/\s*\([^)]*\)\s*$/, '')
  return (base.charAt(0) || '?').toUpperCase()
}

/**
 * Escudo do clube/torcida no onboarding: frame fixo + object-contain.
 * Máscara circular só quando detecta badge redondo com cantos brancos
 * (Camisa 12 / Pavilhão Nove). PNG com alpha (Gaviões) fica natural.
 */
export function EscudoClube({
  nome,
  apelido,
  escudoUrl,
  size = 'md',
  shape = 'auto',
  priority = false,
  className,
}: Props) {
  const [imagemFalhou, setImagemFalhou] = useState(false)
  const [circularDetectado, setCircularDetectado] = useState(shape === 'circle')
  const [deteccaoPronta, setDeteccaoPronta] = useState(shape !== 'auto')
  const s = SIZES[size]
  const label = apelido || nome
  const mostrarImagem = Boolean(escudoUrl && !imagemFalhou)

  useEffect(() => {
    if (!escudoUrl || imagemFalhou) {
      setDeteccaoPronta(true)
      return
    }
    if (shape === 'circle') {
      setCircularDetectado(true)
      setDeteccaoPronta(true)
      return
    }
    if (shape === 'rounded') {
      setCircularDetectado(false)
      setDeteccaoPronta(true)
      return
    }
    let ativo = true
    setDeteccaoPronta(false)
    setCircularDetectado(false)
    void detectarEscudoCircular(escudoUrl).then((circular) => {
      if (!ativo) return
      setCircularDetectado(circular)
      setDeteccaoPronta(true)
    })
    return () => {
      ativo = false
    }
  }, [escudoUrl, imagemFalhou, shape])

  const aplicarMascara = circularDetectado && mostrarImagem && deteccaoPronta
  const boxClass = [
    'relative flex shrink-0 items-center justify-center',
    s.box,
    aplicarMascara ? 'overflow-hidden rounded-full' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  if (mostrarImagem && escudoUrl) {
    const imgClass = 'h-full w-full object-contain'
    return (
      <div className={boxClass}>
        {canOptimizeImageUrl(escudoUrl) ? (
          <Image
            src={escudoUrl}
            alt={`Escudo ${label}`}
            width={s.px}
            height={s.px}
            className={imgClass}
            priority={priority}
            onError={() => setImagemFalhou(true)}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={escudoUrl}
            alt={`Escudo ${label}`}
            width={s.px}
            height={s.px}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className={imgClass}
            onError={() => setImagemFalhou(true)}
          />
        )}
      </div>
    )
  }

  const radius =
    shape === 'circle' || (shape === 'auto' && circularDetectado) ? 'rounded-full' : 'rounded-xl'
  const placeholderClass = [
    boxClass,
    'overflow-hidden border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]',
    radius,
  ].join(' ')

  const inicial = inicialClubeEscudo(nome, apelido)
  return (
    <div className={placeholderClass} aria-hidden="true">
      <Shield className={`absolute ${s.icon} text-[rgb(var(--foreground-muted)_/_0.35)]`} />
      <span className={`relative ${s.text} font-bold text-[rgb(var(--foreground-muted))]`}>
        {inicial}
      </span>
    </div>
  )
}
