'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { AnimatePresence, m } from 'motion/react'
import { Shield, Search, ArrowLeft, ArrowRight, Check, Users, Upload, Loader2, Camera, Mail, LocateFixed, MapPin, FileText, X, ExternalLink } from 'lucide-react'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { ClubeOnboardingMeta } from '@/components/onboarding/clube-onboarding-meta'
import { TorcidaOnboardingMeta } from '@/components/onboarding/torcida-onboarding-meta'
import { UnidadeOnboardingCard } from '@/components/onboarding/unidade-onboarding-card'
import { Input, Select } from '@torcida/ui'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { routePage, springGentle, springSnappy } from '@/lib/motion-presets'
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
import { agruparSedesPorRegiao, normalizarTexto } from '@/lib/onboarding-unidade'
import { buildGoogleMapsUrl, reverseGeocodeRegion, type GoogleMapsRegion } from '@/lib/google-maps'
import type {
  AfiliacaoOnboarding,
  TorcidaOnboarding,
  DepartamentoOnboarding,
  SedeOnboarding,
  RegiaoOnboarding,
} from '@/lib/onboarding'

type Passo = 'clube' | 'regiao' | 'torcida' | 'unidade' | 'vinculo' | 'concluindo'

const PASSOS_VISIVEIS: { key: Passo; label: string }[] = [
  { key: 'clube', label: 'Clube' },
  { key: 'regiao', label: 'Região' },
  { key: 'torcida', label: 'Torcida' },
  { key: 'unidade', label: 'Unidade' },
  { key: 'vinculo', label: 'Vínculo' },
]

const SERIE_LABEL: Record<string, string> = {
  A: 'Série A',
  B: 'Série B',
  C: 'Série C',
  D: 'Série D',
  ESTADUAL: 'Estadual',
  OUTRA: 'Outra',
}

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
                onCidade={setCidade}
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
    recarregar(valor, ufFiltro)
  }

  function onUfFiltro(uf: string) {
    const prox = ufFiltro === uf ? '' : uf
    setUfFiltro(prox)
    recarregar(busca, prox)
  }

  const tituloGrid =
    ufFiltro && !busca
      ? `Clubes em ${ufFiltro}`
      : busca
        ? `Resultados para "${busca}"`
        : null

  return (
    <div>
      <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Qual clube você torce?</h1>
      <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
        Escolha o time do seu coração. Filtre por estado ou busque pelo nome.
      </p>

      {regioes.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Sugestões por região
          </p>
          <div className="flex flex-wrap gap-2">
            {regioes.map((r) => {
              const ativo = ufFiltro === r.uf
              return (
                <button
                  key={r.uf}
                  type="button"
                  onClick={() => onUfFiltro(r.uf)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    ativo
                      ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary))]'
                      : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--color-primary))]/50'
                  }`}
                >
                  {r.uf}
                  <span className="ml-1 opacity-70">({r.total})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <Input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar clube por nome..."
          className="pl-9"
          aria-label="Buscar clube"
        />
      </div>

      {buscando ? (
        <div className="flex items-center justify-center py-16 text-[rgb(var(--foreground-muted))]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[rgb(var(--border))] p-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum clube encontrado
          {busca ? ` para "${busca}"` : ufFiltro ? ` em ${ufFiltro}` : ''}. Tente outro filtro ou nome.
        </div>
      ) : (
        <>
          {tituloGrid && (
            <p className="mt-5 text-sm font-medium text-[rgb(var(--foreground-muted))]">{tituloGrid}</p>
          )}
          <ul className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${tituloGrid ? 'mt-3' : 'mt-5'}`}>
          {lista.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelecionar(a)}
                className="flex h-full w-full flex-col items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-center transition-all hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
              >
                <EscudoClube
                  nome={a.nome}
                  apelido={a.apelido}
                  escudoUrl={a.escudoUrl}
                />
                <span className="text-xs font-semibold uppercase text-[rgb(var(--foreground))] line-clamp-2">
                  {a.nome}
                </span>
                {(a.apelido || a.estado) && (
                  <span className="text-[10px] text-[rgb(var(--foreground-muted))] line-clamp-1">
                    {[a.apelido, a.estado].filter(Boolean).join(' · ')}
                  </span>
                )}
                {a.serie && (
                  <span className="text-[10px] text-[rgb(var(--foreground-muted))]">
                    {SERIE_LABEL[a.serie] ?? a.serie}
                  </span>
                )}
                <ClubeOnboardingMeta
                  torcedoresEstimados={a.torcedoresEstimados}
                  torcedoresEstimadosFonte={a.torcedoresEstimadosFonte}
                  torcedoresEstimadosTipo={a.torcedoresEstimadosTipo}
                  stats={a.stats}
                />
              </button>
            </li>
          ))}
        </ul>
        </>
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
                Use sua localização para priorizar subsedes e pontos de encontro realmente próximos.
                Se preferir, preencha cidade e estado manualmente.
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
          <Select id="uf" value={uf} onChange={(e) => onUf(e.target.value)}>
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
          <ComboboxCidade uf={uf} value={cidade} onChange={onCidade} disabled={pending} />
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
      <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
        Você pertence a alguma organizada?
      </h1>
      <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
        Torcidas de {nomeClube} na plataforma. Escolha a sua ou siga como torcedor.
      </p>

      {torcidas.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[rgb(var(--border))] p-8 text-center">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma torcida de {nomeClube} está na plataforma ainda.
          </p>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            Você pode entrar como torcedor e acompanhar a comunidade.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {torcidas.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onEscolher(t)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-left transition-all hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: t.corPrimaria }}
                >
                  {t.logoUrl ? (
                    <Image src={t.logoUrl} alt={t.nome} width={44} height={44} className="h-full w-full object-cover" />
                  ) : (
                    t.nome.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold uppercase text-[rgb(var(--foreground))]">{t.nome}</p>
                  <TorcidaOnboardingMeta stats={t.stats} />
                  {!t.acessivelNoHost && (
                    <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                      Portal em outro endereço — solicitação válida, aprovação na torcida escolhida.
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onTorcedorGlobal}
        disabled={pending}
        className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-[rgb(var(--border))] p-4 text-left transition-all hover:bg-[rgb(var(--surface))] disabled:opacity-50"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))]">
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--foreground-muted))]" />
          ) : (
            <Users className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          )}
        </div>
        <div>
          <p className="font-semibold text-[rgb(var(--foreground))]">
            Sou só torcedor / não pertenço a nenhuma
          </p>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Acompanhe a comunidade nacional do seu clube.
          </p>
        </div>
      </button>
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

  const { recomendadas, outras } = agruparSedesPorRegiao(torcida.sedes, uf, cidade, localizacao)
  const temUnidades = torcida.sedes.length > 0

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
    <div>
      <BotaoVoltar onClick={onVoltar} disabled={pending || enviando} />
      <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
        Onde você participa na {torcida.nome}?
      </h1>
      <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
        Informe a subsede ou ponto de encontro da sua região. Isso ajuda a mapear a estrutura
        territorial da torcida com dados precisos.
      </p>
      {regiaoLabel && (
        <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
          Sua região informada: <span className="font-medium text-[rgb(var(--foreground))]">{regiaoLabel}</span>
        </p>
      )}

      {!temUnidades ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[rgb(var(--border))] p-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Ainda não há subsedes ou pontos de encontro cadastrados para esta torcida na plataforma.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {recomendadas.length > 0 && (
            <ListaUnidades
              titulo="Recomendadas para você"
              subtitulo="Subsedes e pontos de encontro próximos da sua região, com a sede principal ao final"
              sedes={recomendadas}
              selecionada={selecionada}
              onSelecionar={selecionarUnidade}
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

      {selecionada && !modoNaoListada && (
        <div className="mt-6">
          <BotaoPrimario onClick={avancarComUnidade} pending={pending} label="Continuar" />
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))]/60 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-[rgb(var(--color-primary))]">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Unidade afiliada não listada
            </p>
            <p className="mt-1 max-w-2xl text-xs text-[rgb(var(--foreground-muted))]">
              Envie dados, contato e provas de credenciamento da subsede ou PDE. A solicitação será
              registrada e um e-mail será preparado para avaliação do time.
            </p>
          </div>
        </div>
        {!modoNaoListada ? (
          <button
            type="button"
            onClick={() => {
              setModoNaoListada(true)
              setSelecionada(null)
              onErro(null)
            }}
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--color-primary))] hover:underline"
          >
            <Mail className="h-4 w-4" />
            Solicitar cadastro de unidade afiliada
          </button>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="grid gap-4 sm:grid-cols-[1fr_96px]">
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

            <div className="grid gap-4 sm:grid-cols-3">
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

            <Campo label="Como comprova que é subsede/PDE credenciado?" obrigatorio erros={errosUnidade.vinculo}>
              <textarea
                value={vinculo}
                onChange={(e) => setVinculo(e.target.value)}
                rows={4}
                placeholder="Ex: vínculo com diretoria da sede, responsável local, redes oficiais, autorização, reuniões, faixas, carteirinhas ou comunicados."
                className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]"
              />
            </Campo>

            <Campo label="Observações adicionais" erros={errosUnidade.observacao}>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder="Ex: horários de reunião, redes sociais, contato da liderança local..."
                className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]"
              />
            </Campo>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Imagens, registros e provas (até 5)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="unidade-provas-upload"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
                >
                  {uploadProvaPend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Anexar imagem
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
                    {provasUrls.length} imagem(ns) anexada(s)
                  </span>
                )}
              </div>
              {provasUrls.length > 0 && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {provasUrls.map((url, index) => (
                    <li
                      key={url}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[rgb(var(--border))] px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]"
                    >
                      <span className="truncate">Prova {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => setProvasUrls((atuais) => atuais.filter((item) => item !== url))}
                        className="text-[rgb(var(--foreground-muted))] hover:text-red-500"
                        aria-label={`Remover prova ${index + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
              Ao continuar, registramos a solicitação e abrimos um e-mail para os super admins com
              os dados, contato e links das provas anexadas.
            </p>
            <BotaoPrimario
              onClick={avancarSemListagem}
              pending={enviando}
              disabled={uploadProvaPend}
              label="Enviar para avaliação"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ListaUnidades({
  titulo,
  subtitulo,
  sedes,
  selecionada,
  onSelecionar,
}: {
  titulo: string
  subtitulo?: string
  sedes: SedeOnboarding[]
  selecionada: string | null
  onSelecionar: (id: string) => void
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {titulo}
      </p>
      {subtitulo && (
        <p className="mb-3 text-[10px] text-[rgb(var(--foreground-muted))]">{subtitulo}</p>
      )}
      <ul className={sedes.length === 1 ? 'grid gap-4' : 'grid gap-4 xl:grid-cols-2'}>
        {sedes.map((s) => (
          <li key={s.id}>
            <UnidadeOnboardingCard
              sede={s}
              selecionada={selecionada === s.id}
              onSelecionar={onSelecionar}
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
  torcida,
  nomeInicial,
  regiao,
  unidadeId,
  unidadeNaoListada,
  onVoltar,
  onErro,
}: {
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
  // "Torcedor" é o departamento auxiliar criado ao aprovar torcedores — não faz
  // sentido como opção de atuação para quem se candidata a sócio.
  const departamentosSelecionaveis =
    departamentos === null ? null : departamentos.filter((d) => d.nome !== 'Torcedor')

  const unidadeSelecionada = unidadeId
    ? torcida.sedes.find((s) => s.id === unidadeId)
    : null
  const unidadePendente =
    !unidadeNaoListada && torcida.sedes.length > 1 && !unidadeId

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
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
          Como você participa da {torcida.nome}?
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Sócios passam por aprovação e têm acesso a benefícios exclusivos.
        </p>

        {!torcida.acessivelNoHost && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            O portal da <strong>{torcida.nome}</strong> fica em outro endereço. Sua solicitação será
            analisada pela diretoria dessa torcida — não aparecerá pendente no admin deste site.
          </p>
        )}

        <UnidadeInfoBox
          unidadeSelecionada={unidadeSelecionada}
          unidadeNaoListada={unidadeNaoListada}
          className="mt-4"
        />

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => enviar('TORCEDOR')}
            disabled={pending || unidadePendente}
            className="flex w-full items-start gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-left transition-all hover:border-[rgb(var(--color-primary))] disabled:opacity-50"
          >
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <div>
              <p className="font-semibold text-[rgb(var(--foreground))]">Torcedor da torcida</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Entrada imediata, sem aprovação nem comprovante. Acesso à comunidade, eventos e
                novidades da torcida.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={abrirSocio}
            disabled={pending}
            className="flex w-full items-start gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-left transition-all hover:border-[rgb(var(--color-primary))] disabled:opacity-50"
          >
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <div>
              <p className="font-semibold text-[rgb(var(--foreground))]">Sócio</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Carteirinha, benefícios e voz nas decisões. Requer aprovação e comprovante de
                vínculo.
              </p>
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
        <EscudoClube nome={torcida.nome} escudoUrl={torcida.logoUrl} size="md" />
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
