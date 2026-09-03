'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Globe2 } from 'lucide-react'
import { MapaBrasilEstados } from '@/components/onboarding/mapa-brasil-estados'
import { SearchFilterInput } from '@/components/ui/reactive-search'
import { TorcidaOnboardingCard } from '@/components/onboarding/torcida-onboarding-card'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { buscarAfiliacoes } from '@/app/onboarding/actions'
import { listarTorcidasVitrineNacional } from '@/app/portal/mapa-brasil/actions'
import type { AfiliacaoOnboarding, RegiaoOnboarding, TorcidaOnboarding } from '@/lib/onboarding'
import { AppButton } from '@/components/ui/button'

type Props = {
  afiliacoesIniciais: AfiliacaoOnboarding[]
  regioes: RegiaoOnboarding[]
  clubeVinculadoId: string | null
  clubeVinculadoNome: string | null
  podeAssociar: boolean
}

export function MapaBrasilExplorer({
  afiliacoesIniciais,
  regioes,
  clubeVinculadoId,
  clubeVinculadoNome,
  podeAssociar,
}: Props) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [ufFiltro, setUfFiltro] = useState('')
  const [lista, setLista] = useState(afiliacoesIniciais)
  const [clube, setClube] = useState<AfiliacaoOnboarding | null>(null)
  const [torcidas, setTorcidas] = useState<TorcidaOnboarding[] | null>(null)
  const [buscando, startBusca] = useTransition()
  const [carregandoTorcidas, startTorcidas] = useTransition()

  function recarregar(valor: string, uf: string) {
    startBusca(async () => {
      const res = await buscarAfiliacoes(valor || undefined, uf || undefined)
      setLista(res)
    })
  }

  function onBusca(valor: string) {
    setBusca(valor)
    if (valor.trim()) {
      setUfFiltro('')
      recarregar(valor, '')
      return
    }
    recarregar('', ufFiltro)
  }

  function onUfFiltro(uf: string) {
    setUfFiltro(uf)
    if (!busca.trim()) recarregar('', uf)
  }

  function selecionarClube(a: AfiliacaoOnboarding) {
    setClube(a)
    setTorcidas(null)
    startTorcidas(async () => {
      const listaTorcidas = await listarTorcidasVitrineNacional(a.id)
      setTorcidas(listaTorcidas)
    })
  }

  function voltarAoMapa() {
    setClube(null)
    setTorcidas(null)
  }

  const doProprioClube = Boolean(clube && clubeVinculadoId && clube.id === clubeVinculadoId)
  const nomeClube = clube?.apelido || clube?.nome

  function abrirTorcida(t: TorcidaOnboarding) {
    if (!doProprioClube) return
    router.push(`/portal/associe-se?torcida=${encodeURIComponent(t.id)}`)
  }

  if (clube) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <AppButton
            variant="none"
            icon={ArrowLeft}
            type="button"
            onClick={voltarAoMapa}
            className="app-action inline-flex w-fit items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Voltar ao mapa
          </AppButton>

          <header className="flex flex-wrap items-start gap-3">
            <EscudoClube
              nome={nomeClube ?? clube.nome}
              apelido={clube.apelido}
              escudoUrl={clube.escudoUrl}
              size="lg"
              priority
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                    {clube.nome}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight text-[rgb(var(--foreground))] sm:text-3xl">
                    Organizadas do {nomeClube}
                  </h1>
                  {!doProprioClube ? (
                    <p className="mt-1.5 max-w-prose text-sm text-[rgb(var(--foreground-muted))]">
                      Só visualização. Associação fica no {clubeVinculadoNome ?? 'seu clube'}.
                    </p>
                  ) : (
                    <p className="mt-1.5 max-w-prose text-sm text-[rgb(var(--foreground-muted))]">
                      Organizadas com portal neste clube.
                    </p>
                  )}
                </div>
                {doProprioClube && podeAssociar ? (
                  <Link
                    href="/portal/associe-se"
                    className="app-action inline-flex rounded-xl bg-[rgb(var(--color-primary))] px-3 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))]"
                  >
                    Associe-se neste clube
                  </Link>
                ) : null}
              </div>
            </div>
          </header>
        </div>

        {carregandoTorcidas || torcidas == null ? (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Carregando torcidas…</p>
        ) : torcidas.length === 0 ? (
          <MotionEmptyState
            title="Nenhuma organizada neste clube"
            description="Ainda não há torcida com portal cadastrado aqui."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {torcidas.map((t, i) => (
              <li key={t.id}>
                <TorcidaOnboardingCard
                  torcida={t}
                  onEscolher={abrirTorcida}
                  disabled={!doProprioClube}
                  priority={i < 6}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start gap-3">
        <Globe2 className="mt-1 h-7 w-7 text-[rgb(var(--color-primary-fg))]" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--foreground))] sm:text-3xl">
            Ver no Brasil
          </h1>
          <p className="mt-1.5 max-w-prose text-sm text-[rgb(var(--foreground-muted))]">
            Mapa do país: clubes e organizadas. Pedido de associação só no clube
            do seu onboarding
            {clubeVinculadoNome ? ` (${clubeVinculadoNome})` : ''} — um único fluxo,
            uma torcida.
          </p>
        </div>
      </header>

      <SearchFilterInput
        value={busca}
        onChange={onBusca}
        placeholder="Buscar clube por nome..."
        ariaLabel="Buscar clube"
        exibirDropdown={false}
        loading={buscando}
        onClear={() => onBusca('')}
      />

      <MapaBrasilEstados
        afiliacoes={afiliacoesIniciais}
        regioes={regioes}
        ufSelecionada={ufFiltro}
        onUfSelecionar={onUfFiltro}
        onSelecionarClube={selecionarClube}
        busca={busca}
        resultadosBusca={lista}
        buscando={buscando}
        mapaCompleto
        onLimparPainel={() => {
          setBusca('')
          recarregar('', ufFiltro)
        }}
      />
    </div>
  )
}
