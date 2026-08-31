'use client'

import { useEffect, useRef } from 'react'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { registrarVisitaTopicoAction } from '../praca-actions'

/** Incrementa visita no cliente após o paint — não escreve no GET. */
export function RegistrarVisitaTopico({
  topicoId,
  escopo,
}: {
  topicoId: string
  escopo: EscopoComunidade
}) {
  const enviado = useRef(false)
  useEffect(() => {
    if (enviado.current) return
    const chave = `praca-visita:${topicoId}`
    try {
      if (sessionStorage.getItem(chave)) {
        enviado.current = true
        return
      }
      sessionStorage.setItem(chave, '1')
    } catch {
      /* private mode */
    }
    enviado.current = true
    const fd = new FormData()
    fd.set('topicoId', topicoId)
    fd.set('escopo', escopo)
    void registrarVisitaTopicoAction(fd)
  }, [topicoId, escopo])
  return null
}
