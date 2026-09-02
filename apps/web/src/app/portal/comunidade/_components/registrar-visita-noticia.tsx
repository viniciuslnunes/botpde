'use client'

import { useEffect, useRef } from 'react'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { registrarVisitaNoticiaAction } from '../praca-actions'

/** Incrementa visita no cliente após o paint — não escreve no GET. */
export function RegistrarVisitaNoticia({
  alvoTipo,
  alvoId,
  escopo,
}: {
  alvoTipo: 'ARTIGO' | 'NOTICIA'
  alvoId: string
  escopo: EscopoComunidade
}) {
  const enviado = useRef(false)
  useEffect(() => {
    if (enviado.current) return
    const chave = `praca-visita-noticia:${alvoTipo}:${alvoId}`
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
    fd.set('alvoTipo', alvoTipo)
    fd.set('alvoId', alvoId)
    fd.set('escopo', escopo)
    void registrarVisitaNoticiaAction(fd)
  }, [alvoTipo, alvoId, escopo])
  return null
}
