'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useNavbarBrandOverride } from '@/lib/navbar-brand-override'
import { COR_PRIMARIA_PLATAFORMA } from '@torcida/types'

const CANAL_DETALHE_RE = /^\/portal\/comunidade\/canais\/[^/]+$/

type AfiliacaoBrand = {
  nome: string
  apelido: string | null
  escudoUrl: string | null
}

/**
 * Enquanto o sócio está no escopo Nacional da Comunidade, troca nome/escudo
 * exibidos na navbar pelo clube (Timão, etc.) em vez da torcida organizada.
 * Canal em detalhe mantém o override próprio (`CanalNavbarOverride`).
 */
export function ComunidadeEscopoNavbarOverride({
  afiliacao,
  podeEscopoTorcida,
  corPrimaria,
}: {
  afiliacao: AfiliacaoBrand | null
  podeEscopoTorcida: boolean
  /** Cor do tenant sintético da Comunidade Nacional (paleta do clube). */
  corPrimaria: string | null
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setOverride } = useNavbarBrandOverride()

  const escopo = !podeEscopoTorcida
    ? 'nacional'
    : searchParams.get('escopo') === 'nacional'
      ? 'nacional'
      : 'torcida'

  const onCanalDetalhe = CANAL_DETALHE_RE.test(pathname)
  const modoNacional = escopo === 'nacional' && Boolean(afiliacao) && !onCanalDetalhe

  useEffect(() => {
    if (!modoNacional || !afiliacao) return

    setOverride({
      nome: afiliacao.apelido ?? afiliacao.nome,
      corPrimaria: corPrimaria ?? COR_PRIMARIA_PLATAFORMA,
      logoUrl: afiliacao.escudoUrl,
    })
    return () => setOverride(null)
  }, [
    modoNacional,
    afiliacao?.nome,
    afiliacao?.apelido,
    afiliacao?.escudoUrl,
    corPrimaria,
    setOverride,
    afiliacao,
  ])

  return null
}
