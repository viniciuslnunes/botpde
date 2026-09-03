'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { labelStatusProjeto, STATUS_PROJETOS } from '@torcida/types'
import {
  atualizarStatusProjeto,
  registrarRealizadoProjeto,
} from '@/app/portal/departamentos/projetos-actions'
import { runPersistAction } from '@/lib/toast-action'
import { DepartamentoOpcaoPicker } from '@/components/departamentos/departamento-opcao-picker'
import { AppButton } from '@/components/ui/button'
import { ClipboardCheck } from 'lucide-react'

export function ProjetoAcoesInline({
  departamentoId,
  projetoId,
  slug,
  status,
  metaQuantidade,
  realizadoQuantidade,
}: {
  departamentoId: string
  projetoId: string
  slug: string
  status: string
  metaQuantidade: number | null
  realizadoQuantidade: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [registrando, setRegistrando] = useState(false)
  const [valor, setValor] = useState(String(realizadoQuantidade))

  function mudarStatus(proximo: string) {
    if (proximo === status) return
    start(async () => {
      const r = await atualizarStatusProjeto(departamentoId, projetoId, slug, proximo)
      if (r.error) {
        window.alert(r.error)
        return
      }
      router.refresh()
    })
  }

  function registrar() {
    start(async () => {
      const fd = new FormData()
      fd.set('departamentoId', departamentoId)
      fd.set('projetoId', projetoId)
      fd.set('slug', slug)
      fd.set('realizado', valor)
      const ok = await runPersistAction(() => registrarRealizadoProjeto({}, fd), {
        success: 'Alcance atualizado',
      })
      if (ok) {
        setRegistrando(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <label className="sr-only" htmlFor={`status-${projetoId}`}>
        Status
      </label>
      <DepartamentoOpcaoPicker
        opcoes={STATUS_PROJETOS.map((s) => ({ id: s, nome: labelStatusProjeto(s) }))}
        value={status}
        onChange={mudarStatus}
        disabled={pending}
        ariaLabel="Status do projeto"
        menuAriaLabel="Status disponíveis"
      />
      {metaQuantidade != null ? (
        registrando ? (
          <div className="flex items-center gap-1">
            <label className="sr-only" htmlFor={`realizado-${projetoId}`}>
              Alcance realizado
            </label>
            <input
              id={`realizado-${projetoId}`}
              type="number"
              min={0}
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-20 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1 text-xs tabular-nums"
            />
            <button
              type="button"
              disabled={pending}
              onClick={registrar}
              className="app-action rounded-lg bg-[rgb(var(--primary))] px-2 text-xs font-medium text-primary-on disabled:opacity-50"
            >
              Ok
            </button>
          </div>
        ) : (
          <AppButton
            variant="none"
            icon={ClipboardCheck}
            type="button"
            onClick={() => setRegistrando(true)}
            className="app-action text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] hover:underline"
          >
            Registrar
          </AppButton>
        )
      ) : null}
    </div>
  )
}
