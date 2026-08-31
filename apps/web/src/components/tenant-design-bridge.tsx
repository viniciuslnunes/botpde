'use client'

import { useEffect, useMemo } from 'react'
import { applyTenantDesign, tenantDesignCriticalCss, type TenantDesign } from '@torcida/ui'
import { useTheme } from '@torcida/ui/services/theme'
import { resolveTenantDesign } from '@torcida/types'

export type TenantDesignBridgeProps = {
  corPrimaria: string
  /** JSON bruto do banco ou já normalizado. */
  design?: unknown
}

/**
 * Aplica o tema visual do tenant sobre o ThemeProvider raiz.
 * CSS crítico no SSR + sync client com claro/escuro.
 */
export function TenantDesignBridge({ corPrimaria, design: designRaw }: TenantDesignBridgeProps) {
  const design = useMemo(
    () => resolveTenantDesign(designRaw ?? null, corPrimaria) as TenantDesign,
    [designRaw, corPrimaria],
  )

  const { resolvedTheme } = useTheme()
  const criticalCss = useMemo(() => tenantDesignCriticalCss(design), [design])

  useEffect(() => {
    const mode = resolvedTheme === 'light' ? 'light' : 'dark'
    applyTenantDesign(design, mode)
  }, [design, resolvedTheme])

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      const mode = root.classList.contains('dark') ? 'dark' : 'light'
      applyTenantDesign(design, mode)
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    applyTenantDesign(design, root.classList.contains('dark') ? 'dark' : 'light')
    return () => observer.disconnect()
  }, [design])

  return <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
}
