'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useNavbarBrandOverride, type NavbarBrand } from '@/lib/navbar-brand-override'
import {
  resolverBrandPorEscopo,
  resolverEscopoComunidadePorModo,
  type EscopoComunidade,
  type EscoposDisponiveis,
} from '@/lib/comunidade-escopo'
import { registrarEscopoComunidadeAction } from '@/app/portal/comunidade/escopo-actions'

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
  unidade = null,
  escopos,
  modoContexto = 'torcida',
  corPrimariaNacional,
  tenantAtivoEhUnidade = false,
  escopoPersistido = null,
  marcaCanalFoco = null,
}: {
  afiliacao: AfiliacaoBrand | null
  torcidaReal: TorcidaBrand | null
  /** Marca da aba unidade (subsede/PDE) — senão o header volta ao clube. */
  unidade?: { nome: string; logoUrl: string | null } | null
  escopos: EscoposDisponiveis
  /** TORCEDOR = nacional (default CN); sócio = torcida. */
  modoContexto?: 'nacional' | 'torcida'
  /** Cor do tenant sintético da Comunidade Nacional (paleta do clube). */
  corPrimariaNacional: string | null
  /** Unidade Caso B ativa: o default do escopo é ela, não a Sede raiz. */
  tenantAtivoEhUnidade?: boolean
  /** Cookie `comunidade_escopo` já no servidor — evita regravar o mesmo valor. */
  escopoPersistido?: EscopoComunidade | null
  /**
   * Canal oficial Caso A selecionado (sem portal próprio). Tem prioridade
   * sobre a marca do escopo/tenant — senão a listagem Canais caía na Sede.
   */
  marcaCanalFoco?: NavbarBrand | null
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setOverride, setEscopoAtivo } = useNavbarBrandOverride()

  const escopo = resolverEscopoComunidadePorModo(
    modoContexto,
    escopos,
    searchParams.get('escopo'),
    { tenantAtivoEhUnidade },
  )

  const onCanalDetalhe = CANAL_DETALHE_RE.test(pathname)

  // Agenda/Sedes/Loja não têm `?escopo=` — sem persistir, a topbar voltava ao
  // clube no primeiro clique. Detalhe de canal temático não escreve: ele não
  // é uma aba-escudo, e sobrescrever perderia o canal que a pessoa escolheu.
  // Só grava quando o valor muda: senão seria um POST por navegação no feed.
  const escopoGravado = useRef<string | null>(escopoPersistido)
  useEffect(() => {
    if (onCanalDetalhe) return
    if (escopoGravado.current === escopo) return
    escopoGravado.current = escopo
    void registrarEscopoComunidadeAction(escopo)
  }, [onCanalDetalhe, escopo])

  useEffect(() => {
    // Detalhe de canal tem override próprio — não forçar CN na topbar.
    if (onCanalDetalhe) {
      setEscopoAtivo(null)
      return () => setEscopoAtivo(null)
    }

    setEscopoAtivo(escopo)

    // Caso A (canal oficial sem portal): marca do canal selecionado vence o
    // escopo/tenant — senão /canais caía em "Gaviões" ao sair de Taubaté.
    // CN continua com a marca do clube.
    const brand: NavbarBrand | null =
      marcaCanalFoco && escopo !== 'nacional'
        ? marcaCanalFoco
        : resolverBrandPorEscopo(escopo, {
            afiliacao,
            torcidaReal,
            unidade,
            corPrimariaNacional,
          })

    if (!brand) {
      setOverride(null)
      return () => {
        setOverride(null)
        setEscopoAtivo(null)
      }
    }

    setOverride(brand)
    return () => {
      setOverride(null)
      setEscopoAtivo(null)
    }
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
    unidade,
    unidade?.nome,
    unidade?.logoUrl,
    corPrimariaNacional,
    marcaCanalFoco,
    marcaCanalFoco?.nome,
    marcaCanalFoco?.corPrimaria,
    marcaCanalFoco?.logoUrl,
    setOverride,
    setEscopoAtivo,
  ])

  return null
}
