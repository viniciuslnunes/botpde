'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useNavbarBrandOverride, type NavbarBrand } from '@/lib/navbar-brand-override'
import { resolverEscopoComunidadePorModo } from '@/lib/comunidade-escopo'
import { COR_PRIMARIA_PLATAFORMA } from '@torcida/types'

const CANAL_DETALHE_RE = /^\/portal\/comunidade\/canais\/[^/]+$/

type AfiliacaoBrand = {
  nome: string
  apelido: string | null
  escudoUrl: string | null
}

type TorcidaBrand = {
  nome: string
  corPrimaria: string
  logoUrl: string | null
}

/**
 * Navbar reativa ao escopo Nacional × Minha torcida.
 *
 * - Sócio: layout base = torcida; Nacional sobrescreve com o clube.
 * - TORCEDOR: layout base = clube (CN); Minha torcida sobrescreve com a
 *   unidade/torcida do vínculo — senão o header fica no VERDÃO/FOGÃO.
 * Canal em detalhe mantém o override próprio (`CanalNavbarOverride`).
 */
export function ComunidadeEscopoNavbarOverride({
  afiliacao,
  torcidaReal,
  podeEscopoTorcida,
  modoContexto = 'torcida',
  corPrimariaNacional,
}: {
  afiliacao: AfiliacaoBrand | null
  torcidaReal: TorcidaBrand | null
  podeEscopoTorcida: boolean
  /** TORCEDOR = nacional (default CN); sócio = torcida. */
  modoContexto?: 'nacional' | 'torcida'
  /** Cor do tenant sintético da Comunidade Nacional (paleta do clube). */
  corPrimariaNacional: string | null
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setOverride } = useNavbarBrandOverride()

  const escopo = resolverEscopoComunidadePorModo(
    modoContexto,
    podeEscopoTorcida,
    searchParams.get('escopo'),
  )

  const onCanalDetalhe = CANAL_DETALHE_RE.test(pathname)

  useEffect(() => {
    if (onCanalDetalhe) return

    let brand: NavbarBrand | null = null
    if (escopo === 'nacional' && afiliacao) {
      brand = {
        nome: afiliacao.apelido ?? afiliacao.nome,
        corPrimaria: corPrimariaNacional ?? COR_PRIMARIA_PLATAFORMA,
        logoUrl: afiliacao.escudoUrl,
      }
    } else if (escopo === 'torcida' && torcidaReal) {
      // TORCEDOR: layout do portal já é o clube — precisa override explícito.
      // Sócio: reforça a marca da torcida (idempotente com o tenant do layout).
      brand = {
        nome: torcidaReal.nome,
        corPrimaria: torcidaReal.corPrimaria,
        logoUrl: torcidaReal.logoUrl,
      }
    }

    if (!brand) {
      setOverride(null)
      return
    }

    setOverride(brand)
    return () => setOverride(null)
  }, [
    onCanalDetalhe,
    escopo,
    afiliacao,
    afiliacao?.nome,
    afiliacao?.apelido,
    afiliacao?.escudoUrl,
    torcidaReal,
    torcidaReal?.nome,
    torcidaReal?.corPrimaria,
    torcidaReal?.logoUrl,
    corPrimariaNacional,
    setOverride,
  ])

  return null
}
