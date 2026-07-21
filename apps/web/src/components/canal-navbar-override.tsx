'use client'

import { useEffect } from 'react'
import { useNavbarBrandOverride, type NavbarBrand } from '@/lib/navbar-brand-override'

/**
 * Montado dentro da visão de canal: enquanto a rota está ativa, troca
 * nome/escudo/cor exibidos no slot esquerdo da `PortalNavbar` pelos dados do
 * canal/unidade em visualização. Reverte ao desmontar (saiu da rota). Só
 * cosmético — não altera sessão, tenant ativo real nem permissões.
 */
export function CanalNavbarOverride({ brand }: { brand: NavbarBrand }) {
  const { setOverride } = useNavbarBrandOverride()

  useEffect(() => {
    setOverride(brand)
    return () => setOverride(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.nome, brand.corPrimaria, brand.logoUrl, setOverride])

  return null
}
