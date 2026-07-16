'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Shield } from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'

const SIZES = {
  sm: { box: 'h-11 w-11', px: 44, icon: 'h-4 w-4', text: 'text-sm' },
  md: { box: 'h-14 w-14', px: 56, icon: 'h-5 w-5', text: 'text-lg' },
} as const

export type EscudoClubeSize = keyof typeof SIZES

type Props = {
  nome: string
  apelido?: string | null
  escudoUrl?: string | null
  size?: EscudoClubeSize
  /** Classes extras no frame (ex.: ring para empilhar). */
  className?: string
}

/** Inicial exibida no placeholder — apelido curto ou nome sem sufixo "(UF)". */
export function inicialClubeEscudo(nome: string, apelido?: string | null): string {
  const base = (apelido?.trim() || nome.trim()).replace(/\s*\([^)]*\)\s*$/, '')
  return (base.charAt(0) || '?').toUpperCase()
}

/**
 * Escudo do clube/torcida no onboarding: frame fixo + object-contain (nunca corta o logo).
 * Placeholder neutro quando ausente ou com falha — nunca inventa escudo.
 */
export function EscudoClube({ nome, apelido, escudoUrl, size = 'md', className }: Props) {
  const [imagemFalhou, setImagemFalhou] = useState(false)
  const s = SIZES[size]
  const label = apelido || nome
  const mostrarImagem = Boolean(escudoUrl && !imagemFalhou)

  const frameClass = [
    'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl',
    'border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]',
    s.box,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  if (mostrarImagem && escudoUrl) {
    return (
      <div className={frameClass} aria-hidden={!label}>
        {canOptimizeImageUrl(escudoUrl) ? (
          <Image
            src={escudoUrl}
            alt={`Escudo ${label}`}
            width={s.px}
            height={s.px}
            className="h-full w-full object-contain p-1"
            onError={() => setImagemFalhou(true)}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={escudoUrl}
            alt={`Escudo ${label}`}
            width={s.px}
            height={s.px}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain p-1"
            onError={() => setImagemFalhou(true)}
          />
        )}
      </div>
    )
  }

  const inicial = inicialClubeEscudo(nome, apelido)
  return (
    <div className={`${frameClass} border-dashed`} aria-hidden="true">
      <Shield className={`absolute ${s.icon} text-[rgb(var(--foreground-muted)_/_0.35)]`} />
      <span className={`relative ${s.text} font-bold text-[rgb(var(--foreground-muted))]`}>
        {inicial}
      </span>
    </div>
  )
}
