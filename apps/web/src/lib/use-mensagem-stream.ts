'use client'

import { useEffect, useRef } from 'react'
import { useServerSentPing } from '@/lib/use-server-sent-ping'

/**
 * Ping SSE da inbox — refetch lista/resumo/badge.
 * Polling mais lento permanece como fallback.
 */
export function useInboxStream(onPing: () => void): void {
  const debounceRef = useRef<number | null>(null)

  useServerSentPing('/api/conversas/stream', () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => onPing(), 250)
  })

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [])
}

/**
 * Ping SSE da thread aberta — fetch incremental de mensagens.
 */
export function useConversaStream(conversaId: string, onPing: () => void): void {
  const debounceRef = useRef<number | null>(null)

  useServerSentPing(`/api/conversas/${conversaId}/stream`, () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => onPing(), 150)
  })

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [conversaId])
}
