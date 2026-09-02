'use client'

import { useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMediaQuery } from '@/lib/use-media-query'

/** Ruído de subpixel (zoom, borda fracionária) não pode acender a seta. */
const TOLERANCIA_PX = 2

/** Largura do esmaecimento sob a seta — a mesma nas duas pontas. */
const FADE = '2.25rem'

type TrilhoTag = 'div' | 'nav' | 'ol' | 'ul'

export interface ScrollRailProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * Tag do trilho (o que rola e recebe `role`/`aria-label`/teclado).
   * O wrapper posicionado é sempre um `div` neutro, de propósito: as setas são
   * `<button>` e não podem morar dentro de um `role="tablist"` nem de um `<nav>`.
   */
  as?: TrilhoTag
  /**
   * Classes do wrapper — é ele que ocupa o lugar do trilho no layout do pai
   * (`flex-1`, `hidden xl:block`, `mt-4`…). Só o que posiciona sai do trilho.
   */
  wrapperClassName?: string
}

/**
 * Trilho horizontal com setas de rolagem que aparecem **só quando há conteúdo
 * escondido** — e só onde existe ponteiro fino.
 *
 * Por que existe: no mobile o dedo arrasta a fila de abas; no desktop não há
 * gesto equivalente, e a barra de rolagem está oculta (`app-scrollbar-none`)
 * em todos esses trilhos. Resultado: aba fora da largura da coluna virava aba
 * inalcançável. As setas são a ação que faltava no mouse.
 *
 * Reativo por medição, nunca por contagem de itens: `ResizeObserver` no trilho
 * **e nos filhos** (a largura do trilho é a do pai — trocar de aba ou ganhar
 * um badge muda o `scrollWidth` sem redimensionar o container) + `MutationObserver`
 * para item que entra/sai + evento de scroll. Tudo coalescido em um `rAF`,
 * que também evita `setState` síncrono dentro do efeito (ver
 * `docs/frontend/react-compiler.md`).
 *
 * O esmaecimento é `mask-image`, não gradiente colorido: assim o trilho serve
 * card (`--surface`) e página (`--background`) sem saber em qual está.
 */
export function ScrollRail({
  as = 'div',
  className = '',
  wrapperClassName = '',
  children,
  ...rest
}: ScrollRailProps) {
  const Trilho = as as 'div'
  const trilhoRef = useRef<HTMLDivElement | null>(null)
  const [inicio, setInicio] = useState(false)
  const [fim, setFim] = useState(false)
  // No toque arrastar já resolve, e a seta só cobriria uma aba. Snapshot do
  // servidor é `false`: as setas entram depois da hidratação, sem divergência.
  const ponteiroFino = useMediaQuery('(hover: hover) and (pointer: fine)')

  useEffect(() => {
    const el = trilhoRef.current
    if (!el) return

    let frame = 0
    const medir = () => {
      frame = 0
      setInicio(el.scrollLeft > TOLERANCIA_PX)
      setFim(el.scrollWidth - el.clientWidth - el.scrollLeft > TOLERANCIA_PX)
    }
    const agendar = () => {
      if (frame === 0) frame = requestAnimationFrame(medir)
    }

    const ro = new ResizeObserver(agendar)
    const observar = () => {
      ro.disconnect()
      ro.observe(el)
      for (const filho of Array.from(el.children)) ro.observe(filho)
      agendar()
    }
    const mo = new MutationObserver(observar)

    observar()
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    el.addEventListener('scroll', agendar, { passive: true })

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      el.removeEventListener('scroll', agendar)
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  const rolar = useCallback((direcao: 1 | -1) => {
    const el = trilhoRef.current
    if (!el) return
    // ~80% da largura visível: sobra sempre uma aba de âncora entre um clique e
    // o seguinte, e um item largo nunca é pulado inteiro.
    const passo = Math.max(el.clientWidth * 0.8, 120)
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direcao * passo, behavior: suave ? 'smooth' : 'auto' })
  }, [])

  const mascara =
    ponteiroFino && (inicio || fim)
      ? `linear-gradient(to right, ${
          inicio ? `transparent 0, #000 ${FADE}` : '#000 0'
        }, ${fim ? `#000 calc(100% - ${FADE}), transparent 100%` : '#000 100%'})`
      : undefined

  return (
    <div className={`relative min-w-0 ${wrapperClassName}`}>
      <Trilho
        {...rest}
        ref={trilhoRef}
        className={`app-scrollbar-none overflow-x-auto ${className}`}
        style={mascara ? { maskImage: mascara, WebkitMaskImage: mascara } : undefined}
      >
        {children}
      </Trilho>

      {ponteiroFino && (
        <>
          <SetaRail lado="inicio" visivel={inicio} onClick={() => rolar(-1)} />
          <SetaRail lado="fim" visivel={fim} onClick={() => rolar(1)} />
        </>
      )}
    </div>
  )
}

/**
 * Fora da árvore de acessibilidade de propósito: quem usa teclado já anda pelas
 * abas com as setas do teclado (e o foco rola o trilho sozinho), e um botão a
 * mais dentro de um `tablist`/`nav` só sujaria a leitura. `tabIndex={-1}` é
 * obrigatório junto do `aria-hidden` — elemento focável escondido de AT é erro.
 */
function SetaRail({
  lado,
  visivel,
  onClick,
}: {
  lado: 'inicio' | 'fim'
  visivel: boolean
  onClick: () => void
}) {
  const Icon = lado === 'inicio' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-hidden
      tabIndex={-1}
      disabled={!visivel}
      onClick={onClick}
      className={[
        'absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full',
        'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))] shadow-sm',
        'transition-opacity duration-150 hover:border-[rgb(var(--border-strong))] hover:text-[rgb(var(--foreground))]',
        lado === 'inicio' ? 'left-0' : 'right-0',
        visivel ? 'opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}
