'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, BadgeCheck } from 'lucide-react'
import { toast } from '@torcida/ui/services/toast'
import { mensagemSemLiderancaUnidade } from '@torcida/types/associe-se'
import { TorcidaOnboardingCard } from '@/components/onboarding/torcida-onboarding-card'
import { UnidadeOnboardingCard } from '@/components/onboarding/unidade-onboarding-card'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import type { AssocieSePagina, TorcidaAssocieSe } from '@/lib/associe-se'
import { AppButton } from '@/components/ui/button'
import { SearchFilterInput, type ReactiveSearchOption } from '@/components/ui/reactive-search'

type Props = {
  pagina: AssocieSePagina
  /** Deep-link de `/portal/associe-se?torcida=` — não trava a escolha. */
  torcidaInicialId?: string | null
}

function hrefFicha(torcidaId: string, sedeId: string | null): string {
  const params = new URLSearchParams()
  params.set('origem', 'associe-se')
  params.set('torcida', torcidaId)
  if (sedeId) params.set('sede', sedeId)
  return `/onboarding?${params.toString()}`
}

export function AssocieSeExplorer({ pagina, torcidaInicialId = null }: Props) {
  const router = useRouter()
  const chaveInicial = pagina.torcidaTravadaId ?? torcidaInicialId
  const [torcidaId, setTorcidaId] = useState<string | null>(chaveInicial)
  const [chaveSincronizada, setChaveSincronizada] = useState(chaveInicial)
  if (chaveInicial !== chaveSincronizada) {
    setChaveSincronizada(chaveInicial)
    setTorcidaId(chaveInicial)
  }

  const torcida: TorcidaAssocieSe | null =
    pagina.torcidas.find((t) => t.id === torcidaId) ?? null

  const nomeClube = pagina.clube.apelido || pagina.clube.nome
  const soVitrine = !pagina.podeAssociar
  const podeRecrutarEsta =
    Boolean(torcida) && pagina.podeAssociar && Boolean(torcida?.temLideranca)
  const [filtro, setFiltro] = useState('')
  const q = filtro.trim().toLowerCase()
  const sugestoesTorcidas = useMemo((): ReactiveSearchOption[] => {
    return pagina.torcidas.map((t) => ({
      id: t.id,
      label: t.nome,
      sublabel: t.temLideranca ? null : 'Sem liderança no portal',
      searchText: t.nome,
      leading: (
        <EscudoClube nome={t.nome} escudoUrl={pagina.clube.escudoUrl} size="xs" />
      ),
    }))
  }, [pagina.torcidas, pagina.clube.escudoUrl])
  const torcidasVisiveis = useMemo(() => {
    if (!q) return pagina.torcidas
    return pagina.torcidas.filter((t) => t.nome.toLowerCase().includes(q))
  }, [pagina.torcidas, q])

  function escolherUnidade(sedeId: string | null) {
    if (!torcida) return
    if (!torcida.temLideranca) {
      const sede = sedeId ? torcida.sedes.find((s) => s.id === sedeId) : null
      toast.info('Associação indisponível', mensagemSemLiderancaUnidade(sede?.tipo), {
        duration: 7000,
      })
      return
    }
    if (!pagina.podeAssociar) return
    router.push(hrefFicha(torcida.id, sedeId))
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start gap-4">
        <EscudoClube
          nome={nomeClube}
          apelido={pagina.clube.apelido}
          escudoUrl={pagina.clube.escudoUrl}
          size="lg"
          priority
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
            {nomeClube}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[rgb(var(--foreground))] sm:text-3xl">
            {soVitrine ? 'Torcidas do seu clube' : 'Associe-se'}
          </h1>
          <p className="mt-1.5 max-w-prose text-sm text-[rgb(var(--foreground-muted))]">
            {soVitrine
              ? 'Só visualização — você já tem uma torcida. Entrar em outro canal continua sendo pelo convite da diretoria.'
              : torcida
                ? `Escolha a unidade da ${torcida.nome}. O pedido vai para a torcida e para a unidade.`
                : `Escolha uma organizada do ${nomeClube}. Depois você vê as unidades e envia um único pedido de associação.`}
          </p>
        </div>
      </header>

      {pagina.aviso ? (
        <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 text-sm text-[rgb(var(--foreground))]">
          {pagina.aviso}
        </p>
      ) : null}

      {!torcida ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              1 · Organizadas do {nomeClube}
              <span className="ml-2 font-normal text-[rgb(var(--foreground-muted))]">
                {pagina.torcidas.length}
              </span>
            </h2>
            {pagina.torcidas.length > 4 ? (
              <SearchFilterInput
                className="w-full max-w-xs"
                value={filtro}
                onChange={setFiltro}
                placeholder="Buscar organizada…"
                ariaLabel="Buscar organizada"
                suggestions={sugestoesTorcidas}
                onSelectSuggestion={(item) => setFiltro(item.label)}
                minChars={1}
              />
            ) : null}
          </div>
          {pagina.torcidas.length === 0 ? (
            <MotionEmptyState
              title="Nenhuma organizada neste clube"
              description="Ainda não há torcida com portal neste clube."
            />
          ) : torcidasVisiveis.length === 0 ? (
            <MotionEmptyState
              title="Nenhuma organizada com esse nome"
              description="Tente outro termo ou limpe a busca."
            />
          ) : (
            <>
              {torcidasVisiveis.some((t) => !t.temLideranca) ? (
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  Sem presidente no portal: dá para ver as unidades; o pedido só abre quando a
                  liderança estiver associada.
                </p>
              ) : null}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {torcidasVisiveis.map((t, i) => (
                  <li key={t.id}>
                    <TorcidaOnboardingCard
                      torcida={t}
                      onEscolher={(escolhida) => setTorcidaId(escolhida.id)}
                      priority={i < 6}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              2 · Unidades da {torcida.nome}
            </h2>
            {!pagina.torcidaTravadaId ? (
              <AppButton
                variant="none"
                icon={ArrowLeft}
                type="button"
                onClick={() => {
                  setTorcidaId(null)
                  router.replace('/portal/associe-se')
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Trocar torcida
              </AppButton>
            ) : null}
          </div>
          {torcida.sedes.length === 0 ? (
            <MotionEmptyState
              title="Nenhuma unidade listada"
              description={
                podeRecrutarEsta
                  ? 'Você ainda pode enviar o pedido para a Sede desta torcida.'
                  : 'Esta organizada ainda não publicou unidades.'
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {torcida.sedes.map((sede, i) => (
                <li key={sede.id}>
                  <UnidadeOnboardingCard
                    sede={{ ...sede, distanciaKm: null }}
                    selecionada={false}
                    onSelecionar={(id) => escolherUnidade(id)}
                    compact
                    priority={i < 3}
                  />
                </li>
              ))}
            </ul>
          )}
          {podeRecrutarEsta && torcida.sedes.length <= 1 ? (
            <button
              type="button"
              onClick={() => escolherUnidade(torcida.sedes[0]?.id ?? null)}
              className="app-action inline-flex w-fit items-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--color-primary-on))]"
            >
              {torcida.sedes.length === 1 ? (
                <>
                  Associar-me nesta unidade
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Enviar pedido para a Sede
                  <BadgeCheck className="h-4 w-4" />
                </>
              )}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
