'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Shield, Search, ArrowLeft, ArrowRight, Check, Upload, Loader2, Camera, Mail, LocateFixed, MapPin, FileText, X, ExternalLink } from 'lucide-react'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { MapaBrasilEstados } from '@/components/onboarding/mapa-brasil-estados'
import { TorcidaOnboardingCard } from '@/components/onboarding/torcida-onboarding-card'
import { UnidadeOnboardingCard } from '@/components/onboarding/unidade-onboarding-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { Input, Select } from '@torcida/ui'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import {
  routePage,
  springGentle,
  springSnappy,
} from '@/lib/motion-presets'
import {
  NOME_UF,
} from '@/lib/regioes-brasil'
import {
  salvarClubeRegiao,
  concluirComoTorcedor,
  solicitarVinculo,
  buscarAfiliacoes,
  buscarTorcidas,
  buscarDepartamentos,
  buscarCidadesDaUf,
  registrarInteresseUnidade,
} from './actions'
import { ComboboxCidade } from './combobox-cidade'
import { agruparSedesPorRegiao, normalizarTexto, type SedeOnboardingComDistancia } from '@/lib/onboarding-unidade'
import {
  buildGoogleMapsUrl,
  enrichSedesComCoordenadas,
  forwardGeocodeRegion,
  reverseGeocodeRegion,
  type GoogleMapsRegion,
} from '@/lib/google-maps'
import type {
  AfiliacaoOnboarding,
  TorcidaOnboarding,
  DepartamentoOnboarding,
  SedeOnboarding,
  RegiaoOnboarding,
} from '@/lib/onboarding'
import { useUnsavedChanges } from '@/lib/unsaved-changes'

type Passo = 'clube' | 'regiao' | 'torcida' | 'unidade' | 'vinculo' | 'concluindo'

const PASSOS_VISIVEIS: { key: Passo; label: string }[] = [
  { key: 'clube', label: 'Clube' },
  { key: 'regiao', label: 'Região' },
  { key: 'torcida', label: 'Torcida' },
  { key: 'unidade', label: 'Unidade' },
  { key: 'vinculo', label: 'Vínculo' },
]

type Props = {
  afiliacoesIniciais: AfiliacaoOnboarding[]
  regioes: RegiaoOnboarding[]
  ufs: string[]
  nomeInicial: string
}

export function OnboardingWizard({ afiliacoesIniciais, regioes, ufs, nomeInicial }: Props) {
  const [passo, setPasso] = useState<Passo>('clube')
  const [slideDir, setSlideDir] = useState(1)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function irPara(novo: Passo, dir = 1) {
    setSlideDir(dir)
    setPasso(novo)
  }

  // Seleções acumuladas
  const [clube, setClube] = useState<AfiliacaoOnboarding | null>(null)
  const [uf, setUf] = useState('')
  const [cidade, setCidade] = useState('')
  const [localizacaoPrecisa, setLocalizacaoPrecisa] = useState<GoogleMapsRegion | null>(null)
  const [torcida, setTorcida] = useState<TorcidaOnboarding | null>(null)
  const [unidadeId, setUnidadeId] = useState<string | null>(null)
  const [unidadeNaoListada, setUnidadeNaoListada] = useState(false)

  const indiceAtual = PASSOS_VISIVEIS.findIndex((p) => p.key === passo)

  const onboardingChanges = useMemo(() => {
    if (passo === 'concluindo') return []
    const list: string[] = []
    if (clube) list.push(`Clube: ${clube.nome}`)
    if (uf || cidade) list.push(`Região: ${[cidade, uf].filter(Boolean).join('/')}`)
    if (torcida) list.push(`Torcida: ${torcida.nome}`)
    if (unidadeId || unidadeNaoListada) list.push('Unidade selecionada')
    if (passo === 'vinculo') list.push('Vínculo em andamento')
    return list
  }, [passo, clube, uf, cidade, torcida, unidadeId, unidadeNaoListada])

  useUnsavedChanges({
    id: 'onboarding-wizard',
    title: 'Onboarding',
    isDirty: onboardingChanges.length > 0,
    changes: onboardingChanges,
  })

  function limparErro() {
    setErro(null)
  }

  // ── Passo 1 → 2: salva clube (+ região se já preenchida depois) ──────────────
  function selecionarClube(afiliacao: AfiliacaoOnboarding) {
    setClube(afiliacao)
    limparErro()
    irPara('regiao', 1)
  }

  // ── Passo 2 → 3: persiste clube + região, carrega torcidas ───────────────────
  const [torcidas, setTorcidas] = useState<TorcidaOnboarding[] | null>(null)
  function avancarDaRegiao() {
    if (!clube) return
    startTransition(async () => {
      const res = await salvarClubeRegiao({ afiliacaoId: clube.id, uf, cidade })
      if (res.message || res.errors) {
        setErro(res.message ?? 'Não foi possível salvar. Tente novamente.')
        return
      }
      const lista = await buscarTorcidas(clube.id)
      setTorcidas(lista)
      limparErro()
      irPara('torcida', 1)
    })
  }

  // ── Passo 3: escolher torcida ou seguir como torcedor global ─────────────────
  function escolherTorcida(t: TorcidaOnboarding) {
    setTorcida(t)
    setUnidadeId(null)
    setUnidadeNaoListada(false)
    limparErro()
    irPara('unidade', 1)
  }

  function confirmarUnidade(sedeId: string | null, naoListada: boolean) {
    setUnidadeId(sedeId)
    setUnidadeNaoListada(naoListada)
    limparErro()
    irPara('vinculo', 1)
  }

  function seguirComoTorcedorGlobal() {
    setErro(null)
    irPara('concluindo', 1)
    startTransition(async () => {
      const res = await concluirComoTorcedor()
      // Se retornou (não redirecionou), houve erro.
      if (res?.message) {
        setErro(res.message)
        irPara('torcida', -1)
      }
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Cabeçalho + progresso */}
      <header className="mb-8">
        <div className="mb-6 flex items-center gap-2 text-[rgb(var(--color-primary))]">
          <Shield className="h-6 w-6" />
          <span className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Bem-vindo
          </span>
        </div>
        <ProgressBar indiceAtual={indiceAtual === -1 ? PASSOS_VISIVEIS.length : indiceAtual} />
      </header>

      {erro && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {erro}
        </div>
      )}

      <div className="flex-1">
        <AnimatePresence mode="wait" custom={slideDir}>
          {passo === 'clube' && (
            <m.div
              key="clube"
              custom={slideDir}
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
            >
              <PassoClube
                afiliacoesIniciais={afiliacoesIniciais}
                regioes={regioes}
                onSelecionar={selecionarClube}
              />
            </m.div>
          )}

          {passo === 'regiao' && (
            <m.div
              key="regiao"
              custom={slideDir}
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
            >
              <PassoRegiao
                clube={clube}
                ufs={ufs}
                uf={uf}
                cidade={cidade}
                onUf={(v) => {
                  // Trocar de estado invalida a cidade (só vale seleção da lista da UF).
                  setUf(v)
                  setCidade('')
                  setLocalizacaoPrecisa(null)
                }}
                onCidade={(v) => {
                  setCidade(v)
                  setLocalizacaoPrecisa(null)
                }}
                onLocalizacao={(regiao) => {
                  setUf(regiao.estado)
                  setCidade(regiao.cidade)
                  setLocalizacaoPrecisa(regiao)
                }}
                pending={pending}
                onVoltar={() => irPara('clube', -1)}
                onContinuar={avancarDaRegiao}
              />
            </m.div>
          )}

          {passo === 'torcida' && (
            <m.div
              key="torcida"
              custom={slideDir}
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
            >
              <PassoTorcida
                clube={clube}
                torcidas={torcidas ?? []}
                pending={pending}
                onEscolher={escolherTorcida}
                onTorcedorGlobal={seguirComoTorcedorGlobal}
                onVoltar={() => irPara('regiao', -1)}
              />
            </m.div>
          )}

          {passo === 'unidade' && torcida && (
            <m.div
              key="unidade"
              custom={slideDir}
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
            >
              <PassoUnidade
                torcida={torcida}
                uf={uf}
                cidade={cidade}
                regiaoLabel={[cidade.trim(), uf].filter(Boolean).join(' - ') || undefined}
                localizacao={localizacaoPrecisa ?? undefined}
                pending={pending}
                onConfirmar={confirmarUnidade}
                onVoltar={() => irPara('torcida', -1)}
                onErro={setErro}
              />
            </m.div>
          )}

          {passo === 'vinculo' && torcida && (
            <m.div
              key="vinculo"
              custom={slideDir}
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
            >
              <PassoVinculo
                clube={clube}
                torcida={torcida}
                nomeInicial={nomeInicial}
                regiao={[cidade.trim(), uf].filter(Boolean).join(' - ') || undefined}
                unidadeId={unidadeId}
                unidadeNaoListada={unidadeNaoListada}
                onVoltar={() => irPara('unidade', -1)}
                onErro={setErro}
              />
            </m.div>
          )}

          {passo === 'concluindo' && (
            <m.div
              key="concluindo"
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
              className="flex flex-col items-center justify-center gap-3 py-20 text-center text-[rgb(var(--foreground-muted))]"
            >
              <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-primary))]" />
              <p>Concluindo seu cadastro...</p>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Barra de progresso ─────────────────────────────────────────────────────────

function ProgressBar({ indiceAtual }: { indiceAtual: number }) {
  return (
    <ol className="flex items-center gap-2">
      {PASSOS_VISIVEIS.map((p, i) => {
        const feito = i < indiceAtual
        const atual = i === indiceAtual
        return (
          <li key={p.key} className="relative flex flex-1 flex-col gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border))]">
              <m.div
                className="h-full rounded-full bg-[rgb(var(--color-primary))]"
                initial={false}
                animate={{ width: feito || atual ? '100%' : '0%' }}
                transition={springSnappy}
              />
            </div>
            <span
              className={`text-[11px] font-medium ${
                atual
                  ? 'text-[rgb(var(--foreground))]'
                  : 'text-[rgb(var(--foreground-muted))]'
              }`}
            >
              {p.label}
            </span>
            {atual && (
              <m.span
                layoutId="onboarding-step-indicator"
                className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-[rgb(var(--color-primary))]"
                transition={springSnappy}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ─── Passo 1: Clube ─────────────────────────────────────────────────────────────

function PassoClube({
  afiliacoesIniciais,
  regioes,
  onSelecionar,
}: {
  afiliacoesIniciais: AfiliacaoOnboarding[]
  regioes: RegiaoOnboarding[]
  onSelecionar: (a: AfiliacaoOnboarding) => void
}) {
  const [busca, setBusca] = useState('')
  const [ufFiltro, setUfFiltro] = useState('')
  const [lista, setLista] = useState(afiliacoesIniciais)
  const [buscando, startBusca] = useTransition()

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
    if (uf) setBusca('')
    recarregar('', uf)
  }

  function limparPainelMapa() {
    setBusca('')
    setUfFiltro('')
    recarregar('', '')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--foreground))] sm:text-3xl">
        Qual clube você torce?
      </h1>
      <p className="mt-1.5 max-w-lg text-sm text-[rgb(var(--foreground-muted))]">
        Comece pelo mapa — cada estado revela os clubes da região. Ou busque direto pelo nome.
      </p>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <Input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar clube por nome..."
          className="pl-9 pr-9"
          aria-label="Buscar clube"
        />
        {busca && (
          <button
            type="button"
            onClick={() => onBusca('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--surface-raised))] hover:text-[rgb(var(--foreground))]"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {regioes.length > 0 && (
        <div className="mt-5">
          <MapaBrasilEstados
            afiliacoes={afiliacoesIniciais}
            regioes={regioes}
            ufSelecionada={ufFiltro}
            onUfSelecionar={onUfFiltro}
            onSelecionarClube={onSelecionar}
            busca={busca}
            resultadosBusca={lista}
            buscando={buscando}
            onLimparPainel={limparPainelMapa}
          />
        </div>
      )}
    </div>
  )
}

// ─── Passo 2: Região ────────────────────────────────────────────────────────────

function PassoRegiao({
  clube,
  ufs,
  uf,
  cidade,
  onUf,
  onCidade,
  onLocalizacao,
  pending,
  onVoltar,
  onContinuar,
}: {
  clube: AfiliacaoOnboarding | null
  ufs: string[]
  uf: string
  cidade: string
  onUf: (v: string) => void
  onCidade: (v: string) => void
  onLocalizacao: (regiao: GoogleMapsRegion) => void
  pending: boolean
  onVoltar: () => void
  onContinuar: () => void
}) {
  const [localizando, setLocalizando] = useState(false)
  const [erroLocalizacao, setErroLocalizacao] = useState<string | null>(null)
  const geocodeSeq = useRef(0)

  function selecionarCidade(cidadeSel: string) {
    onCidade(cidadeSel)
    if (!cidadeSel.trim() || !uf) return
    const seq = ++geocodeSeq.current
    void forwardGeocodeRegion(cidadeSel, uf).then((regiao) => {
      if (seq !== geocodeSeq.current || !regiao) return
      onLocalizacao(regiao)
    })
  }

  function usarLocalizacao() {
    setErroLocalizacao(null)
    if (!navigator.geolocation) {
      setErroLocalizacao('Seu navegador não permite detectar localização automaticamente.')
      return
    }

    setLocalizando(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const regiao = await reverseGeocodeRegion({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        if (!regiao) {
          setLocalizando(false)
          setErroLocalizacao('Não conseguimos resolver sua cidade pelo Google Maps. Preencha manualmente.')
          return
        }
        // Só aceita a cidade se ela existir na lista de municípios do IBGE da UF.
        const cidadesDaUf = await buscarCidadesDaUf(regiao.estado)
        const alvo = normalizarTexto(regiao.cidade)
        const nomeCanonico = cidadesDaUf.find((c) => normalizarTexto(c) === alvo)
        setLocalizando(false)
        if (nomeCanonico) {
          onLocalizacao({ ...regiao, cidade: nomeCanonico })
        } else {
          onUf(regiao.estado)
          setErroLocalizacao(
            `Detectamos ${regiao.estado}, mas não conseguimos confirmar sua cidade automaticamente — selecione na lista abaixo.`,
          )
        }
      },
      () => {
        setLocalizando(false)
        setErroLocalizacao('Permissão negada ou localização indisponível. Você ainda pode preencher manualmente.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }

  return (
    <div>
      <BotaoVoltar onClick={onVoltar} disabled={pending} />
      <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">De onde você torce?</h1>
      <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
        Sua região ajuda a conectar você a torcedores e eventos por perto
        {clube ? ` do ${clube.apelido || clube.nome}` : ''}.
      </p>

      <div className="mt-5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-[rgb(var(--color-primary))]">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                Recomendações por proximidade
              </p>
              <p className="mt-0.5 max-w-xl text-xs text-[rgb(var(--foreground-muted))]">
                Use sua localização ou escolha a cidade para priorizar subsedes e pontos de
                encontro próximos, com distância em km.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={usarLocalizacao}
            disabled={pending || localizando}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
          >
            {localizando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
            {localizando ? 'Localizando...' : 'Usar minha localização'}
          </button>
        </div>
        {erroLocalizacao && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{erroLocalizacao}</p>
        )}
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="uf" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Estado
          </label>
          <Select
            id="uf"
            value={uf}
            onChange={(e) => {
              geocodeSeq.current += 1
              onUf(e.target.value)
            }}
          >
            <option value="">Selecione o estado</option>
            {ufs.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="cidade" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Cidade
          </label>
          <ComboboxCidade uf={uf} value={cidade} onChange={selecionarCidade} disabled={pending} />
        </div>
      </div>

      <div className="mt-8">
        <BotaoPrimario
          onClick={onContinuar}
          pending={pending}
          disabled={!uf || !cidade}
          label="Continuar"
        />
      </div>
    </div>
  )
}

// ─── Passo 3: Torcida ───────────────────────────────────────────────────────────

function PassoTorcida({
  clube,
  torcidas,
  pending,
  onEscolher,
  onTorcedorGlobal,
  onVoltar,
}: {
  clube: AfiliacaoOnboarding | null
  torcidas: TorcidaOnboarding[]
  pending: boolean
  onEscolher: (t: TorcidaOnboarding) => void
  onTorcedorGlobal: () => void
  onVoltar: () => void
}) {
  const nomeClube = clube?.apelido || clube?.nome || 'seu clube'
  return (
    <div>
      <BotaoVoltar onClick={onVoltar} disabled={pending} />
      <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--foreground))] text-balance sm:text-3xl">
        Você pertence a alguma organizada?
      </h1>
      <p className="mt-1.5 max-w-prose text-sm text-[rgb(var(--foreground-muted))]">
        Comece como torcedor do {nomeClube} ou vincule-se a uma torcida na plataforma.
      </p>

      {/* Caminho padrão: só torcedor — sempre primeiro */}
      <button
        type="button"
        onClick={onTorcedorGlobal}
        disabled={pending}
        className="mt-6 flex w-full items-center gap-4 rounded-2xl border-2 border-[rgb(var(--color-primary))]/35 bg-[rgb(var(--color-primary))]/5 p-4 text-left transition-[border-color,background-color,box-shadow] duration-150 hover:border-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary))]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:opacity-50 sm:gap-5 sm:p-5"
      >
        {pending ? (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
            <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--foreground-muted))]" />
          </div>
        ) : (
          <EscudoClube
            nome={nomeClube}
            apelido={clube?.apelido}
            escudoUrl={clube?.escudoUrl}
            size="xl"
            shape="circle"
            priority
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary))]">
            Sem organizada
          </p>
          <p className="mt-0.5 text-base font-semibold text-[rgb(var(--foreground))] sm:text-lg">
            Sou só torcedor do {nomeClube}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
            Acesso à comunidade nacional — posts, novidades e conversa entre torcedores.
            Sem vínculo com torcida organizada.
          </p>
        </div>
        <ArrowRight className="hidden h-5 w-5 shrink-0 text-[rgb(var(--color-primary))] sm:block" />
      </button>

      {torcidas.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[rgb(var(--border))] p-8 text-center">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma torcida de {nomeClube} está na plataforma ainda.
          </p>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            Entre como torcedor acima e acompanhe a comunidade.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 flex items-center gap-3" role="separator">
            <div className="h-px flex-1 bg-[rgb(var(--border))]" />
            <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Ou escolha sua organizada
            </p>
            <div className="h-px flex-1 bg-[rgb(var(--border))]" />
          </div>

          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {torcidas.map((t, i) => (
              <li key={t.id}>
                <MotionReveal index={i} className="h-full">
                  <TorcidaOnboardingCard
                    torcida={t}
                    onEscolher={onEscolher}
                    disabled={pending}
                    priority={i < 4}
                  />
                </MotionReveal>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// ─── Passo 4: Unidade territorial (subsede / PDE) ─────────────────────────────

function PassoUnidade({
  torcida,
  uf,
  cidade,
  regiaoLabel,
  localizacao,
  pending,
  onConfirmar,
  onVoltar,
  onErro,
}: {
  torcida: TorcidaOnboarding
  uf: string
  cidade: string
  regiaoLabel?: string
  localizacao?: GoogleMapsRegion
  pending: boolean
  onConfirmar: (sedeId: string | null, naoListada: boolean) => void
  onVoltar: () => void
  onErro: (m: string | null) => void
}) {
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [modoNaoListada, setModoNaoListada] = useState(false)
  const [nomeUnidade, setNomeUnidade] = useState('')
  const [tipoUnidade, setTipoUnidade] = useState<'SUBSEDE' | 'PONTO_ENCONTRO'>('PONTO_ENCONTRO')
  const [cidadeUnidade, setCidadeUnidade] = useState(cidade)
  const [estadoUnidade, setEstadoUnidade] = useState(uf)
  const [enderecoUnidade, setEnderecoUnidade] = useState('')
  const [contatoNome, setContatoNome] = useState('')
  const [contatoEmail, setContatoEmail] = useState('')
  const [contatoTelefone, setContatoTelefone] = useState('')
  const [vinculo, setVinculo] = useState('')
  const [observacao, setObservacao] = useState('')
  const [provasUrls, setProvasUrls] = useState<string[]>([])
  const [uploadProvaPend, setUploadProvaPend] = useState(false)
  const [errosUnidade, setErrosUnidade] = useState<Record<string, string[]>>({})
  const [enviando, startEnvio] = useTransition()
  const [localizacaoEfetiva, setLocalizacaoEfetiva] = useState(localizacao)
  const [sedesResolvidas, setSedesResolvidas] = useState(torcida.sedes)

  // Garante coords mesmo se o usuário avançou antes do geocode da cidade terminar.
  useEffect(() => {
    if (localizacao) {
      setLocalizacaoEfetiva(localizacao)
      return
    }
    if (!cidade.trim() || !uf.trim()) return
    let ativo = true
    void forwardGeocodeRegion(cidade, uf).then((regiao) => {
      if (ativo && regiao) setLocalizacaoEfetiva(regiao)
    })
    return () => {
      ativo = false
    }
  }, [localizacao, cidade, uf])

  // Banco ainda pode estar sem lat/lng — geocodifica endereço/cidade no cliente.
  useEffect(() => {
    let ativo = true
    setSedesResolvidas(torcida.sedes)
    void enrichSedesComCoordenadas(torcida.sedes).then((sedes) => {
      if (ativo) setSedesResolvidas(sedes)
    })
    return () => {
      ativo = false
    }
  }, [torcida.sedes])

  const { recomendadas, outras } = agruparSedesPorRegiao(
    sedesResolvidas,
    uf,
    cidade,
    localizacaoEfetiva,
  )
  const temUnidades = sedesResolvidas.length > 0

  function selecionarUnidade(id: string) {
    setModoNaoListada(false)
    setSelecionada(id)
  }

  function avancarComUnidade() {
    if (!selecionada) {
      onErro('Selecione a subsede ou ponto de encontro onde você participa.')
      return
    }
    onConfirmar(selecionada, false)
  }

  function avancarSemListagem() {
    onErro(null)
    setErrosUnidade({})
    startEnvio(async () => {
      const res = await registrarInteresseUnidade({
        tenantId: torcida.id,
        regiao: regiaoLabel,
        nomeUnidade,
        tipoUnidade,
        cidade: cidadeUnidade,
        estado: estadoUnidade,
        endereco: enderecoUnidade || undefined,
        contatoNome,
        contatoEmail: contatoEmail || undefined,
        contatoTelefone: contatoTelefone || undefined,
        vinculo,
        provasUrls,
        observacao: observacao || undefined,
      })
      if (res.errors) {
        setErrosUnidade(res.errors)
        onErro('Confira os dados da unidade afiliada antes de continuar.')
        return
      }
      if (res.message || res.errors) {
        onErro(res.message ?? 'Não foi possível registrar seu interesse. Tente novamente.')
        return
      }
      if (res.emailHref) {
        window.location.href = res.emailHref
      }
      onConfirmar(null, true)
    })
  }

  async function anexarProvaUnidade(file: File | undefined) {
    if (!file) return
    if (provasUrls.length >= 5) {
      onErro('Envie no máximo 5 imagens de prova.')
      return
    }
    setUploadProvaPend(true)
    onErro(null)
    try {
      const url = await uploadMediaToCloudinary(file, undefined, 'cadastro', torcida.id)
      setProvasUrls((atuais) => [...atuais, url])
    } catch (err) {
      onErro(err instanceof Error ? err.message : 'Falha ao enviar a imagem da unidade.')
    } finally {
      setUploadProvaPend(false)
    }
  }

  return (
    <div className="pb-20">
      <BotaoVoltar onClick={onVoltar} disabled={pending || enviando} />
      <h1 className="text-xl font-bold text-balance text-[rgb(var(--foreground))] sm:text-2xl">
        Onde você participa na {torcida.nome}?
      </h1>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Escolha a sede, subsede ou PDE da sua região.
        </p>
        {regiaoLabel && (
          <span className="inline-flex items-center gap-1 rounded-md bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground))]">
            <MapPin className="h-3 w-3 text-[rgb(var(--color-primary))]" aria-hidden />
            {regiaoLabel}
          </span>
        )}
      </div>

      {!temUnidades ? (
        <div className="mt-4 rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-5 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Ainda não há unidades cadastradas para esta torcida. Solicite o cadastro abaixo.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {recomendadas.length > 0 && (
            <ListaUnidades
              titulo="Recomendadas"
              sedes={recomendadas}
              selecionada={selecionada}
              onSelecionar={selecionarUnidade}
              priorityCount={3}
            />
          )}
          {outras.length > 0 && (
            <ListaUnidades
              titulo="Outras unidades"
              sedes={outras}
              selecionada={selecionada}
              onSelecionar={selecionarUnidade}
            />
          )}
        </div>
      )}

      {/* Ação secundária sempre visível perto da lista — sem card grande até expandir */}
      {!modoNaoListada ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--border))] pt-3">
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Não encontrou sua unidade?
          </p>
          <button
            type="button"
            onClick={() => {
              setModoNaoListada(true)
              setSelecionada(null)
              onErro(null)
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary))] hover:underline"
          >
            <Mail className="h-3.5 w-3.5" />
            Solicitar cadastro
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))] text-[rgb(var(--color-primary))]">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                  Solicitar cadastro de unidade
                </p>
                <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                  Dados, contato e provas de credenciamento — enviamos para avaliação.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setModoNaoListada(false)
                onErro(null)
              }}
              className="shrink-0 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              Cancelar
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nome da unidade" obrigatorio erros={errosUnidade.nomeUnidade}>
                <Input
                  value={nomeUnidade}
                  onChange={(e) => setNomeUnidade(e.target.value)}
                  placeholder="Ex: Gaviões Praia Grande"
                />
              </Campo>
              <Campo label="Tipo" obrigatorio erros={errosUnidade.tipoUnidade}>
                <Select
                  value={tipoUnidade}
                  onChange={(e) => setTipoUnidade(e.target.value as 'SUBSEDE' | 'PONTO_ENCONTRO')}
                >
                  <option value="PONTO_ENCONTRO">Ponto de encontro / PDE</option>
                  <option value="SUBSEDE">Subsede</option>
                </Select>
              </Campo>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
              <Campo label="Cidade" obrigatorio erros={errosUnidade.cidade}>
                <Input
                  value={cidadeUnidade}
                  onChange={(e) => setCidadeUnidade(e.target.value)}
                  placeholder="Ex: Praia Grande"
                />
              </Campo>
              <Campo label="UF" obrigatorio erros={errosUnidade.estado}>
                <Input
                  value={estadoUnidade}
                  onChange={(e) => setEstadoUnidade(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                />
              </Campo>
            </div>

            <Campo label="Endereço ou ponto de referência" erros={errosUnidade.endereco}>
              <Input
                value={enderecoUnidade}
                onChange={(e) => setEnderecoUnidade(e.target.value)}
                placeholder="Rua, número, bairro ou local de encontro"
              />
            </Campo>

            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Seu nome" obrigatorio erros={errosUnidade.contatoNome}>
                <Input
                  value={contatoNome}
                  onChange={(e) => setContatoNome(e.target.value)}
                  placeholder="Responsável pelo envio"
                />
              </Campo>
              <Campo label="E-mail para retorno" erros={errosUnidade.contatoEmail}>
                <Input
                  type="email"
                  value={contatoEmail}
                  onChange={(e) => setContatoEmail(e.target.value)}
                  placeholder="voce@email.com"
                />
              </Campo>
              <Campo label="WhatsApp para retorno" erros={errosUnidade.contatoTelefone}>
                <Input
                  type="tel"
                  value={contatoTelefone}
                  onChange={(e) => setContatoTelefone(e.target.value)}
                  placeholder="(13) 99999-9999"
                />
              </Campo>
            </div>

            <Campo label="Como comprova o credenciamento?" obrigatorio erros={errosUnidade.vinculo}>
              <textarea
                value={vinculo}
                onChange={(e) => setVinculo(e.target.value)}
                rows={3}
                placeholder="Ex: vínculo com diretoria, responsável local, redes oficiais, autorização…"
                className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]"
              />
            </Campo>

            <Campo label="Observações" erros={errosUnidade.observacao}>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                placeholder="Horários, redes sociais, contato da liderança…"
                className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]"
              />
            </Campo>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Provas (até 5 imagens)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="unidade-provas-upload"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[rgb(var(--border))] px-3 py-2 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
                >
                  {uploadProvaPend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Anexar
                </label>
                <input
                  id="unidade-provas-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadProvaPend || provasUrls.length >= 5}
                  onChange={(e) => {
                    void anexarProvaUnidade(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                {provasUrls.length > 0 && (
                  <span className="text-xs text-emerald-600">
                    {provasUrls.length} anexada(s)
                  </span>
                )}
              </div>
              {provasUrls.length > 0 && (
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {provasUrls.map((url, index) => (
                    <li
                      key={url}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs text-[rgb(var(--foreground-muted))]"
                    >
                      <span className="truncate">Prova {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => setProvasUrls((atuais) => atuais.filter((item) => item !== url))}
                        className="text-[rgb(var(--foreground-muted))] hover:text-red-500"
                        aria-label={`Remover prova ${index + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
              Registramos a solicitação e abrimos um e-mail para os super admins com os dados e
              links das provas.
            </p>
            <BotaoPrimario
              onClick={avancarSemListagem}
              pending={enviando}
              disabled={uploadProvaPend}
              label="Enviar para avaliação"
            />
          </div>
        </div>
      )}

      {/* CTA sticky: Continuar permanece no viewport após a seleção */}
      {selecionada && !modoNaoListada && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[rgb(var(--border))] bg-[rgb(var(--background))]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
          <div className="app-container flex items-center justify-between gap-3 py-3">
            <p className="min-w-0 truncate text-xs text-[rgb(var(--foreground-muted))] sm:text-sm">
              Unidade selecionada — avance para o vínculo.
            </p>
            <BotaoPrimario onClick={avancarComUnidade} pending={pending} label="Continuar" />
          </div>
        </div>
      )}
    </div>
  )
}

function ListaUnidades({
  titulo,
  sedes,
  selecionada,
  onSelecionar,
  priorityCount = 0,
}: {
  titulo: string
  sedes: SedeOnboardingComDistancia[]
  selecionada: string | null
  onSelecionar: (id: string) => void
  /** Quantas imagens priorizar (LCP) no topo da lista. */
  priorityCount?: number
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {titulo}
        <span className="ml-1.5 font-normal tabular-nums text-[rgb(var(--foreground-muted))]/80">
          ({sedes.length})
        </span>
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {sedes.map((s, index) => (
          <li key={s.id}>
            <UnidadeOnboardingCard
              sede={s}
              selecionada={selecionada === s.id}
              onSelecionar={onSelecionar}
              priority={index < priorityCount}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Passo 5: Vínculo (torcedor da torcida ou sócio) ────────────────────────────

/** Máscara progressiva de telefone BR: (XX) XXXX-XXXX ou (XX) XXXXX-XXXX. */
function maskTelefone(raw: string): string {
  const digitos = raw.replace(/\D/g, '').slice(0, 11)
  if (digitos.length === 0) return ''
  if (digitos.length <= 2) return `(${digitos}`
  const ddd = digitos.slice(0, 2)
  const resto = digitos.slice(2)
  // 11 dígitos → celular (5+4); até 10 → fixo (4+4), formatando o que já foi digitado.
  const corte = digitos.length > 10 ? 5 : 4
  if (resto.length <= corte) return `(${ddd}) ${resto}`
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`
}

/** Máscara progressiva de CEP: 00000-000. */
function maskCep(raw: string): string {
  const digitos = raw.replace(/\D/g, '').slice(0, 8)
  if (digitos.length <= 5) return digitos
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`
}

function PassoVinculo({
  clube,
  torcida,
  nomeInicial,
  regiao,
  unidadeId,
  unidadeNaoListada,
  onVoltar,
  onErro,
}: {
  clube: AfiliacaoOnboarding | null
  torcida: TorcidaOnboarding
  nomeInicial: string
  regiao: string | undefined
  unidadeId: string | null
  unidadeNaoListada: boolean
  onVoltar: () => void
  onErro: (m: string | null) => void
}) {
  const [modo, setModo] = useState<'escolha' | 'socio'>('escolha')
  const [pending, startTransition] = useTransition()
  const [errosCampo, setErrosCampo] = useState<Record<string, string[]>>({})

  // Campos de sócio
  const [nome, setNome] = useState(nomeInicial)
  const [idade, setIdade] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cep, setCep] = useState('')
  const [numero, setNumero] = useState('')
  const [bloco, setBloco] = useState('')
  const [complemento, setComplemento] = useState('')
  const [numeroAssociado, setNumeroAssociado] = useState('')
  const [anosSocio, setAnosSocio] = useState('')
  const [departamentoId, setDepartamentoId] = useState('')
  const [imagemProva, setImagemProva] = useState<string | undefined>()
  const [uploadPend, setUploadPend] = useState(false)

  const [departamentos, setDepartamentos] = useState<DepartamentoOnboarding[] | null>(null)
  // Filtra residuais "Sócio"/"Torcedor" se ainda existirem no tenant (legado
  // de aprovações antigas) — tipo de membro não é departamento.
  const departamentosSelecionaveis =
    departamentos === null
      ? null
      : departamentos.filter((d) => d.nome !== 'Torcedor' && d.nome !== 'Sócio')

  const unidadeSelecionada = unidadeId
    ? torcida.sedes.find((s) => s.id === unidadeId)
    : null
  const unidadePendente =
    !unidadeNaoListada && torcida.sedes.length > 1 && !unidadeId

  const nomeClube = clube?.apelido?.trim() || clube?.nome || 'seu clube'

  function abrirSocio() {
    onErro(null)
    setModo('socio')
    if (departamentos === null) {
      startTransition(async () => {
        const deps = await buscarDepartamentos(torcida.id)
        setDepartamentos(deps)
      })
    }
  }

  function enviar(tipo: 'SOCIO' | 'TORCEDOR') {
    onErro(null)
    setErrosCampo({})
    if (unidadePendente) {
      onErro('Volte e selecione sua subsede ou ponto de encontro.')
      return
    }
    // Só o vínculo de sócio exige comprovação e os dados de associado — torcedor entra direto.
    if (tipo === 'SOCIO') {
      if (!imagemProva) {
        onErro('Envie uma foto da carteirinha ou comprovante de vínculo com a torcida.')
        return
      }
      if (!numeroAssociado) {
        onErro('Informe seu número de associado.')
        return
      }
      if (!anosSocio) {
        onErro('Informe há quantos anos é sócio da torcida.')
        return
      }
      if (!cep) {
        onErro('Informe seu CEP.')
        return
      }
    }
    startTransition(async () => {
      const res = await solicitarVinculo({
        tenantId: torcida.id,
        tipo,
        nome: tipo === 'SOCIO' ? nome : nome || nomeInicial || 'Torcedor',
        idade: idade || undefined,
        telefone: telefone || undefined,
        cidade: regiao || undefined,
        cep: cep || undefined,
        numero: numero || undefined,
        bloco: bloco || undefined,
        complemento: complemento || undefined,
        numeroAssociado: numeroAssociado || undefined,
        anosSocio: anosSocio || undefined,
        imagemProva,
        departamentoId: departamentoId || undefined,
        sedeId: unidadeId ?? undefined,
        unidadeNaoListada,
      })
      // Sucesso redireciona no servidor; se retornou, houve erro/validação.
      if (res?.errors) {
        setErrosCampo(res.errors)
        onErro('Confira os campos destacados.')
      } else if (res?.message) {
        onErro(res.message)
      }
    })
  }

  async function onArquivo(file: File | undefined) {
    if (!file) return
    setUploadPend(true)
    onErro(null)
    try {
      const url = await uploadMediaToCloudinary(file, undefined, 'cadastro', torcida.id)
      setImagemProva(url)
    } catch (err) {
      onErro(err instanceof Error ? err.message : 'Falha no upload da imagem.')
    } finally {
      setUploadPend(false)
    }
  }

  const conteudo =
    modo === 'escolha' ? (
      <div>
        <BotaoVoltar onClick={onVoltar} disabled={pending} />
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))] text-balance">
          Como você participa da {torcida.nome}?
        </h1>
        <p className="mt-1 max-w-prose text-sm text-[rgb(var(--foreground-muted))]">
          Escolha um dos dois caminhos. Cada um define o que você vê na comunidade
          do {nomeClube} e na da {torcida.nome}.
        </p>

        {!torcida.acessivelNoHost && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            O portal da <strong>{torcida.nome}</strong> fica em outro endereço. Sua
            solicitação será analisada pela diretoria dessa torcida — não aparecerá
            pendente no admin deste site.
          </p>
        )}

        <UnidadeInfoBox
          unidadeSelecionada={unidadeSelecionada}
          unidadeNaoListada={unidadeNaoListada}
          className="mt-4"
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Card 1: Torcedor da torcida */}
          <button
            type="button"
            onClick={() => enviar('TORCEDOR')}
            disabled={pending || unidadePendente}
            className="group flex h-full items-stretch overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:opacity-50"
          >
            <div className="flex w-[6.5rem] shrink-0 items-center justify-center self-stretch border-r border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3 sm:w-[7.5rem]">
              <EscudoClube
                nome={nomeClube}
                apelido={clube?.apelido}
                escudoUrl={clube?.escudoUrl}
                size="xl"
                shape="circle"
                priority
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary))]">
                Entrada imediata
              </p>
              <p className="mt-1 text-lg font-semibold text-[rgb(var(--foreground))]">
                Torcedor da torcida
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                Entra agora nas duas comunidades — sem aprovação nem comprovante.
              </p>

              <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-4 text-sm text-[rgb(var(--foreground))]">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary))]" />
                  <span>
                    Comunidade do <strong>{nomeClube}</strong> (feed nacional)
                  </span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary))]" />
                  <span>
                    Espaço aberto da <strong>{torcida.nome}</strong> (eventos e
                    novidades)
                  </span>
                </li>
                <li className="flex gap-2 text-[rgb(var(--foreground-muted))]">
                  <X className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                  <span>Sem mural exclusivo de sócios</span>
                </li>
              </ul>

              <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-[rgb(var(--color-primary))]">
                Entrar agora
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>

          {/* Card 2: Sócio da organizada */}
          <button
            type="button"
            onClick={abrirSocio}
            disabled={pending}
            className="group flex h-full items-stretch overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:opacity-50"
          >
            <div className="relative flex w-[6.5rem] shrink-0 items-center justify-center self-stretch border-r border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3 sm:w-[7.5rem]">
              <EscudoClube
                nome={torcida.nome}
                escudoUrl={torcida.logoUrl}
                size="xl"
                shape="circle"
                priority
              />
              <span
                className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--color-primary))] text-white shadow-sm ring-2 ring-[rgb(var(--surface))]"
                aria-hidden
              >
                <Shield className="h-3.5 w-3.5" />
              </span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Requer aprovação
              </p>
              <p className="mt-1 text-lg font-semibold text-[rgb(var(--foreground))]">
                Sócio da organizada
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                Acesso interno de sócios, com comprovante e análise da liderança.
              </p>

              <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-4 text-sm text-[rgb(var(--foreground))]">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary))]" />
                  <span>
                    Comunidade do <strong>{nomeClube}</strong>
                  </span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary))]" />
                  <span>
                    Mural interno de sócios da <strong>{torcida.nome}</strong>
                  </span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary))]" />
                  <span>Carteirinha, benefícios e posts exclusivos</span>
                </li>
              </ul>

              <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-[rgb(var(--color-primary))]">
                Solicitar vínculo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        </div>
      </div>
    ) : (
      // Formulário de sócio
      <div>
      <BotaoVoltar onClick={() => setModo('escolha')} disabled={pending} label="Voltar" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Solicitação de sócio</h1>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            Preencha seus dados. A liderança da {torcida.nome} vai analisar.
          </p>
        </div>
        <EscudoClube nome={torcida.nome} escudoUrl={torcida.logoUrl} size="xl" shape="circle" />
      </div>

      <div className="mt-6 space-y-4">
        <UnidadeInfoBox
          unidadeSelecionada={unidadeSelecionada}
          unidadeNaoListada={unidadeNaoListada}
        />

        <Campo label="Nome completo" obrigatorio erros={errosCampo.nome}>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Idade" erros={errosCampo.idade}>
            <Input
              type="text"
              inputMode="numeric"
              value={idade}
              onChange={(e) => setIdade(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="Ex: 25"
            />
          </Campo>
          <Campo label="Telefone / WhatsApp" erros={errosCampo.telefone}>
            <Input
              type="tel"
              maxLength={16}
              value={telefone}
              onChange={(e) => setTelefone(maskTelefone(e.target.value))}
              placeholder="(11) 99999-9999"
            />
          </Campo>
        </div>

        {regiao && (
          <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
            <span className="font-medium text-[rgb(var(--foreground))]">Região:</span> {regiao}
          </p>
        )}

        <Campo label="CEP" obrigatorio erros={errosCampo.cep}>
          <Input
            inputMode="numeric"
            maxLength={9}
            value={cep}
            onChange={(e) => setCep(maskCep(e.target.value))}
            placeholder="00000-000"
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Número" erros={errosCampo.numero}>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 120" />
          </Campo>
          <Campo label="Bloco" erros={errosCampo.bloco}>
            <Input value={bloco} onChange={(e) => setBloco(e.target.value)} placeholder="Opcional" />
          </Campo>
          <Campo label="Complemento" erros={errosCampo.complemento}>
            <Input
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
              placeholder="Opcional"
            />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nº de associado" obrigatorio erros={errosCampo.numeroAssociado}>
            <Input
              inputMode="numeric"
              maxLength={7}
              value={numeroAssociado}
              onChange={(e) => setNumeroAssociado(e.target.value.replace(/\D/g, '').slice(0, 7))}
              placeholder="Até 7 dígitos"
            />
          </Campo>
          <Campo label="Há quantos anos é sócio" obrigatorio erros={errosCampo.anosSocio}>
            <Input
              type="number"
              min={0}
              max={100}
              value={anosSocio}
              onChange={(e) => setAnosSocio(e.target.value)}
              placeholder="Ex: 3"
            />
          </Campo>
        </div>

        {departamentosSelecionaveis !== null && departamentosSelecionaveis.length > 0 && (
          <Campo label="Departamento de atuação" erros={errosCampo.departamentoId}>
            <Select value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}>
              <option value="">Selecione (opcional)</option>
              {departamentosSelecionaveis.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Verificação de vínculo
          </p>
          <div className="mt-3">
            <BlocoImagemProva
              imagemProva={imagemProva}
              uploadPend={uploadPend}
              erros={errosCampo.imagemProva}
              onArquivo={onArquivo}
            />
          </div>
          <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
            Usado só para validar seu vínculo com a torcida; não fica visível a outros associados.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <BotaoPrimario
          onClick={() => enviar('SOCIO')}
          pending={pending || uploadPend}
          disabled={!imagemProva || !numeroAssociado || !anosSocio || !cep}
          label="Enviar solicitação"
        />
      </div>
      </div>
    )

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={modo}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={springSnappy}
      >
        {conteudo}
      </m.div>
    </AnimatePresence>
  )
}

// ─── Peças compartilhadas ───────────────────────────────────────────────────────

const TIPO_SEDE_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'Ponto de encontro',
}

/** Info-box da unidade escolhida (ou pendente de cadastro), com link para o mapa. */
function UnidadeInfoBox({
  unidadeSelecionada,
  unidadeNaoListada,
  className,
}: {
  unidadeSelecionada: SedeOnboarding | null | undefined
  unidadeNaoListada: boolean
  className?: string
}) {
  if (!unidadeSelecionada && !unidadeNaoListada) return null
  const mapsUrl = unidadeSelecionada ? buildGoogleMapsUrl(unidadeSelecionada) : null

  return (
    <p
      className={`rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] ${className ?? ''}`}
    >
      {unidadeNaoListada ? (
        <>
          <span className="font-medium text-[rgb(var(--foreground))]">Unidade:</span> cadastro
          solicitado — seguiremos com seu vínculo enquanto validamos a subsede/PDE.
        </>
      ) : (
        <>
          <span className="font-medium text-[rgb(var(--foreground))]">Unidade:</span>{' '}
          {unidadeSelecionada?.nome}
          {unidadeSelecionada?.tipo
            ? ` (${TIPO_SEDE_LABEL[unidadeSelecionada.tipo] ?? unidadeSelecionada.tipo})`
            : ''}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--color-primary))] hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Ver no mapa
            </a>
          )}
        </>
      )}
    </p>
  )
}

function BlocoImagemProva({
  imagemProva,
  uploadPend,
  erros,
  onArquivo,
}: {
  imagemProva?: string
  uploadPend: boolean
  erros?: string[]
  onArquivo: (file: File | undefined) => void
}) {
  const inputGaleriaId = 'onboarding-upload-galeria'
  const inputCameraId = 'onboarding-upload-camera'

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Foto da carteirinha ou comprovante de vínculo <span className="text-red-500">*</span>
      </span>
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={inputGaleriaId}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]"
        >
          {uploadPend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Enviar arquivo
        </label>
        <label
          htmlFor={inputCameraId}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]"
        >
          {uploadPend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Tirar foto
        </label>
      </div>
      <input
        id={inputGaleriaId}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={uploadPend}
        onChange={(e) => {
          void onArquivo(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        id={inputCameraId}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={uploadPend}
        onChange={(e) => {
          void onArquivo(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {imagemProva && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
          <Check className="h-3 w-3" /> Imagem anexada
        </p>
      )}
      {erros?.[0] && <p className="mt-1 text-xs text-red-600">{erros[0]}</p>}
    </div>
  )
}

function BotaoVoltar({
  onClick,
  disabled,
  label = 'Voltar',
}: {
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:opacity-50"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  )
}

function BotaoPrimario({
  onClick,
  pending,
  disabled,
  label,
}: {
  onClick: () => void
  pending?: boolean
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
      {!pending && <ArrowRight className="h-4 w-4" />}
    </button>
  )
}

function Campo({
  label,
  obrigatorio,
  erros,
  children,
}: {
  label: string
  obrigatorio?: boolean
  erros?: string[]
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        {label} {obrigatorio && <span className="text-red-500">*</span>}
      </label>
      {children}
      {erros && erros.length > 0 && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erros[0]}</p>
      )}
    </div>
  )
}
