'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, IdCard } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  CAMPO_PENDENCIA_LABEL,
  type PendenciaCadastro,
} from '@/lib/pendencias-cadastro'
import { dispensarPendenciaCadastro } from '@/app/portal/cadastro/associacao/actions'

type Props = {
  pendencias: PendenciaCadastro[]
}

/**
 * Modal insistente no portal. Montado via portal no `document.body` para não
 * herdar stacking/`overflow` do shell. Sem animação de opacity no backdrop —
 * `opacity: 0` + `fixed inset-0` travava a UI sem o card aparecer.
 */
export function PendenciasCadastroModal({ pendencias }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const tituloId = useId()
  const [mounted, setMounted] = useState(false)
  const [codigoOculto, setCodigoOculto] = useState<string | null>(null)
  const [ciencia, setCiencia] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setMounted(true)
  }, [])

  const naTelaDeAtualizacao = pendencias.some(
    (p) => pathname === p.href || pathname.startsWith(`${p.href}/`),
  )
  const principal = pendencias[0] ?? null
  const aberta =
    mounted &&
    !!principal &&
    !naTelaDeAtualizacao &&
    principal.codigo !== codigoOculto

  useEffect(() => {
    setCiencia(false)
  }, [principal?.codigo])

  // Trava scroll do body enquanto o modal exige ação.
  useEffect(() => {
    if (!aberta) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [aberta])

  if (!aberta || !principal) return null

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
    if (!ciencia) {
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

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      data-pendencia-cadastro="aberta"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
            <IdCard className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2
              id={tituloId}
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
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
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
            checked={ciencia}
            onChange={(e) => setCiencia(e.target.checked)}
          />
          <span>
            Não mostrar esta mensagem de novo. Estou ciente de que meu cadastro de sócio
            ficará inadimplente até eu atualizar os dados.
          </span>
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={pending || !ciencia}
            onClick={dispensar}
            className="rounded-xl border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
          >
            Ocultar aviso
          </button>
          <button
            type="button"
            onClick={irAtualizar}
            className="rounded-xl bg-[rgb(var(--color-primary))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--color-primary-fg))]"
          >
            Atualizar cadastro
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
