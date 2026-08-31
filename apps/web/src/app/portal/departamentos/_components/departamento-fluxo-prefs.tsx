'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from '@torcida/ui/services/toast'
import { isRedirectError } from '@/lib/toast-action'
import { salvarPreferenciaFluxo } from '@/app/portal/departamentos/fluxos-actions'
import {
  FLUXO_HORIZONTE_JOGO_DIAS,
  FLUXO_MESES_CAMPANHA,
  receitasDoPanel,
} from '@torcida/types'

type PrefsLite = {
  desligados: readonly string[]
  receitas: Readonly<
    Record<
      string,
      {
        horizonteDias?: number
        meses?: readonly number[]
        diaSemana?: number
        responsavel?: 'gestor' | 'area'
      }
    >
  >
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES_CATALOGO = [
  ...new Set(Object.values(FLUXO_MESES_CAMPANHA).flatMap((m) => [...m])),
].sort((a, b) => a - b)

export function DepartamentoFluxoPrefs({
  departamentoId,
  slug,
  panel,
  prefs,
}: {
  departamentoId: string
  slug: string
  panel: string
  prefs: PrefsLite
}) {
  const receitas = receitasDoPanel(panel)
  const router = useRouter()
  const [pending, start] = useTransition()

  if (receitas.length === 0) return null

  function salvar(
    receitaId: string,
    patch: {
      vale?: 'sim' | 'nao'
      responsavel?: 'gestor' | 'area'
      horizonteDias?: number
      meses?: string
      diaSemana?: number
    },
  ) {
    start(async () => {
      try {
        const res = await salvarPreferenciaFluxo({
          departamentoId,
          slug,
          receitaId,
          ...patch,
        })
        if (res.error) {
          toast.error(res.error)
          return
        }
        if (patch.vale) toast.success(patch.vale === 'sim' ? 'Receita reativada' : 'Receita desligada nesta torcida')
        router.refresh()
      } catch (e) {
        if (isRedirectError(e)) throw e
        toast.error(e instanceof Error ? e.message : 'Não foi possível salvar')
      }
    })
  }

  return (
    <details className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-[rgb(var(--foreground))]">
        Receitas desta área
      </summary>
      <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
        Vale nesta torcida, quando disparar e quem responde. Não concede permissão.
      </p>
      <ul className="mt-3 space-y-3">
        {receitas.map((r) => {
          const vale = !prefs.desligados.includes(r.id)
          const rec = prefs.receitas[r.id] ?? {}
          const mesesAtivos =
            rec.meses && rec.meses.length > 0 ? rec.meses : MESES_CATALOGO
          return (
            <li key={r.id} className="border-t border-[rgb(var(--border))] pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-[rgb(var(--foreground))]">{r.label}</p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => salvar(r.id, { vale: vale ? 'nao' : 'sim' })}
                  className="app-touch-target text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline disabled:opacity-60"
                >
                  {vale ? 'Não usar nesta torcida' : 'Voltar a usar'}
                </button>
              </div>
              {vale ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[rgb(var(--foreground-muted))]">
                  <label className="inline-flex items-center gap-1.5">
                    Responde
                    <select
                      className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1 text-[rgb(var(--foreground))]"
                      disabled={pending}
                      value={rec.responsavel ?? 'gestor'}
                      onChange={(e) =>
                        salvar(r.id, { responsavel: e.target.value === 'area' ? 'area' : 'gestor' })
                      }
                    >
                      <option value="gestor">Gestor da área</option>
                      <option value="area">Responsável da frente</option>
                    </select>
                  </label>
                  {r.quando === 'horizonte' ? (
                    <label className="inline-flex items-center gap-1.5">
                      Horizonte
                      <select
                        className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1 text-[rgb(var(--foreground))]"
                        disabled={pending}
                        value={String(rec.horizonteDias ?? FLUXO_HORIZONTE_JOGO_DIAS)}
                        onChange={(e) => salvar(r.id, { horizonteDias: Number(e.target.value) })}
                      >
                        <option value="14">14 dias</option>
                        <option value="21">21 dias</option>
                        <option value="30">30 dias</option>
                        <option value="45">45 dias</option>
                      </select>
                    </label>
                  ) : null}
                  {r.quando === 'diaSemana' ? (
                    <label className="inline-flex items-center gap-1.5">
                      Dia
                      <select
                        className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1 text-[rgb(var(--foreground))]"
                        disabled={pending}
                        value={String(rec.diaSemana ?? 4)}
                        onChange={(e) => salvar(r.id, { diaSemana: Number(e.target.value) })}
                      >
                        {DIAS.map((d, i) => (
                          <option key={d} value={i}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {r.quando === 'meses' ? (
                    <div className="flex flex-wrap gap-1">
                      {MESES.map((label, i) => {
                        const mes = i + 1
                        const on = mesesAtivos.includes(mes)
                        return (
                          <button
                            key={label}
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              const next = on
                                ? mesesAtivos.filter((m) => m !== mes)
                                : [...mesesAtivos, mes]
                              if (next.length === 0) return
                              salvar(r.id, { meses: next.sort((a, b) => a - b).join(',') })
                            }}
                            className={[
                              'app-touch-target rounded-md px-2 text-[11px] font-medium',
                              on
                                ? 'bg-[rgb(var(--primary))] text-white'
                                : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                            ].join(' ')}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                  {r.quando === 'desfile' ? (
                    <span>Âncora: data do desfile no barracão.</span>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
