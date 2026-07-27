'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUnsavedChangesContext } from './context'

function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
}

function resolveInternalHref(anchor: HTMLAnchorElement): URL | null {
  if (anchor.target && anchor.target !== '_self') return null
  if (anchor.hasAttribute('download')) return null
  const href = anchor.getAttribute('href')
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return null
  }
  try {
    const url = new URL(href, window.location.href)
    if (url.origin !== window.location.origin) return null
    return url
  } catch {
    return null
  }
}

function sameDocumentPath(url: URL): boolean {
  return (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash === window.location.hash
  )
}

export function NavigationGuard() {
  const { isDirty, confirmDiscard, isUnloadAllowed } = useUnsavedChangesContext()
  const router = useRouter()
  const pathname = usePathname()
  const confirmingRef = useRef(false)
  const dirtyRef = useRef(isDirty)
  const isUnloadAllowedRef = useRef(isUnloadAllowed)

  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    isUnloadAllowedRef.current = isUnloadAllowed
  }, [isUnloadAllowed])

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (isUnloadAllowedRef.current() || !dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    async function onClick(event: MouseEvent) {
      if (isUnloadAllowedRef.current() || !dirtyRef.current || confirmingRef.current) return
      if (isModifiedClick(event) || event.defaultPrevented) return

      const target = event.target
      if (!(target instanceof Element)) return
      // Clique no próprio modal de descarte / confirm — não interceptar.
      if (target.closest('[data-unsaved-backdrop], [role="dialog"][aria-modal="true"]')) {
        return
      }
      const anchor = target.closest('a')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.dataset.unsavedBypass === 'true') return

      const url = resolveInternalHref(anchor)
      if (!url || sameDocumentPath(url)) return

      event.preventDefault()
      event.stopPropagation()
      // Evita outline de foco no link parecer “navegação bem-sucedida” enquanto
      // o modal de descarte está aberto (ou invisível por bug de animação).
      anchor.blur()

      confirmingRef.current = true
      try {
        const ok = await confirmDiscard()
        if (ok) {
          const next = `${url.pathname}${url.search}${url.hash}`
          router.push(next)
        }
      } finally {
        confirmingRef.current = false
      }
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [confirmDiscard, router, pathname])

  return null
}
