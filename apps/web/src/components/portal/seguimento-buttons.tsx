'use client'

import { useEffect, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ChevronDown, UserMinus } from 'lucide-react'
import { toast } from '@torcida/ui'
import { deixarDeSeguir, solicitarSeguir } from '@/app/portal/comunidade/actions'
import { fadeScale, popoverPanel, springSnappy, menuItemStagger } from '@/lib/motion-presets'

type SeguimentoStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' | null

interface SeguimentoButtonsProps {
  userId: string
  status: SeguimentoStatus
  isSelf?: boolean
  /** Labels curtos e `whitespace-nowrap` — para sidebars estreitas (ex.: Para seguir). */
  compact?: boolean
}

export function SeguimentoButtons({ userId, status, isSelf, compact = false }: SeguimentoButtonsProps) {
  const [pending, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const [localStatus, setLocalStatus] = useState(status)

  useEffect(() => {
    const timer = window.setTimeout(() => setLocalStatus(status), 0)
    return () => window.clearTimeout(timer)
  }, [status])

  if (isSelf) return null

  const actionPad = compact ? 'px-2 py-1' : 'px-3 py-1.5'
  const actionText = compact ? 'text-[11px]' : 'text-xs'

  return (
    <AnimatePresence mode="wait">
      {localStatus === 'APROVADO' ? (
        <m.div
          key="seguindo"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={springSnappy}
          className="relative shrink-0"
        >
          <m.button
            type="button"
            layout
            disabled={pending}
            onClick={() => setMenuOpen((v) => !v)}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-lg border border-[rgb(var(--border))] ${actionPad} ${actionText} font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60`}
          >
            Seguindo
            <ChevronDown className="h-3.5 w-3.5" />
          </m.button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                <m.div
                  variants={popoverPanel}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  transition={springSnappy}
                  className="absolute right-0 z-20 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
                >
                  <m.button
                    type="button"
                    custom={0}
                    variants={menuItemStagger}
                    initial="hidden"
                    animate="show"
                    disabled={pending}
                    onClick={() => {
                      setMenuOpen(false)
                      startTransition(async () => {
                        try {
                          await deixarDeSeguir(userId)
                          setLocalStatus(null)
                          toast.success('Você deixou de seguir este membro.')
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Não foi possível deixar de seguir.')
                        }
                      })
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    Deixar de seguir
                  </m.button>
                </m.div>
              </>
            )}
          </AnimatePresence>
        </m.div>
      ) : localStatus === 'PENDENTE' ? (
        <m.span
          key="pendente"
          variants={fadeScale}
          initial="hidden"
          animate="show"
          exit="hidden"
          transition={springSnappy}
          title="Solicitação pendente"
          className={`inline-flex shrink-0 whitespace-nowrap rounded-full bg-amber-100 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200`}
        >
          {compact ? 'Pendente' : 'Solicitação pendente'}
        </m.span>
      ) : (
        <m.button
          key="seguir"
          type="button"
          layout
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const status = await solicitarSeguir(userId)
                setLocalStatus(status)
                toast.success(
                  status === 'APROVADO'
                    ? 'Você começou a seguir este membro.'
                    : 'Solicitação enviada.',
                )
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Não foi possível seguir.')
              }
            })
          }
          whileTap={{ scale: 0.94 }}
          transition={springSnappy}
          className={`shrink-0 whitespace-nowrap rounded-lg bg-[rgb(var(--primary))] ${actionPad} ${actionText} font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60`}
        >
          Seguir
        </m.button>
      )}
    </AnimatePresence>
  )
}

interface SeguimentoReviewButtonsProps {
  seguimentoId: string
  seguidorId: string
  podeSeguirDeVolta: boolean
  onAprovar: (id: string) => Promise<void>
  onRejeitar: (id: string) => Promise<void>
  onSeguirDeVolta: (userId: string) => Promise<'APROVADO' | 'PENDENTE'>
  onResolved: () => void
}

export function SeguimentoReviewButtons({
  seguimentoId,
  seguidorId,
  podeSeguirDeVolta,
  onAprovar,
  onRejeitar,
  onSeguirDeVolta,
  onResolved,
}: SeguimentoReviewButtonsProps) {
  const [pending, startTransition] = useTransition()
  const [resolved, setResolved] = useState<'aprovar' | 'rejeitar' | 'seguindo' | 'pendente' | null>(null)

  function concluir() {
    onResolved()
  }

  return (
    <AnimatePresence mode="wait">
      {resolved === 'aprovar' ? (
        podeSeguirDeVolta ? (
          <m.div
            key="seguir-de-volta"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={springSnappy}
            className="flex flex-col items-end gap-2"
          >
            <span className="text-xs font-semibold text-emerald-600">Aprovado</span>
            <div className="flex items-center gap-2">
              <m.button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const status = await onSeguirDeVolta(seguidorId)
                      if (status === 'APROVADO') {
                        setResolved('seguindo')
                        toast.success('Você começou a seguir este membro.')
                      } else {
                        setResolved('pendente')
                        toast.success('Solicitação enviada — aguardando aprovação deles.')
                      }
                      window.setTimeout(concluir, 600)
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : 'Não foi possível seguir de volta.',
                      )
                    }
                  })
                }
                whileTap={{ scale: 0.94 }}
                transition={springSnappy}
                className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                Seguir de volta
              </m.button>
              <button
                type="button"
                disabled={pending}
                onClick={concluir}
                className="text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] disabled:opacity-60"
              >
                Agora não
              </button>
            </div>
          </m.div>
        ) : (
          <m.span
            key="aprovado"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={springSnappy}
            onAnimationComplete={concluir}
            className="text-xs font-semibold text-emerald-600"
          >
            Aprovado
          </m.span>
        )
      ) : resolved === 'seguindo' ? (
        <m.span
          key="seguindo"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springSnappy}
          className="text-xs font-semibold text-emerald-600"
        >
          Seguindo
        </m.span>
      ) : resolved === 'pendente' ? (
        <m.span
          key="pendente-volta"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springSnappy}
          className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        >
          Solicitação enviada
        </m.span>
      ) : resolved === 'rejeitar' ? (
        <m.span
          key="rejeitado"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={springSnappy}
          onAnimationComplete={concluir}
          className="text-xs font-semibold text-[rgb(var(--foreground-muted))]"
        >
          Rejeitado
        </m.span>
      ) : (
        <m.div key="acoes" className="flex items-center gap-2" layout>
          <m.button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await onAprovar(seguimentoId)
                  setResolved('aprovar')
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : 'Não foi possível aprovar a solicitação.',
                  )
                }
              })
            }
            whileTap={{ scale: 0.94 }}
            transition={springSnappy}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Aprovar
          </m.button>
          <m.button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await onRejeitar(seguimentoId)
                  setResolved('rejeitar')
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : 'Não foi possível rejeitar a solicitação.',
                  )
                }
              })
            }
            whileTap={{ scale: 0.94 }}
            transition={springSnappy}
            className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
          >
            Rejeitar
          </m.button>
        </m.div>
      )}
    </AnimatePresence>
  )
}
