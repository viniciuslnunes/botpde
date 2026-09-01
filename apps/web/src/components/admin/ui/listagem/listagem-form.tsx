'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { useLatestRef } from '@/lib/use-latest-ref'
import { PARAM_BUSCA } from '@/lib/listagem'
import {
  marcarSkipRestoreListagem,
  queryDaJanela,
  serializarQueryFormListagem,
} from '@/lib/listagem/form-query'

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
 *
 * A query atual vem da janela, não de estado interno: comparar com um
 * `ultimaQuery` local pulava o `replace` ao limpar o campo (o input já estava
 * vazio, a URL ainda tinha `?q=`, e o próximo debounce via o skip).
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
  const overrideRef = useRef<Record<string, string>>({})
  const [pendente, startTransition] = useTransition()

  const navegar = () => {
    const form = formRef.current
    if (!form) return
    const qs = serializarQueryFormListagem(new FormData(form), overrideRef.current)
    overrideRef.current = {}
    const atual = queryDaJanela()
    if (qs === atual) return
    const tinhaBusca = new URLSearchParams(atual).has('q')
    const ficaSemBusca = !new URLSearchParams(qs).has('q')
    if (tinhaBusca && ficaSemBusca) marcarSkipRestoreListagem(action)
    startTransition(() => {
      router.replace(qs ? `${action}?${qs}` : action, { scroll: false })
    })
  }
  const navegarRef = useLatestRef(navegar)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  function agendar(atraso: number) {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      navegarRef.current()
    }, atraso)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    const qInput = formRef.current?.elements.namedItem(PARAM_BUSCA)
    if (qInput instanceof HTMLInputElement) {
      overrideRef.current = { ...overrideRef.current, [PARAM_BUSCA]: qInput.value }
    }
    navegar()
  }

  function handleAuto(event: { target: EventTarget | null }) {
    const alvo = event.target
    if (alvo instanceof HTMLInputElement && alvo.name) {
      overrideRef.current = { ...overrideRef.current, [alvo.name]: alvo.value }
    } else if (alvo instanceof HTMLSelectElement && alvo.name) {
      overrideRef.current = { ...overrideRef.current, [alvo.name]: alvo.value }
    }

    const digitando =
      alvo instanceof HTMLInputElement &&
      (alvo.type === 'search' || alvo.type === 'text')
    const vazio = digitando && alvo.value.trim() === ''
    // Limpar o campo precisa ir pra URL no mesmo instante: o debounce de
    // digitação deixava a lista no filtro antigo com o input já vazio.
    agendar(digitando && !vazio ? debounceMs : 0)
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
        onInput={auto ? handleAuto : undefined}
      >
        {children}
      </form>
    </PendenteContext.Provider>
  )
}
