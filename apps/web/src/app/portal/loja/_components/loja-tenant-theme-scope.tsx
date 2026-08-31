'use client'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { applyTenantDesign, tenantDesignCriticalCss, type TenantDesign } from '@torcida/ui'
import { useTheme } from '@torcida/ui/services/theme'
import { resolveTenantDesign } from '@torcida/types'
import { LojaRememberStore } from './loja-fluxo'

const SCOPE_CLASS = 'loja-tema-scope'

/**
 * Aplica o design da loja visitada só no subtree da loja — o chrome do portal
 * (navbar) continua com a identidade do contexto ativo.
 */
export function LojaTenantThemeScope({
  tenantId,
  corPrimaria,
  design: designRaw,
  children,
}: {
  tenantId: string
  corPrimaria: string
  design?: unknown
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const design = useMemo(
    () => resolveTenantDesign(designRaw ?? null, corPrimaria) as TenantDesign,
    [designRaw, corPrimaria],
  )
  const { resolvedTheme } = useTheme()
  const criticalCss = useMemo(
    () => tenantDesignCriticalCss(design, 'dark', `.${SCOPE_CLASS}`),
    [design],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const mode = resolvedTheme === 'light' ? 'light' : 'dark'
    applyTenantDesign(design, mode, root)
  }, [design, resolvedTheme])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const html = document.documentElement
    const observer = new MutationObserver(() => {
      const mode = html.classList.contains('dark') ? 'dark' : 'light'
      applyTenantDesign(design, mode, root)
    })
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })
    applyTenantDesign(design, html.classList.contains('dark') ? 'dark' : 'light', root)
    return () => observer.disconnect()
  }, [design])

  return (
    <>
      <LojaRememberStore tenantId={tenantId} />
      <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
      <div ref={rootRef} className={`${SCOPE_CLASS} space-y-6`}>
        {children}
      </div>
    </>
  )
}
