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
}

export function SeguimentoButtons({ userId, status, isSelf }: SeguimentoButtonsProps) {
  const [pending, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const [localStatus, setLocalStatus] = useState(status)

  useEffect(() => {
    const timer = window.setTimeout(() => setLocalStatus(status), 0)
    return () => window.clearTimeout(timer)
  }, [status])

  if (isSelf) return null

  return (
    <AnimatePresence mode="wait">
      {localStatus === 'APROVADO' ? (
        <m.div
          key="seguindo"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={springSnappy}
          className="relative"
        >
          <m.button
            type="button"
            layout
            disabled={pending}
            onClick={() => setMenuOpen((v) => !v)}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
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
          className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        >
          Solicitação pendente
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
                await solicitarSeguir(userId)
                setLocalStatus('PENDENTE')
                toast.success('Solicitação enviada.')
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Não foi possível seguir.')
              }
            })
          }
          whileTap={{ scale: 0.94 }}
          transition={springSnappy}
          className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Seguir
        </m.button>
      )}
    </AnimatePresence>
  )
}

interface SeguimentoReviewButtonsProps {
  seguimentoId: string
  onAprovar: (id: string) => Promise<void>
  onRejeitar: (id: string) => Promise<void>
}

export function SeguimentoReviewButtons({
  seguimentoId,
  onAprovar,
  onRejeitar,
}: SeguimentoReviewButtonsProps) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => onAprovar(seguimentoId))}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        Aprovar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => onRejeitar(seguimentoId))}
        className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
      >
        Rejeitar
      </button>
    </div>
  )
}
