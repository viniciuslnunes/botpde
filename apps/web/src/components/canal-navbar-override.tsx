'use client'

import { useEffect } from 'react'
import { useNavbarBrandOverride, type NavbarBrand } from '@/lib/navbar-brand-override'

/**
 * Montado dentro da visão de canal: enquanto a rota está ativa, troca
 * nome/escudo/cor exibidos no slot esquerdo da `PortalNavbar` pelos dados do
 * canal/unidade em visualização. Reverte ao desmontar (saiu da rota). Só
 * cosmético — não altera sessão, tenant ativo real nem permissões.
 * `canalOficial` controla se os módulos reativos do canal ficam na topbar
 * (oficial e depto/área da unidade; temático esconde).
 */
export function CanalNavbarOverride({
  brand,
  canalOficial,
}: {
  brand: NavbarBrand
  canalOficial: boolean
}) {
  const { setOverride, setOcultarModulosReativos } = useNavbarBrandOverride()

  useEffect(() => {
    setOverride(brand)
    return () => setOverride(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.nome, brand.corPrimaria, brand.logoUrl, setOverride])

  useEffect(() => {
    setOcultarModulosReativos(!canalOficial)
    return () => setOcultarModulosReativos(false)
  }, [canalOficial, setOcultarModulosReativos])

  return null
}
