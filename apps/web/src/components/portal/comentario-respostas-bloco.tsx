'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { ChevronDown, Send, X } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { collapsePanel, springGentle, springSnappy } from '@/lib/motion-presets'

/**
 * Ações + thread sob um comentário (padrão Meu Timão integrado):
 * Responder e “N respostas” na mesma linha; lista achatada; composer opcional
 * embutido quando alguém está respondendo nesta thread.
 */
export function ComentarioRespostasBloco({
  total,
  defaultAberto,
  forcarAberto = false,
  acaoResponder,
  composer,
  children,
}: {
  total: number
  defaultAberto?: boolean
  /** Abre e mantém aberto (ex.: usuário clicou Responder nesta thread). */
  forcarAberto?: boolean
  acaoResponder?: ReactNode
  composer?: ReactNode
  children?: ReactNode
}) {
  const inicial = defaultAberto ?? total <= 2
  const [abertoManual, setAbertoManual] = useState(inicial || forcarAberto)
  // Abrir por `forcarAberto` PERSISTE: quem responde na thread continua vendo-a
  // depois de enviar. Ajuste no render (não em effect) — ver docs/frontend/react-compiler.md.
  const [forcadoAnterior, setForcadoAnterior] = useState(forcarAberto)
  if (forcarAberto !== forcadoAnterior) {
    setForcadoAnterior(forcarAberto)
    if (forcarAberto) setAbertoManual(true)
  }

  const aberto = forcarAberto || abertoManual
  const temRespostas = total > 0
  const rotulo = total === 1 ? '1 resposta' : `${total} respostas`

  if (!acaoResponder && !temRespostas && !composer) return null

  return (
    <div className="mt-1.5">
      {(acaoResponder || temRespostas) && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {acaoResponder}
          {temRespostas ? (
            <>
              {acaoResponder ? (
                <span className="text-xs text-[rgb(var(--foreground-muted)_/_0.55)]" aria-hidden>
                  ·
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setAbertoManual((v) => !v)}
                aria-expanded={aberto}
                className="app-touch-line inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-semibold text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
              >
                <span>{rotulo}</span>
                <ChevronDown
                  className={[
                    'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                    aberto ? 'rotate-180' : '',
                  ].join(' ')}
                  aria-hidden
                />
              </button>
            </>
          ) : null}
        </div>
      )}

      <AnimatePresence initial={false}>
        {aberto && temRespostas ? (
          <m.div
            key="respostas"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            className="overflow-hidden"
          >
            <div className="mt-2 divide-y divide-[rgb(var(--border)_/_0.7)] border-l-2 border-[rgb(var(--border))] pl-3 sm:pl-3.5">
              {children}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      {composer ? <div className="mt-2">{composer}</div> : null}
    </div>
  )
}

/** O comentário alvo pertence a esta raiz (ou é a própria raiz). */
export function comentarioEstaNaThread(
  raizId: string,
  respostasIds: string[],
  alvoId: string | null,
): boolean {
  if (!alvoId) return false
  return alvoId === raizId || respostasIds.includes(alvoId)
}

/** Composer embutido sob a thread (quando Responder está ativo). */
export function ComentarioComposerInline({
  valor,
  onChange,
  onSubmit,
  onCancelar,
  respondendoANome,
  pending = false,
  placeholder = 'Escreva sua resposta…',
  maxLength = 2000,
}: {
  valor: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  onCancelar: () => void
  respondendoANome: string
  pending?: boolean
  placeholder?: string
  maxLength?: number
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] p-2.5"
    >
      <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-[rgb(var(--foreground-muted))]">
        <span>
          Respondendo a{' '}
          <span className="font-semibold text-[rgb(var(--foreground))]">{respondendoANome}</span>
        </span>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cancelar resposta"
          className="app-touch-target inline-flex rounded-lg p-1 hover:bg-[rgb(var(--surface))]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          autoFocus
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-base text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))] sm:h-9 sm:py-0 sm:text-sm"
        />
        <m.button
          type="submit"
          disabled={pending || valor.trim().length === 0}
          whileTap={{ scale: 0.96 }}
          transition={springSnappy}
          aria-label="Enviar resposta"
          className="app-action shrink-0 rounded-lg bg-[rgb(var(--color-primary))] px-3 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </m.button>
      </div>
    </form>
  )
}
