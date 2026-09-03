'use client'

import { useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Flag, Loader2, X } from 'lucide-react'
import { CATEGORIAS_DENUNCIA_UI } from '@torcida/types'
import { AppModal, AppModalBody } from '@/components/ui/app-modal'
import { collapsePanel, springGentle, springSnappy } from '@/lib/motion-presets'
import { denunciarPracaAction } from '../praca-actions'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { AppButton } from '@/components/ui/button'

export type AlvoDenunciaPraca = 'FORUM_TOPICO' | 'FORUM_RESPOSTA' | 'PRACA_COMENTARIO'

const ROTULO_ALVO: Record<AlvoDenunciaPraca, string> = {
  FORUM_TOPICO: 'este tópico',
  FORUM_RESPOSTA: 'esta resposta',
  PRACA_COMENTARIO: 'este comentário',
}

const MOTIVO_MAX = 500

/**
 * Denúncia na praça. A pessoa escolhe uma das 8 categorias de
 * `CATEGORIAS_DENUNCIA_UI` — a gravidade, o SLA e o escalonamento saem dela no
 * servidor, nunca do cliente.
 */
export function PracaDenunciaModal({
  aberto,
  onFechar,
  escopo,
  alvoTipo,
  alvoId,
}: {
  aberto: boolean
  onFechar: () => void
  escopo: EscopoComunidade
  alvoTipo: AlvoDenunciaPraca
  alvoId: string
}) {
  const [categoria, setCategoria] = useState<string>('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)
  const [pending, startTransition] = useTransition()

  function fechar() {
    if (pending) return
    onFechar()
  }

  function enviar() {
    if (!categoria) {
      setErro('Escolha o motivo da denúncia.')
      return
    }
    setErro(null)
    const fd = new FormData()
    fd.set('escopo', escopo)
    fd.set('alvoTipo', alvoTipo)
    fd.set('alvoId', alvoId)
    fd.set('categoria', categoria)
    if (motivo.trim()) fd.set('motivo', motivo.trim())
    startTransition(async () => {
      const r = await denunciarPracaAction(fd)
      if ('error' in r) {
        setErro(r.error)
        return
      }
      setEnviada(true)
    })
  }

  return (
    <AppModal
      open={aberto}
      onClose={fechar}
      size="md"
      labelledBy="praca-denuncia-titulo"
      busy={pending}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
            <Flag className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2
              id="praca-denuncia-titulo"
              className="text-base font-semibold text-[rgb(var(--foreground))]"
            >
              Denunciar {ROTULO_ALVO[alvoTipo]}
            </h2>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              A moderação analisa e você é avisado do desfecho. O autor não vê quem denunciou.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="app-touch-target shrink-0 rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {enviada ? (
        <>
          <AppModalBody className="px-4 py-6 sm:px-5">
            <m.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springGentle}
              className="text-sm text-[rgb(var(--foreground))]"
            >
              Denúncia enviada. A moderação vai analisar e você recebe uma notificação com o
              resultado.
            </m.p>
          </AppModalBody>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5">
            <AppButton
              variant="primary"
              icon={X}
              type="button"
              onClick={onFechar}
              className="rounded-lg px-3.5 text-sm font-semibold"
            >
              Fechar
            </AppButton>
          </div>
        </>
      ) : (
        <>
          <AppModalBody className="space-y-4 px-4 py-4 sm:px-5">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                O que está acontecendo?
              </legend>
              <div className="space-y-1">
                {CATEGORIAS_DENUNCIA_UI.map((opcao) => {
                  const marcada = categoria === opcao.codigo
                  return (
                    <label
                      key={opcao.codigo}
                      className={[
                        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                        marcada
                          ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'
                          : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="praca-denuncia-categoria"
                        value={opcao.codigo}
                        checked={marcada}
                        onChange={() => {
                          setCategoria(opcao.codigo)
                          setErro(null)
                        }}
                        className="shrink-0 accent-red-600"
                      />
                      <span className="text-sm">{opcao.label}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label
                htmlFor="praca-denuncia-motivo"
                className="block text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]"
              >
                Quer explicar melhor?{' '}
                <span className="font-normal normal-case tracking-normal">· opcional</span>
              </label>
              <textarea
                id="praca-denuncia-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_MAX))}
                rows={3}
                placeholder="Conte o que a moderação precisa saber para analisar."
                className="w-full resize-y rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--primary))]"
              />
              <p className="text-right text-xs text-[rgb(var(--foreground-muted))]">
                {motivo.trim().length}/{MOTIVO_MAX}
              </p>
            </div>

            <AnimatePresence initial={false}>
              {erro && (
                <m.p
                  key="praca-denuncia-erro"
                  variants={collapsePanel}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  transition={springGentle}
                  role="alert"
                  className="overflow-hidden rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300"
                >
                  {erro}
                </m.p>
              )}
            </AnimatePresence>
          </AppModalBody>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5">
            <AppButton
              variant="none"
              icon={X}
              type="button"
              onClick={fechar}
              disabled={pending}
              className="app-action rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] disabled:opacity-60"
            >
              Cancelar
            </AppButton>
            <m.button
              type="button"
              onClick={enviar}
              disabled={pending}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              className="btn-danger-soft app-action inline-flex items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? 'Enviando…' : 'Enviar denúncia'}
            </m.button>
          </div>
        </>
      )}
    </AppModal>
  )
}

/**
 * Disparo discreto de denúncia onde não há menu — resposta do fórum e
 * comentário da praça. Segue o visual do vizinho (`ModerarRespostaBotao`):
 * texto pequeno, apagado, sem competir com o conteúdo.
 */
export function PracaDenunciarBotao({
  escopo,
  alvoTipo,
  alvoId,
  className,
}: {
  escopo: EscopoComunidade
  alvoTipo: AlvoDenunciaPraca
  alvoId: string
  className?: string
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <AppButton
        variant="none"
        icon={Flag}
        type="button"
        onClick={() => setAberto(true)}
        className={[
          'app-touch-line text-[11px] font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-red-600',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        Denunciar
      </AppButton>
      {aberto && (
        <PracaDenunciaModal
          aberto={aberto}
          onFechar={() => setAberto(false)}
          escopo={escopo}
          alvoTipo={alvoTipo}
          alvoId={alvoId}
        />
      )}
    </>
  )
}
