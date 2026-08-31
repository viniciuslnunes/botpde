'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, IdCard, ShieldCheck } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  CAMPO_PENDENCIA_LABEL,
  type PendenciaCadastro,
} from '@/lib/pendencias-cadastro'
import { dispensarPendenciaCadastro } from '@/app/portal/cadastro/associacao/actions'
import { useHidratado } from '@/lib/use-hidratado'

type Props = {
  pendencias: PendenciaCadastro[]
}

function motivoPrincipal(p: PendenciaCadastro): {
  titulo: string
  corpo: string
  destaque: string
} {
  const faltaCarteirinha = p.camposFaltantes.some(
    (c) => c === 'dataExpedicaoCarteirinha' || c === 'periodicidadePretendida',
  )
  if (faltaCarteirinha) {
    return {
      titulo: 'Por que atualizar agora',
      corpo:
        'A data de expedição e o plano definem a validade da carteirinha digital. Sem eles a torcida não consegue emitir nem confirmar se você está vigente neste ciclo.',
      destaque: 'Atualizar = vigência correta · Ignorar = inadimplente até completar',
    }
  }
  return {
    titulo: 'Por que atualizar agora',
    corpo:
      'A ficha incompleta impede a torcida de confirmar sua situação de sócio. Completar os dados regulariza a vigência; ocultar o aviso sem preencher marca o cadastro como inadimplente.',
    destaque: 'Atualizar = vigência em dia · Ignorar = inadimplente até completar',
  }
}

/**
 * Modal insistente no portal. Montado via portal no `document.body`.
 */
export function PendenciasCadastroModal({ pendencias }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const tituloId = useId()
  const mounted = useHidratado()
  const [codigoOculto, setCodigoOculto] = useState<string | null>(null)
  const [ciencia, setCiencia] = useState(false)
  const [pending, startTransition] = useTransition()


  const naTelaDeAtualizacao = pendencias.some((p) => {
    const path = (p.href.split('#')[0] ?? p.href).split('?')[0] ?? p.href
    return pathname === path || pathname.startsWith(`${path}/`)
  })
  const principal = pendencias[0] ?? null
  const aberta =
    mounted &&
    !!principal &&
    !naTelaDeAtualizacao &&
    principal.codigo !== codigoOculto

  // Outra pendência = outra ciência: desmarca no render, para o checkbox não
  // aparecer marcado por um frame no aviso novo.
  const [codigoSincronizado, setCodigoSincronizado] = useState(principal?.codigo)
  if (principal?.codigo !== codigoSincronizado) {
    setCodigoSincronizado(principal?.codigo)
    setCiencia(false)
  }

  useEffect(() => {
    if (!aberta) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [aberta])

  if (!aberta || !principal) return null

  const motivo = motivoPrincipal(principal)
  const faltantesLabels = principal.camposFaltantes.map((c) => CAMPO_PENDENCIA_LABEL[c])
  const preview = faltantesLabels.slice(0, 5)
  const resto = faltantesLabels.length - preview.length

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
      <div className="relative max-h-[min(90dvh,42rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
            <IdCard className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <h2
              id={tituloId}
              className="text-lg font-semibold leading-snug text-[rgb(var(--foreground))]"
            >
              {principal.titulo}
            </h2>
            <p className="text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
              {principal.descricao}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.08)] p-3">
          <div className="flex gap-2">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]"
              aria-hidden
            />
            <div className="min-w-0 space-y-1.5 text-sm leading-relaxed">
              <p className="font-semibold text-[rgb(var(--foreground))]">{motivo.titulo}</p>
              <p className="text-[rgb(var(--foreground-muted))]">{motivo.corpo}</p>
              <p className="pt-0.5 text-xs font-semibold text-[rgb(var(--color-primary-fg))]">
                {motivo.destaque}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] px-3 py-2.5">
          {principal.progresso ? (
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
              {principal.progresso.ok}/{principal.progresso.total}
              <span className="font-normal text-[rgb(var(--foreground-muted))]">
                {' '}
                · {principal.camposFaltantes.length} obrigatório(s) faltando
              </span>
            </p>
          ) : null}
          {preview.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-[rgb(var(--foreground-muted))]">
              {preview.map((label) => (
                <li key={label} className="flex gap-2">
                  <span className="text-amber-600 dark:text-amber-400" aria-hidden>
                    ·
                  </span>
                  <span>{label}</span>
                </li>
              ))}
              {resto > 0 ? (
                <li className="pl-3 text-xs">e mais {resto} campo(s)</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-950 dark:text-amber-100">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Se você escolher <strong>não mostrar esta mensagem de novo</strong> sem
              completar, o cadastro de sócio fica <strong>inadimplente</strong> até os
              dados serem preenchidos — e a vigência deixa de estar regularizada.
            </p>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
          <input
            type="checkbox"
            className="mt-1 shrink-0"
            checked={ciencia}
            onChange={(e) => setCiencia(e.target.checked)}
          />
          <span>
            Não mostrar esta mensagem de novo.
            <br />
            Estou ciente de que meu cadastro de sócio ficará inadimplente até eu
            atualizar os dados.
          </span>
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={pending || !ciencia}
            onClick={dispensar}
            className="app-action rounded-xl border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
          >
            Ocultar aviso
          </button>
          <button
            type="button"
            onClick={irAtualizar}
            className="btn-primary app-action inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            Atualizar cadastro
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
