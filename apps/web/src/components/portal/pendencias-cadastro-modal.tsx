'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { AlertTriangle, IdCard } from 'lucide-react'
import { toast } from '@torcida/ui'
import { springGentle, springSnappy } from '@/lib/motion-presets'
import {
  CAMPO_PENDENCIA_LABEL,
  type PendenciaCadastro,
} from '@/lib/pendencias-cadastro'
import { dispensarPendenciaCadastro } from '@/app/portal/cadastro/associacao/actions'

type Props = {
  pendencias: PendenciaCadastro[]
}

/**
 * Modal insistente no portal: completa dados ou dispensa (com ciência de
 * inadimplência). Reaparece em todo acesso enquanto houver pendência visível.
 */
export function PendenciasCadastroModal({ pendencias }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const naTelaDeAtualizacao = pendencias.some(
    (p) => pathname === p.href || pathname.startsWith(`${p.href}/`),
  )
  const principal = pendencias[0] ?? null
  /** Oculto só após «Ocultar aviso» deste código, até o refresh tirar a pendência. */
  const [codigoOculto, setCodigoOculto] = useState<string | null>(null)
  const [ciencia, setCiencia] = useState<{ codigo: string; ok: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  const cienciaOk = !!principal && ciencia?.codigo === principal.codigo && ciencia.ok
  const aberta =
    !!principal && !naTelaDeAtualizacao && principal.codigo !== codigoOculto

  if (!principal || naTelaDeAtualizacao) return null

  const nFalta = principal.camposFaltantes.length
  const camposPreview = principal.camposFaltantes
    .slice(0, 4)
    .map((c) => CAMPO_PENDENCIA_LABEL[c])
    .join(', ')
  const camposExtra = nFalta > 4 ? ` e mais ${nFalta - 4}` : ''
  const campos = camposPreview ? `${camposPreview}${camposExtra}` : ''

  function irAtualizar() {
    router.push(principal.href)
  }

  function dispensar() {
    if (!cienciaOk) {
      toast.error('Marque a ciência de que o cadastro ficará inadimplente.')
      return
    }
    startTransition(async () => {
      const r = await dispensarPendenciaCadastro(principal.codigo)
      if (!r.ok) {
        toast.error(r.message)
        return
      }
      toast.message('Aviso ocultado. Complete os dados quando puder para regularizar.')
      setCodigoOculto(principal.codigo)
      router.refresh()
    })
  }

  return (
    <AnimatePresence>
      {aberta && (
        <m.div
          key="pendencia-cadastro"
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pendencia-cadastro-titulo"
        >
          <m.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={springGentle}
            className="relative w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
                <IdCard className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="pendencia-cadastro-titulo"
                  className="text-lg font-semibold text-[rgb(var(--foreground))]"
                >
                  {principal.titulo}
                </h2>
                <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
                  {principal.descricao}
                </p>
                {campos ? (
                  <p className="mt-2 text-xs font-medium text-[rgb(var(--foreground))]">
                    {principal.progresso
                      ? `${principal.progresso.ok}/${principal.progresso.total} · `
                      : null}
                    Falta: {campos}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Se você marcar «não mostrar de novo» sem completar, o cadastro de sócio
                  fica <strong>inadimplente</strong> até os dados serem preenchidos.
                </p>
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-[rgb(var(--foreground-muted))]">
              <input
                type="checkbox"
                className="mt-1"
                checked={cienciaOk}
                onChange={(e) =>
                  setCiencia({ codigo: principal.codigo, ok: e.target.checked })
                }
              />
              <span>
                Não mostrar esta mensagem de novo. Estou ciente de que meu cadastro de sócio
                ficará inadimplente até eu atualizar os dados.
              </span>
            </label>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <m.button
                type="button"
                whileTap={{ scale: 0.98 }}
                transition={springSnappy}
                disabled={pending || !cienciaOk}
                onClick={dispensar}
                className="rounded-xl border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
              >
                Ocultar aviso
              </m.button>
              <m.button
                type="button"
                whileTap={{ scale: 0.98 }}
                transition={springSnappy}
                onClick={irAtualizar}
                className="rounded-xl bg-[rgb(var(--color-primary))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--color-primary-fg))]"
              >
                Atualizar cadastro
              </m.button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
