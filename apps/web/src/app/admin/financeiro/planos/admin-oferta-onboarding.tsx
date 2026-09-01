'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  PERIODICIDADE_PLANO_LABEL,
  PERIODICIDADE_PLANO_MESES,
  PeriodicidadePlanoSchema,
  resolverPeriodicidadesOnboarding,
} from '@torcida/types'
import { salvarPeriodicidadesOnboarding } from '@/app/admin/(plataforma)/configuracoes/actions'
import { runPersistAction } from '@/lib/toast-action'
import { AppFormDrawer } from '@/components/ui/app-form-drawer'
import { AdminPlanoForm } from './admin-plano-form'

export type OfertaOnboardingLinha = {
  periodicidade: string
  membrosCount: number
  plano: { id: string; nome: string; valorLabel: string; ativo: boolean } | null
}

export function AdminOfertaOnboarding({
  periodicidadesGravadas,
  linhas,
  podeGerir,
}: {
  periodicidadesGravadas: string[]
  linhas: OfertaOnboardingLinha[]
  podeGerir: boolean
}) {
  const iniciais = resolverPeriodicidadesOnboarding(periodicidadesGravadas)
  const [selecionadas, setSelecionadas] = useState<string[]>([...iniciais])
  const [cicloDrawer, setCicloDrawer] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fecharDrawer = useCallback(() => setCicloDrawer(null), [])
  const todas = Object.keys(PERIODICIDADE_PLANO_LABEL)
  const usandoFallback = periodicidadesGravadas.length === 0
  const cicloDrawerParsed = PeriodicidadePlanoSchema.safeParse(cicloDrawer)
  const cicloDrawerOk = cicloDrawerParsed.success ? cicloDrawerParsed.data : null

  function toggle(p: string) {
    setSelecionadas((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  function salvar() {
    const fd = new FormData()
    for (const p of selecionadas) fd.append('periodicidades', p)
    startTransition(async () => {
      await runPersistAction(() => salvarPeriodicidadesOnboarding(fd), {
        success: 'Oferta do onboarding atualizada.',
      })
    })
  }

  const dirty =
    selecionadas.length !== iniciais.length ||
    selecionadas.some((p) => !iniciais.includes(p as (typeof iniciais)[number]))

  return (
    <section className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div>
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Oferta no onboarding
        </h2>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Ciclos que aparecem em «Já sou sócio». Com valor cadastrado, o wizard
          mostra o nome do plano e vincula o sócio a ele.
          {usandoFallback
            ? ' Esta torcida ainda não gravou a oferta — o sistema usa quadrimensal e anual.'
            : null}
        </p>
      </div>

      <ul className="space-y-2">
        {todas.map((p) => {
          if (!PeriodicidadePlanoSchema.safeParse(p).success) return null
          const linha = linhas.find((l) => l.periodicidade === p)
          const meses = PERIODICIDADE_PLANO_MESES[p as keyof typeof PERIODICIDADE_PLANO_MESES]
          const oferecida = selecionadas.includes(p)
          return (
            <li
              key={p}
              className="flex flex-col gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <label className="flex min-w-0 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={oferecida}
                  disabled={!podeGerir || pending}
                  onChange={() => toggle(p)}
                  className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                    {PERIODICIDADE_PLANO_LABEL[p as keyof typeof PERIODICIDADE_PLANO_LABEL]}
                  </span>
                  <span className="block text-xs text-[rgb(var(--foreground-muted))]">
                    {meses == null ? 'Sem ciclo de renovação' : `Validade: +${meses} ${meses === 1 ? 'mês' : 'meses'}`}
                    {linha && linha.membrosCount > 0
                      ? ` · ${linha.membrosCount} sócio(s) neste ciclo`
                      : ''}
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {linha?.plano ? (
                  <>
                    <span className="text-sm text-[rgb(var(--foreground))]">
                      {linha.plano.nome}
                      <span className="ml-1 font-mono text-xs text-[rgb(var(--foreground-muted))]">
                        {linha.plano.valorLabel}
                      </span>
                    </span>
                    {podeGerir ? (
                      <Link
                        href={`/admin/financeiro/planos/novo?edit=${linha.plano.id}`}
                        className="app-touch-line text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                      >
                        Editar
                      </Link>
                    ) : null}
                  </>
                ) : oferecida && podeGerir ? (
                  <button
                    type="button"
                    onClick={() => setCicloDrawer(p)}
                    className="app-touch-line text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                  >
                    Cadastrar valor
                  </button>
                ) : oferecida ? (
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">
                    Sem valor cadastrado
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {podeGerir ? (
        <button
          type="button"
          disabled={pending || !dirty || selecionadas.length === 0}
          onClick={salvar}
          className="rounded-lg bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-primary-on disabled:opacity-50"
        >
          {pending ? 'Salvando…' : 'Salvar oferta do onboarding'}
        </button>
      ) : null}

      <AppFormDrawer
        open={Boolean(cicloDrawerOk)}
        onClose={fecharDrawer}
        title={
          cicloDrawerOk
            ? `Cadastrar valor · ${PERIODICIDADE_PLANO_LABEL[cicloDrawerOk]}`
            : 'Cadastrar valor'
        }
        width="lg"
      >
        {cicloDrawerOk ? (
          <>
            <p className="mb-4 text-sm text-[rgb(var(--foreground-muted))]">
              O ciclo já está na oferta. Informe o valor oficial — o wizard mostra
              este nome e vincula o sócio ao plano.
            </p>
            <AdminPlanoForm
              key={cicloDrawerOk}
              variant="drawer"
              lockPeriodicidade
              onDismiss={fecharDrawer}
              initial={{
                nome: PERIODICIDADE_PLANO_LABEL[cicloDrawerOk],
                descricao: null,
                periodicidade: cicloDrawerOk,
                beneficios: null,
                ativo: true,
                oferecerOnboarding: true,
              }}
            />
          </>
        ) : null}
      </AppFormDrawer>
    </section>
  )
}
