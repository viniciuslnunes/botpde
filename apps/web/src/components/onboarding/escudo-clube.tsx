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
}

/** Inicial exibida no placeholder — apelido curto ou nome sem sufixo "(UF)". */
export function inicialClubeEscudo(nome: string, apelido?: string | null): string {
  const base = (apelido?.trim() || nome.trim()).replace(/\s*\([^)]*\)\s*$/, '')
  return (base.charAt(0) || '?').toUpperCase()
}

/**
 * Escudo do clube no onboarding: imagem hospedada quando existe; placeholder neutro
 * (inicial + ícone) quando ausente ou com falha de carregamento — nunca inventa escudo.
 */
export function EscudoClube({ nome, apelido, escudoUrl, size = 'md' }: Props) {
  const [imagemFalhou, setImagemFalhou] = useState(false)
  const s = SIZES[size]
  const label = apelido || nome
  const mostrarImagem = Boolean(escudoUrl && !imagemFalhou)

  if (mostrarImagem && escudoUrl) {
    if (canOptimizeImageUrl(escudoUrl)) {
      return (
        <Image
          src={escudoUrl}
          alt={`Escudo ${label}`}
          width={s.px}
          height={s.px}
          className={`${s.box} object-contain`}
          onError={() => setImagemFalhou(true)}
        />
      )
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={escudoUrl}
        alt={`Escudo ${label}`}
        width={s.px}
        height={s.px}
        loading="lazy"
        decoding="async"
        className={`${s.box} object-contain`}
        onError={() => setImagemFalhou(true)}
      />
    )
  }

  const inicial = inicialClubeEscudo(nome, apelido)
  return (
    <div
      className={`relative flex ${s.box} shrink-0 items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]`}
      aria-hidden="true"
    >
      <Shield className={`absolute ${s.icon} text-[rgb(var(--foreground-muted)_/_0.35)]`} />
      <span className={`relative ${s.text} font-bold text-[rgb(var(--foreground-muted))]`}>
        {inicial}
      </span>
    </div>
  )
}
