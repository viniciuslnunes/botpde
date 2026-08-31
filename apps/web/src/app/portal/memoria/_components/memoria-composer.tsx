'use client'

import { useState, useTransition } from 'react'
import { toast } from '@torcida/ui'
import { criarMemoriaFato } from '../actions'
import { diaValidoParaFatoAtrasado, diaValidoParaPublicarMemoria } from '@torcida/types'

type Props = {
  diaIso: string
  hojeIso: string
  /** Dia sem jogo/evento/publicação — o composer já abre. */
  diaVazio?: boolean
}

export function MemoriaComposer({ diaIso, hojeIso, diaVazio = false }: Props) {
  const atrasado = diaValidoParaFatoAtrasado(diaIso, hojeIso)
  const [aberto, setAberto] = useState(diaVazio)
  const [conteudo, setConteudo] = useState('')
  const [visibilidade, setVisibilidade] = useState<'PUBLICO' | 'TENANT'>('PUBLICO')
  const [pending, start] = useTransition()

  if (!diaValidoParaPublicarMemoria(diaIso, hojeIso)) {
    return null
  }

  function enviar() {
    const texto = conteudo.trim()
    if (!texto) {
      toast.error(atrasado ? 'Escreva o que rolou naquele dia.' : 'Escreva o que entra neste dia.')
      return
    }
    start(async () => {
      const res = await criarMemoriaFato({
        dia: diaIso,
        conteudo: texto,
        visibilidade,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        atrasado
          ? 'Enviado para a moderação — entra na linha quando for aprovado.'
          : 'Publicado neste dia.',
      )
      setConteudo('')
      setAberto(false)
    })
  }

  const titulo = atrasado ? 'Ligar a este dia' : 'Publicar neste dia'
  const placeholder = atrasado
    ? 'O que aconteceu nesse dia e não foi publicado na hora.'
    : 'O que entra na memória desta data.'

  return (
    <section className="rounded-2xl border border-dashed border-[rgb(var(--border))] p-4">
      {aberto ? (
        <div className="space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground))]">
            {titulo}
          </p>
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder={placeholder}
            className="w-full resize-y rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-base text-[rgb(var(--foreground))]"
          />
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="sr-only">Quem vê</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="memoria-vis"
                checked={visibilidade === 'PUBLICO'}
                onChange={() => setVisibilidade('PUBLICO')}
              />
              Público
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="memoria-vis"
                checked={visibilidade === 'TENANT'}
                onChange={() => setVisibilidade('TENANT')}
              />
              Só a unidade
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={enviar}
              className="app-action rounded-xl bg-[rgb(var(--color-primary))] px-4 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-60"
            >
              {pending ? 'Enviando…' : atrasado ? 'Enviar para moderação' : 'Publicar'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setAberto(false)}
              className="app-action rounded-xl px-4 text-sm text-[rgb(var(--foreground-muted))]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="app-action font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--color-primary-fg))]"
        >
          {titulo}
        </button>
      )}
    </section>
  )
}
