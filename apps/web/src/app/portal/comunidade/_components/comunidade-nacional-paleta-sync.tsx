'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { applyTenantDesign, type TenantDesign } from '@torcida/ui'
import { designFromPrimary, isCorPadraoPlataforma } from '@torcida/types'
import { extrairPaletaDeImagem } from '@/lib/extrair-paleta'
import { sincronizarPaletaComunidadeNacional } from '../actions'

/**
 * Fallback para clubes fora do catálogo curado (`CLUBE_PALETAS`): extrai a
 * paleta do escudo no client (canvas, precisa DOM) e persiste no tenant
 * sintético da Comunidade Nacional, aplicando a cor na sessão atual sem
 * esperar reload. Não faz nada se a cor já foi customizada (curada ou por
 * outro torcedor).
 */
export function ComunidadeNacionalPaletaSync({
  afiliacaoId,
  escudoUrl,
  corPrimariaAtual,
}: {
  afiliacaoId: string
  escudoUrl: string | null
  corPrimariaAtual: string
}) {
  const { resolvedTheme } = useTheme()
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    if (!escudoUrl || !isCorPadraoPlataforma(corPrimariaAtual)) return
    ranRef.current = true

    let cancelled = false
    async function run() {
      const hexes = await extrairPaletaDeImagem(escudoUrl as string, 5)
      if (cancelled || hexes.length === 0) return

      const [primary, secondary] = hexes
      await sincronizarPaletaComunidadeNacional(afiliacaoId, hexes)

      const design = designFromPrimary(primary, secondary ?? null) as TenantDesign
      const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      applyTenantDesign(design, mode)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [afiliacaoId, escudoUrl, corPrimariaAtual, resolvedTheme])

  return null
}
