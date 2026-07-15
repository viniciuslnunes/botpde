'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { AtSign, Check, Loader2, X } from 'lucide-react'
import { FieldError, Input } from '@torcida/ui'
import { normalizarNickname } from '@torcida/types'

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; proprio?: boolean }
  | { kind: 'unavailable'; motivo: string }
  | { kind: 'invalid'; motivo: string }

type Props = {
  id?: string
  name?: string
  defaultValue?: string
  /** @ atual do usuário — se igual ao digitado, conta como disponível. */
  nicknameAtual?: string | null
  label?: ReactNode
  helperText?: string
  errors?: string[]
  required?: boolean
  autoFocus?: boolean
  className?: string
}

export function NicknameField({
  id: idProp,
  name = 'nickname',
  defaultValue = '',
  nicknameAtual = null,
  label,
  helperText = 'Único na plataforma · letras, números e _ · 3 a 20 caracteres.',
  errors,
  required = true,
  autoFocus = false,
  className,
}: Props) {
  const autoId = useId()
  const id = idProp ?? `nickname-${autoId}`
  const [value, setValue] = useState(defaultValue)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    const normalizado = normalizarNickname(value)
    if (!normalizado) {
      setStatus({ kind: 'idle' })
      return
    }

    if (nicknameAtual && normalizado === normalizarNickname(nicknameAtual)) {
      setStatus({ kind: 'available', proprio: true })
      return
    }

    if (normalizado.length < 3) {
      setStatus({ kind: 'idle' })
      return
    }

    setStatus({ kind: 'checking' })
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/nickname/disponivel?q=${encodeURIComponent(normalizado)}`,
            { signal: ctrl.signal },
          )
          const data = (await res.json()) as {
            ok: boolean
            disponivel?: boolean
            proprio?: boolean
            motivo?: string
          }
          if (!res.ok || !data.ok) {
            setStatus({
              kind: 'invalid',
              motivo: data.motivo ?? 'Apelido inválido',
            })
            return
          }
          if (data.disponivel) {
            setStatus({ kind: 'available', proprio: data.proprio })
          } else {
            setStatus({
              kind: 'unavailable',
              motivo: data.motivo ?? 'Este apelido já está em uso.',
            })
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setStatus({ kind: 'idle' })
        }
      })()
    }, 350)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [value, nicknameAtual])

  const feedback =
    status.kind === 'checking' ? (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Verificando disponibilidade…
      </p>
    ) : status.kind === 'available' ? (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        {status.proprio ? 'Este é o seu apelido atual.' : '@ disponível'}
      </p>
    ) : status.kind === 'unavailable' || status.kind === 'invalid' ? (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
        <X className="h-3.5 w-3.5 shrink-0" />
        {status.motivo}
      </p>
    ) : (
      <p className="mt-1.5 text-xs text-[rgb(var(--foreground-muted))]">{helperText}</p>
    )

  return (
    <div className={className}>
      {label != null ? (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
        >
          {label}
        </label>
      ) : (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
        >
          <span className="flex items-center gap-1.5">
            <AtSign className="h-3.5 w-3.5" />
            Apelido {required ? <span className="text-red-500">*</span> : null}
          </span>
        </label>
      )}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[rgb(var(--foreground-muted))]">@</span>
        <Input
          id={id}
          name={name}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          placeholder="seu_apelido"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          pattern="[a-zA-Z0-9_]*"
          required={required}
          autoFocus={autoFocus}
          aria-invalid={
            status.kind === 'unavailable' || status.kind === 'invalid' || Boolean(errors?.length)
          }
          className="flex-1"
        />
      </div>
      {feedback}
      <FieldError errors={errors} />
    </div>
  )
}
