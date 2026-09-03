'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { Check, Filter, X } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { popoverPanel, springSnappy } from '@/lib/motion-presets'
import type { ListagemFiltroTipo } from '@/lib/listagem'
import { AppButton } from '@/components/ui/button'
import { SearchFilterInput } from '@/components/ui/reactive-search'

export interface ListagemFiltroOpcaoUI {
  valor: string
  label: string
  /** Contagem da faceta. `undefined` quando o filtro não é facetado. */
  count?: number
  /** Href que liga/desliga esta opção — montado no servidor. */
  href: string
  ativo: boolean
}

export interface ListagemFiltroCampoOculto {
  nome: string
  valor: string
}

export interface ListagemColunaFiltroProps {
  filtroId: string
  label: string
  tipo: ListagemFiltroTipo
  /** Opções de `enum` com href de toggle. */
  opcoes?: ListagemFiltroOpcaoUI[]
  quantidadeAtiva: number
  hrefLimpar: string
  /** Destino e params preservados dos filtros `texto`/`data` (form GET). */
  form?: { action: string; ocultos: ListagemFiltroCampoOculto[] }
  valorTexto?: string
  valorDe?: string
  valorAte?: string
  /**
   * `coluna` (padrão) é o ícone discreto no `<th>`; `barra` é o botão rotulado
   * da toolbar, usado onde a coluna correspondente está escondida.
   */
  variante?: 'coluna' | 'barra'
}

const PAINEL_LARGURA = 248
const MARGEM = 8

/**
 * Filtro ancorado no cabeçalho da coluna.
 *
 * Renderiza em portal com posição fixa porque a tabela vive num container com
 * `overflow-x-auto`: um painel absoluto seria recortado pela própria rolagem
 * horizontal.
 *
 * Opções de `enum` são `<a>` com href montado no servidor — a lógica de
 * serialização da URL não é duplicada no cliente e o filtro funciona sem JS.
 */
export function ListagemColunaFiltro({
  filtroId,
  label,
  tipo,
  opcoes = [],
  quantidadeAtiva,
  hrefLimpar,
  form,
  valorTexto = '',
  valorDe = '',
  valorAte = '',
  variante = 'coluna',
}: ListagemColunaFiltroProps) {
  const router = useRouter()
  const painelId = useId()
  const botaoRef = useRef<HTMLButtonElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [pendente, startTransition] = useTransition()
  const [textoFiltro, setTextoFiltro] = useState(valorTexto)
  const [textoSincronizado, setTextoSincronizado] = useState(valorTexto)
  if (valorTexto !== textoSincronizado) {
    setTextoSincronizado(valorTexto)
    setTextoFiltro(valorTexto)
  }
  const ativo = quantidadeAtiva > 0

  const posicionar = useCallback(() => {
    const botao = botaoRef.current
    if (!botao) return
    const rect = botao.getBoundingClientRect()
    const left = Math.min(
      Math.max(MARGEM, rect.left),
      Math.max(MARGEM, window.innerWidth - PAINEL_LARGURA - MARGEM),
    )
    setPos({ top: rect.bottom + 6, left })
  }, [])

  useLayoutEffect(() => {
    if (!aberto) return
    posicionar()
  }, [aberto, posicionar])

  useEffect(() => {
    if (!aberto) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setAberto(false)
      botaoRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
    }
  }, [aberto, posicionar])

  useEffect(() => {
    if (!aberto) return
    const alvo = painelRef.current?.querySelector<HTMLElement>('a, input, button')
    alvo?.focus()
  }, [aberto])

  function navegar(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false })
    })
  }

  const painel = aberto && pos !== null && (
    <>
      <m.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        onClick={() => setAberto(false)}
        aria-hidden
      />
      <m.div
        key="painel"
        ref={painelRef}
        id={painelId}
        role="dialog"
        aria-label={`Filtrar por ${label}`}
        variants={popoverPanel}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={springSnappy}
        style={{ top: pos.top, left: pos.left, width: PAINEL_LARGURA }}
        className="fixed z-[61] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            {label}
          </p>
          {ativo && (
            <a
              href={hrefLimpar}
              onClick={(event) => {
                event.preventDefault()
                navegar(hrefLimpar)
              }}
              className="text-xs font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
            >
              Limpar
            </a>
          )}
        </div>

        {tipo === 'enum' ? (
          <div className="app-scrollbar-fina max-h-72 overflow-y-auto py-1">
            {opcoes.length === 0 ? (
              <p className="px-3 py-3 text-xs text-[rgb(var(--foreground-muted))]">
                Nenhuma opção disponível.
              </p>
            ) : (
              opcoes.map((opcao) => (
                <a
                  key={opcao.valor}
                  href={opcao.href}
                  aria-current={opcao.ativo ? 'true' : undefined}
                  aria-label={`${opcao.label} — ${opcao.ativo ? 'selecionado, clique para remover' : 'clique para filtrar'}`}
                  onClick={(event) => {
                    event.preventDefault()
                    navegar(opcao.href)
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  <span
                    className={[
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      opcao.ativo
                        ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                        : 'border-[rgb(var(--border))]',
                    ].join(' ')}
                    aria-hidden
                  >
                    {opcao.ativo && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{opcao.label}</span>
                  {opcao.count !== undefined && (
                    <span className="shrink-0 text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                      {opcao.count}
                    </span>
                  )}
                </a>
              ))
            )}
          </div>
        ) : (
          <form method="GET" action={form?.action ?? ''} className="space-y-2 p-3">
            {form?.ocultos.map((campo) => (
              <input key={campo.nome} type="hidden" name={campo.nome} value={campo.valor} />
            ))}
            {tipo === 'data' ? (
              <>
                <label className="block text-xs text-[rgb(var(--foreground-muted))]">
                  De
                  <div className="mt-1">
                    <DatePicker
                      name={`${filtroId}De`}
                      defaultValue={valorDe}
                      aria-label="Data inicial"
                    />
                  </div>
                </label>
                <label className="block text-xs text-[rgb(var(--foreground-muted))]">
                  Até
                  <div className="mt-1">
                    <DatePicker
                      name={`${filtroId}Ate`}
                      defaultValue={valorAte}
                      aria-label="Data final"
                    />
                  </div>
                </label>
              </>
            ) : (
              <SearchFilterInput
                name={filtroId}
                value={textoFiltro}
                onChange={setTextoFiltro}
                placeholder={`Filtrar ${label.toLowerCase()}…`}
                ariaLabel={`Filtrar ${label.toLowerCase()}`}
                exibirDropdown={false}
                size="sm"
                inputClassName="rounded-lg px-2 py-1.5"
              />
            )}
            <AppButton
              variant="primary"
              icon={Check}
              type="submit"
              className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              Aplicar
            </AppButton>
          </form>
        )}
      </m.div>
    </>
  )

  return (
    <>
      <m.button
        ref={botaoRef}
        type="button"
        whileTap={{ scale: 0.92 }}
        transition={springSnappy}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        aria-label={
          ativo
            ? `Filtrar por ${label} — ${quantidadeAtiva} ativo(s)`
            : `Filtrar por ${label}`
        }
        onClick={() => setAberto((v) => !v)}
        className={[
          'app-touch-target inline-flex shrink-0 items-center transition-colors',
          variante === 'barra'
            ? 'gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium'
            : 'h-5 gap-0.5 rounded px-1',
          ativo
            ? variante === 'barra'
              ? 'border-[rgb(var(--color-primary)_/_0.4)] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
              : 'bg-[rgb(var(--color-primary)_/_0.16)] text-[rgb(var(--color-primary-fg))]'
            : variante === 'barra'
              ? 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
          pendente ? 'animate-pulse' : '',
        ].join(' ')}
      >
        <Filter className={variante === 'barra' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden />
        {variante === 'barra' && <span>{label}</span>}
        {ativo && (
          <span
            className={
              variante === 'barra'
                ? 'rounded-full bg-[rgb(var(--color-primary))] px-1.5 text-[10px] font-bold tabular-nums text-[rgb(var(--color-primary-on))]'
                : 'text-[10px] font-bold tabular-nums'
            }
          >
            {quantidadeAtiva}
          </span>
        )}
      </m.button>
      {/* `aberto` só vira true por clique, ou seja, já no cliente — não há render
          de servidor tentando alcançar `document`. */}
      {aberto && createPortal(<AnimatePresence>{painel}</AnimatePresence>, document.body)}
    </>
  )
}

/** Chip de filtro ativo — remove só aquele valor. */
export function ListagemChipFiltro({
  label,
  valor,
  href,
}: {
  label: string
  valor: string
  href: string
}) {
  const router = useRouter()
  const [pendente, startTransition] = useTransition()

  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        startTransition(() => {
          router.replace(href, { scroll: false })
        })
      }}
      className={[
        'inline-flex items-center gap-1 rounded-full border border-[rgb(var(--color-primary)_/_0.4)] bg-[rgb(var(--color-primary)_/_0.1)] px-2 py-0.5 text-xs text-[rgb(var(--color-primary-fg))] transition-opacity hover:opacity-80',
        pendente ? 'opacity-60' : '',
      ].join(' ')}
      aria-label={`Remover filtro ${label}: ${valor}`}
    >
      <span className="font-medium">{label}:</span>
      <span className="max-w-[10rem] truncate">{valor}</span>
      <X className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  )
}
