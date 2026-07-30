'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'

const PendenteContext = createContext(false)

/** `true` enquanto a navegação disparada pelo form está em voo. */
export function useListagemFormPendente(): boolean {
  return useContext(PendenteContext)
}

export interface ListagemFormProps {
  /**
   * Destino do form. Params a preservar entram como `<input type="hidden">`
   * montados no servidor por `serializarListagemParams` — assim a serialização
   * da URL vive num lugar só e o form não reimplementa o contrato.
   */
  action: string
  ariaLabel: string
  /** Reage ao digitar/selecionar em vez de exigir "Filtrar". */
  auto?: boolean
  debounceMs?: number
  className?: string
  children: ReactNode
}

/**
 * Form GET reativo das listagens. Sem JS continua sendo um form GET normal
 * (navegação real, deep-link válido); com JS, troca a URL por `router.replace`
 * dentro de uma transition — sem entrada nova no histórico a cada tecla.
 *
 * `pagina` deliberadamente não é preservada: mudar filtro ou busca precisa
 * voltar para a primeira página, senão o usuário cai num offset da consulta
 * antiga.
 */
export function ListagemForm({
  action,
  ariaLabel,
  auto = true,
  debounceMs = 320,
  className,
  children,
}: ListagemFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const timerRef = useRef<number | null>(null)
  const [pendente, startTransition] = useTransition()
  const [ultimaQuery, setUltimaQuery] = useState<string | null>(null)

  const navegar = useCallback(() => {
    const form = formRef.current
    if (!form) return
    const dados = new FormData(form)
    const search = new URLSearchParams()
    for (const [chave, valor] of dados.entries()) {
      if (typeof valor !== 'string') continue
      const limpo = valor.trim()
      if (!limpo) continue
      search.set(chave, limpo)
    }
    const qs = search.toString()
    if (qs === ultimaQuery) return
    setUltimaQuery(qs)
    startTransition(() => {
      router.replace(qs ? `${action}?${qs}` : action, { scroll: false })
    })
  }, [action, router, ultimaQuery])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  function agendar(atraso: number) {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(navegar, atraso)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    navegar()
  }

  return (
    <PendenteContext.Provider value={pendente}>
      <form
        ref={formRef}
        method="GET"
        action={action}
        aria-label={ariaLabel}
        className={className}
        onSubmit={handleSubmit}
        onChange={
          auto
            ? (event) => {
                const alvo = event.target as HTMLElement
                const digitando =
                  alvo instanceof HTMLInputElement &&
                  (alvo.type === 'search' || alvo.type === 'text')
                agendar(digitando ? debounceMs : 0)
              }
            : undefined
        }
      >
        {children}
      </form>
    </PendenteContext.Provider>
  )
}
