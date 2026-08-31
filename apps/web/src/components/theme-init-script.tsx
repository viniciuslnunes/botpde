'use client'

import { useRef } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { themeBlockingScript } from '@torcida/ui/services/theme-script'

/**
 * Injeta o script de tema no HTML do SSR, fora da árvore React do client.
 * Um `<script>` no layout (ou no ThemeProvider) dispara o aviso do React 19.
 */
export function ThemeInitScript() {
  const inserted = useRef(false)
  useServerInsertedHTML(() => {
    if (inserted.current) return null
    inserted.current = true
    return (
      <script
        id="torcida-theme-init"
        dangerouslySetInnerHTML={{ __html: themeBlockingScript }}
      />
    )
  })
  return null
}
