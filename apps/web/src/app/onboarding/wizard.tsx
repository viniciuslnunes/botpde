'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Shield, Search, ArrowLeft, ArrowRight, BadgeCheck, Check, Loader2, Mail, LocateFixed, MapPin, FileText, X, ExternalLink, User } from 'lucide-react'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { LogoImage } from '@/components/media/logo-image'
import { MapaBrasilEstados } from '@/components/onboarding/mapa-brasil-estados'
import { LinhaPlataforma } from '@/components/onboarding/onboarding-contagem-linhas'
import { TorcidaOnboardingCard } from '@/components/onboarding/torcida-onboarding-card'
import { UnidadeOnboardingCard } from '@/components/onboarding/unidade-onboarding-card'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { Input, Select } from '@torcida/ui'
import { DatePicker } from '@/components/ui/date-picker'
import {
  compareCalendarParts,
  parseDateOnly,
  todayPartsInZone,
} from '@/lib/format-datetime'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { LocationPickerFields } from '@/components/media/location-picker-fields'
import { normalizarInicioEndereco } from '@/lib/endereco'
import {
  routePage,
  springGentle,
  springSnappy,
} from '@/lib/motion-presets'
import { isDepartamentoLegado, maskRg, maskTelefone, normalizarCpf, PERIODICIDADE_PLANO_LABEL, resolverPeriodicidadesOnboarding, validarCpfDigitos, validarRg, validarTelefoneBr } from '@torcida/types'
import {
  salvarClubeRegiao,
  concluirComoTorcedor,
  solicitarVinculo,
  buscarAfiliacoes,
  buscarTorcidas,
  buscarDepartamentos,
  buscarCidadesDaUf,
  registrarInteresseUnidade,
  buscarSedesDaTorcida,
  consumirConviteCookie,
} from './actions'
import { ComboboxRegiao } from './combobox-regiao'
import {
  agruparSedesPorRegiao,
  exigeDepartamentoDaSede,
  normalizarTexto,
  type SedeOnboardingComDistancia,
} from '@/lib/onboarding-unidade'
import {
  buildGoogleMapsUrl,
  enrichSedesComCoordenadas,
  forwardGeocodeRegion,
  isGoogleMapsConfigured,
  reverseGeocodeEndereco,
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
import type { ConviteOnboarding, TorcidaMaeConvite } from '@/lib/convite'
import { useUnsavedChanges, useUnsavedChangesContext } from '@/lib/unsaved-changes'
import { buscarEnderecoPorCep } from '@/lib/viacep'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import { useLatestRef } from '@/lib/use-latest-ref'

type Passo = 'clube' | 'regiao' | 'torcida' | 'unidade' | 'vinculo' | 'concluindo'

const PASSOS_VISIVEIS: { key: Passo; label: string }[] = [
  { key: 'clube', label: 'Clube' },
  { key: 'regiao', label: 'Região' },
  { key: 'torcida', label: 'Torcida' },
  { key: 'unidade', label: 'Unidade' },
  { key: 'vinculo', label: 'Vínculo' },
]

const PASSOS_HISTORICO = new Set<Passo>(['clube', 'regiao', 'torcida', 'unidade', 'vinculo'])

type OnboardingHistoryState = {
  onboardingPasso: Passo
  vinculoModo?: 'escolha' | 'socio'
  [key: string]: unknown
}

function isPassoHistorico(value: unknown): value is Passo {
  return typeof value === 'string' && PASSOS_HISTORICO.has(value as Passo)
}

function urlDoPasso(
  passo: Passo,
  vinculoModo?: 'escolha' | 'socio',
  conviteSlug?: string | null,
): string {
  const params = new URLSearchParams()
  params.set('passo', passo)
  if (passo === 'vinculo' && vinculoModo === 'socio') {
    params.set('modo', 'socio')
  }
  // Sem isto o replaceState no mount apaga `?convite=` e um refresh cai no Clube.
  if (conviteSlug) params.set('convite', conviteSlug)
  return `/onboarding?${params.toString()}`
}

function mergeHistoryState(
  passo: Passo,
  vinculoModo?: 'escolha' | 'socio',
): OnboardingHistoryState {
  const base =
    typeof window.history.state === 'object' && window.history.state !== null
      ? (window.history.state as Record<string, unknown>)
      : {}
  return {
    ...base,
    onboardingPasso: passo,
    vinculoModo: passo === 'vinculo' ? vinculoModo : undefined,
  }
}

type Props = {
  afiliacoesIniciais: AfiliacaoOnboarding[]
  regioes: RegiaoOnboarding[]
  nomeInicial: string
  emailInicial: string
  userId: string
  /**
   * Convite direto (`/convite/<slug>`): clube, torcida e unidade já vêm
   * resolvidos pelo link e o wizard abre no passo Vínculo. Para uma unidade
   * com canal restrito, este é o único caminho de entrada — ela não aparece
   * na vitrine pública do onboarding.
   */
  convite?: ConviteOnboarding | null
}

export function OnboardingWizard({
  afiliacoesIniciais,
  regioes,
  nomeInicial,
  emailInicial,
  userId,
  convite = null,
}: Props) {
  const { allowUnload } = useUnsavedChangesContext()
  const [passo, setPasso] = useState<Passo>(convite ? convite.passoInicial : 'clube')
  const [slideDir, setSlideDir] = useState(1)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [vinculoModo, setVinculoModo] = useState<'escolha' | 'socio'>('escolha')
  /**
   * EXISTENTE = já tem nº/carteirinha; NOVO = primeira associação.
   * Fica null quando o passo Unidade pula direto para `modo=socio` (sem
   * reoferecer «torcedor») — aí o PassoVinculo exige a escolha antes do form.
   */
  const [caminhoSocio, setCaminhoSocio] = useState<'EXISTENTE' | 'NOVO' | null>(null)

  // Seleções acumuladas
  const [clube, setClube] = useState<AfiliacaoOnboarding | null>(convite?.clube ?? null)
  const [uf, setUf] = useState(convite?.uf ?? '')
  const [cidade, setCidade] = useState(convite?.cidade ?? '')
  const [localizacaoPrecisa, setLocalizacaoPrecisa] = useState<GoogleMapsRegion | null>(null)
  /**
   * Coordenadas vindas do GPS do dispositivo (não do centróide da cidade) —
   * habilitam o preenchimento do endereço por localização no passo Vínculo.
   */
  const [coordsDispositivo, setCoordsDispositivo] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [torcida, setTorcida] = useState<TorcidaOnboarding | null>(convite?.torcida ?? null)
  const [unidadeId, setUnidadeId] = useState<string | null>(convite?.unidadeId ?? null)
  const [unidadeNaoListada, setUnidadeNaoListada] = useState(false)

  const passoRef = useLatestRef(passo)
  const clubeRef = useLatestRef(clube)
  const torcidaRef = useLatestRef(torcida)

  const wizardDraftKey = useMemo(() => `onboarding:wizard-draft:${userId}`, [userId])
  const [wizardDraftRestored, setWizardDraftRestored] = useState(false)

  /** Garante que o passo do histórico não pule dados ainda não escolhidos. */
  function passoAlcancavel(alvo: Passo): Passo {
    if (alvo === 'concluindo') return 'concluindo'
    // Com convite, clube e torcida vieram do link: voltar atrás só permitiria
    // trocar de torcida e invalidar o convite. O passo Unidade continua
    // acessível quando a torcida tem mais de uma — é escolha do usuário.
    if (convite) {
      if (convite.passoInicial === 'unidade' && (alvo === 'unidade' || alvo === 'vinculo')) {
        return alvo
      }
      return 'vinculo'
    }
    if (!clubeRef.current && alvo !== 'clube') return 'clube'
    if (!torcidaRef.current && (alvo === 'unidade' || alvo === 'vinculo')) return 'torcida'
    return alvo
  }

  function aplicarPasso(novo: Passo, dir: number, modo: 'escolha' | 'socio' = 'escolha') {
    const alcancavel = passoAlcancavel(novo)
    setSlideDir(dir)
    setPasso(alcancavel)
    setVinculoModo(alcancavel === 'vinculo' ? modo : 'escolha')
    setErro(null)
  }

  const conviteSlug = convite?.conviteSlug ?? null

  /** Avança um passo e empilha no histórico do navegador (voltar do browser = Voltar). */
  function avancarPara(novo: Passo, modo: 'escolha' | 'socio' = 'escolha') {
    aplicarPasso(novo, 1, modo)
    if (!PASSOS_HISTORICO.has(novo)) return
    window.history.pushState(
      mergeHistoryState(novo, modo),
      '',
      urlDoPasso(novo, modo, conviteSlug),
    )
  }

  /** Voltar UI = mesma ação da seta do navegador. */
  function voltarHistorico() {
    window.history.back()
  }

  /** Corrige o passo sem empilhar (ex.: falha ao concluir). */
  function corrigirPasso(novo: Passo, dir = -1) {
    aplicarPasso(novo, dir)
    if (!PASSOS_HISTORICO.has(novo)) return
    window.history.replaceState(
      mergeHistoryState(novo),
      '',
      urlDoPasso(novo, undefined, conviteSlug),
    )
  }

  useEffect(() => {
    let initialPasso: Passo = convite ? convite.passoInicial : 'clube'
    let initialVinculoModo: 'escolha' | 'socio' = 'escolha'

    // Cookie de curto prazo já cumpriu o papel (chegamos com o convite resolvido).
    if (convite) void consumirConviteCookie()

    try {
      // Convite é intenção explícita e recente: descarta o rascunho de uma
      // sessão anterior, que apontaria para outra torcida.
      if (convite) window.sessionStorage.removeItem(wizardDraftKey)
      const raw = convite ? null : window.sessionStorage.getItem(wizardDraftKey)
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{
          passo: Passo
          vinculoModo: 'escolha' | 'socio'
          caminhoSocio: 'EXISTENTE' | 'NOVO' | null
          clube: AfiliacaoOnboarding | null
          uf: string
          cidade: string
          torcida: TorcidaOnboarding | null
          unidadeId: string | null
          unidadeNaoListada: boolean
        }>

        const savedPasso = saved.passo
        initialPasso =
          savedPasso === 'concluindo'
            ? 'concluindo'
            : isPassoHistorico(savedPasso)
              ? (savedPasso as Passo)
              : 'clube'

        initialVinculoModo = saved.vinculoModo ?? 'escolha'

        // Sanitiza passos que dependem de pré-seleções.
        if (initialPasso === 'torcida' && !saved.clube) initialPasso = 'clube'
        if (initialPasso === 'unidade' && !saved.torcida) initialPasso = 'torcida'
        if (initialPasso === 'vinculo' && !saved.torcida) initialPasso = 'torcida'

        if (saved.clube) setClube(saved.clube)
        if (typeof saved.uf === 'string') setUf(saved.uf)
        if (typeof saved.cidade === 'string') setCidade(saved.cidade)
        if (saved.torcida) setTorcida(saved.torcida)
        if (typeof saved.unidadeId === 'string' || saved.unidadeId === null) setUnidadeId(saved.unidadeId ?? null)
        if (typeof saved.unidadeNaoListada === 'boolean') setUnidadeNaoListada(saved.unidadeNaoListada)
        if (saved.caminhoSocio === 'EXISTENTE' || saved.caminhoSocio === 'NOVO') {
          setCaminhoSocio(saved.caminhoSocio)
        }
        if (initialPasso === 'vinculo') setVinculoModo(initialVinculoModo)
        setPasso(initialPasso)
      }
    } catch {
      // Ignora draft inválido/corrompido e volta ao comportamento padrão.
    } finally {
      window.history.replaceState(
        mergeHistoryState(initialPasso, initialVinculoModo),
        '',
        urlDoPasso(initialPasso, initialVinculoModo, convite?.conviteSlug),
      )
      setWizardDraftRestored(true)
    }

    function onPopState(event: PopStateEvent) {
      const state = event.state as OnboardingHistoryState | null
      if (!state || !isPassoHistorico(state.onboardingPasso)) return

      const alvo = passoAlcancavel(state.onboardingPasso)
      const fromIdx = PASSOS_VISIVEIS.findIndex((p) => p.key === passoRef.current)
      const toIdx = PASSOS_VISIVEIS.findIndex((p) => p.key === alvo)
      const dir =
        passoRef.current === 'vinculo' &&
        alvo === 'vinculo' &&
        (state.vinculoModo ?? 'escolha') === 'escolha'
          ? -1
          : toIdx < fromIdx
            ? -1
            : 1
      aplicarPasso(alvo, dir, state.vinculoModo ?? 'escolha')
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync de histórico só no mount
  }, [])

  useEffect(() => {
    if (!wizardDraftRestored) return
    if (typeof window === 'undefined') return

    if (passo === 'concluindo') {
      window.sessionStorage.removeItem(wizardDraftKey)
      return
    }

    const saveDraft = () => {
      const draft = {
        passo,
        vinculoModo: passo === 'vinculo' ? vinculoModo : undefined,
        caminhoSocio: passo === 'vinculo' ? caminhoSocio : undefined,
        clube,
        uf,
        cidade,
        torcida,
        unidadeId,
        unidadeNaoListada,
      } satisfies Record<string, unknown>

      window.sessionStorage.setItem(wizardDraftKey, JSON.stringify(draft))
    }

    const timeout = window.setTimeout(saveDraft, 250)

    return () => {
      window.clearTimeout(timeout)
      // Flush ao desmontar (voltar/refresh) para não perder seleções recentes.
      saveDraft()
    }
  }, [wizardDraftRestored, wizardDraftKey, passo, vinculoModo, caminhoSocio, clube, uf, cidade, torcida, unidadeId, unidadeNaoListada])

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
    // Ref sincronizada já: avancarPara → passoAlcancavel lê clubeRef antes do re-render.
    clubeRef.current = afiliacao
    setClube(afiliacao)
    limparErro()
    avancarPara('regiao')
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
      avancarPara('torcida')
    })
  }

  // ── Passo 3: escolher torcida ou seguir como torcedor global ─────────────────
  function escolherTorcida(t: TorcidaOnboarding) {
    // Idem: passoAlcancavel bloqueia unidade/vínculo sem torcidaRef.
    torcidaRef.current = t
    setTorcida(t)
    setUnidadeId(null)
    setUnidadeNaoListada(false)
    limparErro()
    avancarPara('unidade')
  }

  function confirmarUnidade(sedeId: string | null, naoListada: boolean) {
    setUnidadeId(sedeId)
    setUnidadeNaoListada(naoListada)
    limparErro()
    // Quem escolheu organizada + unidade já pediu vínculo com a torcida —
    // vai direto à solicitação de sócio (sem reoferecer comunidade nacional).
    avancarPara('vinculo', 'socio')
  }

  function abrirModoSocio(caminho: 'EXISTENTE' | 'NOVO') {
    setCaminhoSocio(caminho)
    // Unidade → vínculo já entra em modo=socio sem caminho; aí só falta
    // EXISTENTE/NOVO. Não empilha outro histórico na mesma URL.
    if (passo === 'vinculo' && vinculoModo === 'socio') {
      setErro(null)
      return
    }
    avancarPara('vinculo', 'socio')
  }

  function seguirComoTorcedorGlobal() {
    setErro(null)
    aplicarPasso('concluindo', 1)
    startTransition(async () => {
      // Com convite, o servidor converte este atalho em torcedor da unidade
      // (e espelha na Sede). O slug vai junto porque o cookie tem TTL de 1 h
      // e pode ter expirado enquanto a pessoa preenchia o wizard.
      const res = await concluirComoTorcedor(conviteSlug ?? undefined)
      if (res?.redirectTo) {
        allowUnload()
        window.location.assign(res.redirectTo)
        return
      }
      // Se retornou sem redirect, houve erro.
      if (res?.message) {
        corrigirPasso('torcida')
        setErro(res.message)
      }
    })
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Cabeçalho + progresso */}
      <header className="mb-8 min-w-0">
        <div className="mb-6 flex items-center gap-2 text-[rgb(var(--color-primary-fg))]">
          <Shield className="h-6 w-6 shrink-0" />
          <span className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Bem-vindo
          </span>
        </div>
        <ProgressBar indiceAtual={indiceAtual === -1 ? PASSOS_VISIVEIS.length : indiceAtual} />
      </header>

      {erro && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {erro}
        </div>
      )}

      <div className="min-w-0 flex-1 overflow-x-hidden">
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
              className="min-w-0"
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
              className="min-w-0"
            >
              <PassoRegiao
                clube={clube}
                uf={uf}
                cidade={cidade}
                onRegiao={(cidadeSel, ufSel) => {
                  setUf(ufSel)
                  setCidade(cidadeSel)
                  setLocalizacaoPrecisa(null)
                  setCoordsDispositivo(null)
                }}
                onLocalizacao={(regiao, origem) => {
                  setUf(regiao.estado)
                  setCidade(regiao.cidade)
                  setLocalizacaoPrecisa(regiao)
                  // Só o GPS aponta para o endereço do usuário; o geocode da
                  // cidade devolve o centróide do município e preencheria uma
                  // rua aleatória no passo de Endereço.
                  setCoordsDispositivo(
                    origem === 'gps' ? { lat: regiao.lat, lng: regiao.lng } : null,
                  )
                }}
                pending={pending}
                onVoltar={voltarHistorico}
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
              className="min-w-0"
            >
              <PassoTorcida
                clube={clube}
                torcidas={torcidas ?? []}
                pending={pending}
                onEscolher={escolherTorcida}
                onTorcedorGlobal={seguirComoTorcedorGlobal}
                onVoltar={voltarHistorico}
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
              className="min-w-0"
            >
              <PassoUnidade
                torcida={torcida}
                uf={uf}
                cidade={cidade}
                regiaoLabel={[cidade.trim(), uf].filter(Boolean).join(' - ') || undefined}
                localizacao={localizacaoPrecisa ?? undefined}
                pending={pending}
                onConfirmar={confirmarUnidade}
                onVoltar={voltarHistorico}
                onErro={setErro}
                onSedesAtualizadas={(sedes) => {
                  setTorcida((atual) => (atual ? { ...atual, sedes } : atual))
                }}
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
              className="min-w-0"
            >
              <PassoVinculo
                clube={clube}
                torcida={torcida}
                nomeInicial={nomeInicial}
                emailInicial={emailInicial}
                regiao={[cidade.trim(), uf].filter(Boolean).join(' - ') || undefined}
                regiaoUf={uf}
                regiaoCidade={cidade}
                coordsDispositivo={coordsDispositivo}
                userId={userId}
                unidadeId={unidadeId}
                unidadeNaoListada={unidadeNaoListada}
                canalRestrito={convite?.canalRestrito ?? false}
                torcidaMae={convite?.torcidaMae ?? null}
                conviteSlug={conviteSlug}
                modo={vinculoModo}
                caminhoSocio={caminhoSocio}
                onAbrirSocio={abrirModoSocio}
                onVoltar={voltarHistorico}
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
              <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-primary-fg))]" />
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
    <ol className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      {PASSOS_VISIVEIS.map((p, i) => {
        const feito = i < indiceAtual
        const atual = i === indiceAtual
        return (
          <li key={p.key} className="relative flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border))]">
              <m.div
                className="h-full rounded-full bg-[rgb(var(--color-primary))]"
                initial={false}
                animate={{ width: feito || atual ? '100%' : '0%' }}
                transition={springSnappy}
              />
            </div>
            <span
              className={`truncate text-[10px] sm:text-[11px] ${
                atual
                  ? 'font-semibold text-[rgb(var(--foreground))]'
                  : 'font-medium text-[rgb(var(--foreground-muted))]'
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
  uf,
  cidade,
  onRegiao,
  onLocalizacao,
  pending,
  onVoltar,
  onContinuar,
}: {
  clube: AfiliacaoOnboarding | null
  uf: string
  cidade: string
  onRegiao: (cidade: string, uf: string) => void
  /** `origem` distingue GPS do dispositivo (preciso) do centróide da cidade. */
  onLocalizacao: (regiao: GoogleMapsRegion, origem: 'gps' | 'cidade') => void
  pending: boolean
  onVoltar: () => void
  onContinuar: () => void
}) {
  const beneficioId = useId()
  const [localizando, setLocalizando] = useState(false)
  const [erroLocalizacao, setErroLocalizacao] = useState<string | null>(null)
  const [localizacaoDetectada, setLocalizacaoDetectada] = useState(false)
  const geocodeSeq = useRef(0)

  const valueRegiao = uf && cidade ? { cidade, uf } : null

  function selecionarRegiao(m: { cidade: string; uf: string }) {
    setLocalizacaoDetectada(false)
    setErroLocalizacao(null)
    onRegiao(m.cidade, m.uf)
    if (!m.cidade.trim() || !m.uf) return
    const seq = ++geocodeSeq.current
    void forwardGeocodeRegion(m.cidade, m.uf).then((regiao) => {
      if (seq !== geocodeSeq.current || !regiao) return
      onLocalizacao(regiao, 'cidade')
    })
  }

  function usarLocalizacao() {
    setLocalizacaoDetectada(false)
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
          onLocalizacao({ ...regiao, cidade: nomeCanonico }, 'gps')
          setLocalizacaoDetectada(true)
        } else {
          setLocalizacaoDetectada(false)
          onRegiao('', regiao.estado)
          setErroLocalizacao(
            `Detectamos ${regiao.estado}, mas não conseguimos confirmar sua cidade automaticamente — busque sua cidade no campo acima.`,
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
      <p className="mt-1 max-w-prose text-sm text-[rgb(var(--foreground-muted))]">
        Sua região ajuda a conectar você a torcedores e eventos por perto
        {clube ? ` do ${clube.apelido || clube.nome}` : ''}.
      </p>

      <div className="mt-6 max-w-md">
        <label
          htmlFor="regiao"
          className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
        >
          Sua cidade
        </label>
        <ComboboxRegiao
          id="regiao"
          value={valueRegiao}
          onSelecionar={selecionarRegiao}
          disabled={pending || localizando}
          aria-describedby={beneficioId}
        />
        <p
          id={beneficioId}
          className="mt-1.5 text-xs text-[rgb(var(--foreground-muted))]"
        >
          Prioriza subsedes e pontos de encontro próximos, com distância em km.
        </p>

        <button
          type="button"
          onClick={usarLocalizacao}
          disabled={pending || localizando}
          className="mt-3 inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
        >
          {localizando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
          )}
          {localizando ? 'Localizando...' : 'Usar minha localização'}
        </button>

        {localizacaoDetectada && uf && cidade && (
          <p
            role="status"
            aria-live="polite"
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-success-fg))]"
          >
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Detectado pela sua localização — dá para reaproveitar no seu endereço
          </p>
        )}
        {erroLocalizacao && (
          <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            {erroLocalizacao}
          </p>
        )}
      </div>

      <div className="mt-8 max-w-md">
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
    <div className="min-w-0">
      <BotaoVoltar onClick={onVoltar} disabled={pending} />
      <h1 className="text-2xl font-bold tracking-tight text-balance text-[rgb(var(--foreground))] sm:text-3xl">
        Você pertence a alguma organizada?
      </h1>
      <p className="mt-1.5 max-w-prose text-sm text-[rgb(var(--foreground-muted))]">
        Comece como torcedor do {nomeClube} ou vincule-se a uma torcida na plataforma.
      </p>

      {/* Caminho padrão: só torcedor — 1ª célula da grade (não estica full-width) */}
      <ul className="mt-6 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <li className="min-w-0">
          <button
            type="button"
            onClick={onTorcedorGlobal}
            disabled={pending}
            className="group flex h-full w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border-2 border-[rgb(var(--color-primary))]/35 bg-[rgb(var(--color-primary))]/5 text-center transition-[border-color,background-color,box-shadow] duration-150 hover:border-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary))]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:opacity-50"
          >
            <div className="flex w-full shrink-0 items-center justify-center bg-[rgb(var(--background-subtle))]/60 px-5 py-6 sm:px-6 sm:py-7">
              {pending ? (
                <div className="flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
                  <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--foreground-muted))]" />
                </div>
              ) : (
                <div className="relative h-28 w-28 sm:h-32 sm:w-32">
                  <EscudoClube
                    nome={nomeClube}
                    apelido={clube?.apelido}
                    escudoUrl={clube?.escudoUrl}
                    size="fill"
                    priority
                  />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 p-3.5 sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                Sem organizada
              </p>
              <p className="line-clamp-2 w-full text-xs font-semibold leading-snug text-[rgb(var(--foreground))] sm:text-sm">
                Sou só torcedor do {nomeClube}
              </p>
              <p className="line-clamp-3 w-full text-[11px] leading-snug text-[rgb(var(--foreground-muted))]">
                Comunidade nacional — sem vínculo com torcida organizada.
              </p>
              {clube ? (
                <div className="mt-auto flex w-full justify-center pt-1">
                  <LinhaPlataforma
                    rotulo="Torcedores"
                    total={clube.stats.torcedoresTotal}
                    online={clube.stats.torcedoresOnline}
                  />
                </div>
              ) : null}
            </div>
          </button>
        </li>
      </ul>

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

          <ul className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {torcidas.map((t, i) => (
              <li key={t.id} className="min-w-0">
                <MotionReveal index={i} className="h-full min-w-0 w-full">
                  <TorcidaOnboardingCard
                    torcida={t}
                    onEscolher={onEscolher}
                    disabled={pending}
                    priority={i < 6}
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
  onSedesAtualizadas,
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
  onSedesAtualizadas: (sedes: SedeOnboarding[]) => void
}) {
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [modoNaoListada, setModoNaoListada] = useState(false)
  const [novidadeDetectada, setNovidadeDetectada] = useState(false)
  const [nomeUnidade, setNomeUnidade] = useState('')
  const [tipoUnidade, setTipoUnidade] = useState<'SUBSEDE' | 'PONTO_ENCONTRO'>('PONTO_ENCONTRO')
  const [cidadeUnidade, setCidadeUnidade] = useState(cidade)
  const [estadoUnidade, setEstadoUnidade] = useState(uf)
  const [enderecoUnidade, setEnderecoUnidade] = useState('')
  const [cepUnidade, setCepUnidade] = useState('')
  const [buscandoCepUnidade, setBuscandoCepUnidade] = useState(false)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [mapsUrlUnidade, setMapsUrlUnidade] = useState('')
  const [fotoUrlUnidade, setFotoUrlUnidade] = useState('')
  const formId = useId()
  const [contatoNome, setContatoNome] = useState('')
  const [contatoEmail, setContatoEmail] = useState('')
  const [contatoTelefone, setContatoTelefone] = useState('')
  const [vinculo, setVinculo] = useState('')
  const [observacao, setObservacao] = useState('')
  const [provasUrls, setProvasUrls] = useState<string[]>([])
  const [errosUnidade, setErrosUnidade] = useState<Record<string, string[]>>({})
  const [enviando, startEnvio] = useTransition()
  const idsSedesRef = useRef(new Set(torcida.sedes.map((s) => s.id)))
  const cropProva = useCroppedImageUpload({
    aspect: 4 / 3,
    purpose: 'cadastro',
    tenantId: torcida.id,
    title: 'Ajustar prova',
    confirmLabel: 'Confirmar e anexar',
    onDone: ({ url }) => {
      if (!url) return
      setProvasUrls((atuais) => {
        if (atuais.length >= 5) {
          onErro('Envie no máximo 5 imagens de prova.')
          return atuais
        }
        return [...atuais, url]
      })
    },
  })
  const uploadProvaPend = cropProva.busy
  const cropFotoUnidade = useCroppedImageUpload({
    aspect: 1,
    purpose: 'sede',
    tenantId: torcida.id,
    title: 'Ajustar foto da unidade',
    confirmLabel: 'Confirmar e enviar',
    onDone: ({ url }) => {
      if (url) setFotoUrlUnidade(url)
    },
  })
  const [localizacaoEfetiva, setLocalizacaoEfetiva] = useState(localizacao)
  const [sedesResolvidas, setSedesResolvidas] = useState(torcida.sedes)
  const [geoRegiaoPend, setGeoRegiaoPend] = useState(() => !localizacao && Boolean(cidade.trim() && uf.trim()))
  const [geoSedesPend, setGeoSedesPend] = useState(() =>
    torcida.sedes.some((s) => s.lat == null || s.lng == null),
  )

  const pollSedesRef = useLatestRef<() => void>(() => {
    void (async () => {
      const sedes = await buscarSedesDaTorcida(torcida.id)
      const idsNovos = new Set(sedes.map((s) => s.id))
      const mudou =
        idsNovos.size !== idsSedesRef.current.size ||
        [...idsNovos].some((id) => !idsSedesRef.current.has(id))
      if (!mudou) return
      idsSedesRef.current = idsNovos
      onSedesAtualizadas(sedes)
      setSedesResolvidas(sedes)
      setNovidadeDetectada(true)
      if (sedes.length > 0) {
        setModoNaoListada(false)
      }
      const precisaEnrich = sedes.some((s) => s.lat == null || s.lng == null)
      if (precisaEnrich) {
        setGeoSedesPend(true)
        const enrichidas = await enrichSedesComCoordenadas(sedes)
        setSedesResolvidas(enrichidas)
        setGeoSedesPend(false)
      } else {
        setGeoSedesPend(false)
      }
    })()
  })

  // Polling: detecta PDE/subsede aprovada enquanto o usuário espera no passo.
  const pollSedesTick = useCallback(() => {
    pollSedesRef.current()
  }, [pollSedesRef])
  useEffect(() => {
    pollSedesTick()
  }, [pollSedesTick])
  useVisibleInterval(pollSedesTick, 3000, true)

  // Garante coords da região do usuário (cidade/UF) para calcular km.
  useEffect(() => {
    if (localizacao) {
      setLocalizacaoEfetiva(localizacao)
      setGeoRegiaoPend(false)
      return
    }
    if (!cidade.trim() || !uf.trim()) {
      setLocalizacaoEfetiva(undefined)
      setGeoRegiaoPend(false)
      return
    }
    let ativo = true
    setGeoRegiaoPend(true)
    void forwardGeocodeRegion(cidade, uf).then((regiao) => {
      if (!ativo) return
      setLocalizacaoEfetiva(regiao ?? undefined)
      setGeoRegiaoPend(false)
    })
    return () => {
      ativo = false
    }
  }, [localizacao, cidade, uf])

  // Banco ainda pode estar sem lat/lng — geocodifica endereço/cidade no cliente.
  useEffect(() => {
    let ativo = true
    idsSedesRef.current = new Set(torcida.sedes.map((s) => s.id))
    setSedesResolvidas(torcida.sedes)
    const precisaEnrich = torcida.sedes.some((s) => s.lat == null || s.lng == null)
    if (!precisaEnrich) {
      setGeoSedesPend(false)
      return
    }
    setGeoSedesPend(true)
    void enrichSedesComCoordenadas(torcida.sedes).then((sedes) => {
      if (!ativo) return
      setSedesResolvidas(sedes)
      setGeoSedesPend(false)
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
  const temAlgumaDistancia =
    recomendadas.some((s) => s.distanciaKm != null) ||
    outras.some((s) => s.distanciaKm != null)
  const resolvendoDistancias = (geoRegiaoPend || geoSedesPend) && !temAlgumaDistancia

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

  async function onCepChange(value: string) {
    setCepUnidade(value)
    const digitos = value.replace(/\D/g, '')
    if (digitos.length !== 8) return
    setBuscandoCepUnidade(true)
    try {
      const endereco = await buscarEnderecoPorCep(value)
      if (!endereco) return
      const atual = enderecoUnidade.trim()
      const numero = atual.match(/,?\s*(\d+[A-Za-z]?.*)$/)
      const mesmoLogradouro =
        atual.length > 0 &&
        Boolean(endereco.logradouro) &&
        normalizarInicioEndereco(atual) === normalizarInicioEndereco(endereco.logradouro)
      const novoEndereco = endereco.logradouro
        ? mesmoLogradouro && numero
          ? `${endereco.logradouro}, ${numero[1].replace(/^,\s*/, '')}`
          : endereco.logradouro
        : atual
      setCidadeUnidade(endereco.localidade || cidadeUnidade)
      setEstadoUnidade(endereco.uf || estadoUnidade)
      setEnderecoUnidade(novoEndereco)
      setCepUnidade(`${digitos.slice(0, 5)}-${digitos.slice(5)}`)
    } finally {
      setBuscandoCepUnidade(false)
    }
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
        cep: cepUnidade,
        lat,
        lng,
        mapsUrl: mapsUrlUnidade || undefined,
        fotoUrl: fotoUrlUnidade || undefined,
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

  function anexarProvaUnidade(file: File | undefined) {
    if (!file) return
    if (provasUrls.length >= 5) {
      onErro('Envie no máximo 5 imagens de prova.')
      return
    }
    if (!file.type.startsWith('image/')) {
      onErro('Selecione um arquivo de imagem.')
      return
    }
    onErro(null)
    cropProva.open(file)
  }

  return (
    <div className="min-w-0 pb-20">
      {cropProva.dialog}
      {cropFotoUnidade.dialog}
      <BotaoVoltar onClick={onVoltar} disabled={pending || enviando} />
      <h1 className="text-xl font-bold text-balance break-words text-[rgb(var(--foreground))] sm:text-2xl">
        Onde você participa na {torcida.nome}?
      </h1>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 text-sm text-[rgb(var(--foreground-muted))]">
          Escolha a sede, subsede ou PDE da sua região
          {temAlgumaDistancia ? ' — com distância em km' : ''}.
        </p>
        {regiaoLabel && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground))]">
            <MapPin className="h-3 w-3 shrink-0 text-[rgb(var(--color-primary-fg))]" aria-hidden />
            <span className="truncate">{regiaoLabel}</span>
          </span>
        )}
        {resolvendoDistancias && !temAlgumaDistancia ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[rgb(var(--foreground-muted))]">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Calculando distâncias…
          </span>
        ) : null}
        {novidadeDetectada ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--color-primary-fg))]">
            Nova unidade disponível — escolha abaixo
          </span>
        ) : null}
      </div>

      {!temUnidades ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-5 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Ainda não há unidades cadastradas para esta torcida. Solicite o cadastro abaixo.
        </div>
      ) : (
        <div className="mt-6 min-w-0">
          {recomendadas.length > 0 && (
            <ListaUnidades
              titulo="Recomendadas"
              sedes={recomendadas}
              selecionada={selecionada}
              onSelecionar={selecionarUnidade}
              priorityCount={2}
              colunas={3}
            />
          )}

          {outras.length > 0 && (
            <>
              {recomendadas.length > 0 && (
                <div className="mt-8 flex items-center gap-3" role="separator">
                  <div className="h-px flex-1 bg-[rgb(var(--border))]" />
                  <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    Ou escolha outra unidade
                  </p>
                  <div className="h-px flex-1 bg-[rgb(var(--border))]" />
                </div>
              )}
              <div className={recomendadas.length > 0 ? 'mt-5' : undefined}>
                <ListaUnidades
                  titulo={recomendadas.length > 0 ? undefined : 'Unidades'}
                  sedes={outras}
                  selecionada={selecionada}
                  onSelecionar={selecionarUnidade}
                  colunas={3}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Ação secundária sempre visível perto da lista — sem card grande até expandir */}
      {!modoNaoListada ? (
        <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--border))] pt-3">
          <p className="min-w-0 text-xs text-[rgb(var(--foreground-muted))]">
            Não encontrou sua unidade?
          </p>
          <button
            type="button"
            onClick={() => {
              setModoNaoListada(true)
              setSelecionada(null)
              onErro(null)
            }}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            <Mail className="h-3.5 w-3.5" />
            Solicitar cadastro
          </button>
        </div>
      ) : (
        <form
          id={formId}
          onSubmit={(e) => e.preventDefault()}
          className="mt-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))] text-[rgb(var(--color-primary-fg))]">
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

            <Campo
              label={`CEP${buscandoCepUnidade ? ' · buscando…' : ''}`}
              obrigatorio
              erros={errosUnidade.cep}
            >
              <Input
                name="cep"
                value={cepUnidade}
                onChange={(e) => void onCepChange(e.target.value)}
                placeholder="00000-000"
                maxLength={9}
              />
            </Campo>

            <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
              <Campo label="Cidade" obrigatorio erros={errosUnidade.cidade}>
                <Input
                  name="cidade"
                  value={cidadeUnidade}
                  onChange={(e) => setCidadeUnidade(e.target.value)}
                  placeholder="Ex: Praia Grande"
                />
              </Campo>
              <Campo label="UF" obrigatorio erros={errosUnidade.estado}>
                <Input
                  name="estado"
                  value={estadoUnidade}
                  onChange={(e) => setEstadoUnidade(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                />
              </Campo>
            </div>

            <Campo label="Endereço ou ponto de referência" obrigatorio erros={errosUnidade.endereco}>
              <Input
                name="endereco"
                value={enderecoUnidade}
                onChange={(e) => setEnderecoUnidade(e.target.value)}
                placeholder="Rua, número, bairro ou local de encontro"
              />
            </Campo>

            <LocationPickerFields
              formId={formId}
              onCoordsChange={(coords) => {
                setLat(coords.lat)
                setLng(coords.lng)
              }}
              onMapsLinkChange={setMapsUrlUnidade}
            />

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

            <Campo label="Foto da unidade (opcional)">
              <ImageDropZone
                layout="split"
                busy={cropFotoUnidade.busy}
                onFile={(file) => file && cropFotoUnidade.open(file)}
                formatsHint="JPEG, PNG, WebP ou GIF, até 10 MB — ajuste o enquadramento antes do envio"
                file={
                  fotoUrlUnidade
                    ? {
                        name: 'foto-unidade.jpg',
                        status: cropFotoUnidade.busy ? 'uploading' : 'done',
                        previewUrl: fotoUrlUnidade,
                      }
                    : null
                }
                onClear={fotoUrlUnidade ? () => setFotoUrlUnidade('') : undefined}
              />
            </Campo>

            <div>
              <ImageDropZone
                label="Provas (até 5 imagens)"
                busy={uploadProvaPend}
                disabled={provasUrls.length >= 5}
                formatsHint="JPEG, PNG ou WebP — até 5 imagens, com ajuste antes do envio"
                browseLabel={provasUrls.length >= 5 ? 'Limite atingido' : 'Procurar arquivo'}
                onFile={(file) => anexarProvaUnidade(file)}
              />
              {provasUrls.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {provasUrls.map((url, index) => (
                    <li
                      key={url}
                      className="flex items-center gap-3 rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2.5"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[rgb(var(--surface))] ring-1 ring-[rgb(var(--border))]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                          Prova {index + 1}
                        </p>
                        <p className="text-xs text-[rgb(var(--foreground-muted))]">Anexada</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProvasUrls((atuais) => atuais.filter((item) => item !== url))}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]"
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
              disabled={
                uploadProvaPend ||
                cropFotoUnidade.busy ||
                !cepUnidade.trim() ||
                !enderecoUnidade.trim()
              }
              label="Enviar para avaliação"
            />
          </div>
        </form>
      )}

      {/* CTA sticky: Continuar permanece no viewport após a seleção */}
      {selecionada && !modoNaoListada && (
        <StickyPersistBar
          locked
          saveShortcut={false}
          hint="Unidade selecionada — avance para o vínculo."
          className="max-w-5xl"
        >
          <BotaoPrimario onClick={avancarComUnidade} pending={pending} label="Continuar" />
        </StickyPersistBar>
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
  colunas = 2,
}: {
  titulo?: string
  sedes: SedeOnboardingComDistancia[]
  selecionada: string | null
  onSelecionar: (id: string) => void
  /** Quantas imagens priorizar (LCP) no topo da lista. */
  priorityCount?: number
  /** Grade no desktop — mesmo padrão do passo Torcida (2 colunas). */
  colunas?: 1 | 2 | 3
}) {
  const compact = colunas > 1
  const gridClass =
    colunas === 3
      ? 'grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4'
      : colunas === 2
        ? 'grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4'
        : 'grid min-w-0 grid-cols-1 gap-3'

  return (
    <div className="min-w-0 w-full">
      {titulo ? (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          {titulo}
          <span className="ml-1.5 font-normal tabular-nums text-[rgb(var(--foreground-muted))]/80">
            ({sedes.length})
          </span>
        </p>
      ) : null}
      <ul className={gridClass}>
        {sedes.map((s, index) => (
          <li key={s.id} className="min-w-0">
            <MotionReveal index={index} className="h-full min-w-0 w-full">
              <UnidadeOnboardingCard
                sede={s}
                selecionada={selecionada === s.id}
                onSelecionar={onSelecionar}
                priority={index < priorityCount}
                compact={compact}
              />
            </MotionReveal>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Passo 5: Vínculo (solicitação de sócio; atalho torcedor da torcida) ─────

/** Máscara progressiva de CEP: 00000-000. */
function maskCep(raw: string): string {
  const digitos = raw.replace(/\D/g, '').slice(0, 8)
  if (digitos.length <= 5) return digitos
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`
}

/** Máscara progressiva de CPF: 000.000.000-00. */
function maskCpf(raw: string): string {
  const digitos = raw.replace(/\D/g, '').slice(0, 11)
  const partes = [digitos.slice(0, 3), digitos.slice(3, 6), digitos.slice(6, 9)].filter(Boolean)
  let out = partes.join('.')
  if (digitos.length > 9) out += `-${digitos.slice(9)}`
  return out
}

/** Idade em anos completos a partir de uma data `YYYY-MM-DD`; `null` se inválida. */
function calcularIdadeDeInput(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!m) return null
  const nascimento = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const hoje = new Date()
  let idade = hoje.getFullYear() - nascimento.getFullYear()
  const aindaNaoFezAniversario =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate())
  if (aindaNaoFezAniversario) idade -= 1
  return idade
}

function PassoVinculo({
  clube,
  torcida,
  nomeInicial,
  emailInicial,
  regiao,
  regiaoUf,
  regiaoCidade,
  coordsDispositivo,
  unidadeId,
  unidadeNaoListada,
  canalRestrito,
  torcidaMae,
  conviteSlug,
  userId,
  modo,
  caminhoSocio,
  onAbrirSocio,
  onVoltar,
  onErro,
}: {
  clube: AfiliacaoOnboarding | null
  torcida: TorcidaOnboarding
  nomeInicial: string
  emailInicial: string
  regiao: string | undefined
  regiaoUf: string
  regiaoCidade: string
  /** GPS confirmado no passo Região; null = só temos cidade/UF. */
  coordsDispositivo: { lat: number; lng: number } | null
  unidadeId: string | null
  unidadeNaoListada: boolean
  /** Convite de unidade com canal fechado — copy e benefícios mudam. */
  canalRestrito: boolean
  /**
   * Slug do link que trouxe a pessoa. Vai ao servidor porque decide se o sócio
   * pendente acompanha o canal da unidade enquanto espera aprovação
   * (ARCHITECTURE.md §7 22) — e lá é conferido contra a linhagem, já que
   * procedência declarada pelo cliente não vale sozinha.
   */
  conviteSlug: string | null
  /** Sede/mãe quando o convite é de unidade Caso B. */
  torcidaMae: TorcidaMaeConvite | null
  userId: string
  modo: 'escolha' | 'socio'
  caminhoSocio: 'EXISTENTE' | 'NOVO' | null
  onAbrirSocio: (caminho: 'EXISTENTE' | 'NOVO') => void
  onVoltar: () => void
  onErro: (m: string | null) => void
}) {
  const { allowUnload } = useUnsavedChangesContext()
  const [pending, startTransition] = useTransition()
  const [errosCampo, setErrosCampo] = useState<Record<string, string[]>>({})
  const [tabAtiva, setTabAtiva] = useState<TabFormularioSocio>('identificacao')
  const abasRef = useRef<HTMLDivElement | null>(null)

  // Campos de sócio
  const [nome, setNome] = useState(nomeInicial)
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState(emailInicial)
  const [cep, setCep] = useState('')
  const [numero, setNumero] = useState('')
  const [bloco, setBloco] = useState('')
  const [complemento, setComplemento] = useState('')
  const [numeroAssociado, setNumeroAssociado] = useState('')
  const [anosSocio, setAnosSocio] = useState('')
  const [dataExpedicaoCarteirinha, setDataExpedicaoCarteirinha] = useState('')
  const [periodicidadePretendida, setPeriodicidadePretendida] = useState('')
  const [departamentoId, setDepartamentoId] = useState('')
  const [departamentoSedeId, setDepartamentoSedeId] = useState('')
  const [imagemProva, setImagemProva] = useState<string | undefined>()
  const cropComprovante = useCroppedImageUpload({
    aspect: 4 / 3,
    purpose: 'cadastro',
    tenantId: torcida.id,
    title: 'Ajustar comprovante',
    confirmLabel: 'Confirmar e enviar',
    onDone: ({ url }) => {
      if (url) setImagemProva(url)
    },
  })
  // ─── Identificação / LGE (2026-07): coletado direto no onboarding ───────────
  const [dataNascimento, setDataNascimento] = useState('')
  const [sexo, setSexo] = useState('')
  const [estadoCivil, setEstadoCivil] = useState('')
  const [nacionalidade, setNacionalidade] = useState('')
  const [rg, setRg] = useState('')
  const [cpf, setCpf] = useState('')
  const [nomePai, setNomePai] = useState('')
  const [nomeMae, setNomeMae] = useState('')
  const [profissao, setProfissao] = useState('')

  // ─── Endereço completo ──────────────────────────────────────────────────────
  const [logradouro, setLogradouro] = useState('')
  const [bairro, setBairro] = useState('')
  const [ufEndereco, setUfEndereco] = useState(regiaoUf)
  const [cidadeEndereco, setCidadeEndereco] = useState(regiaoCidade)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCepLocal, setErroCepLocal] = useState<string | null>(null)

  // Região exibida reage ao CEP (ViaCEP localidade+UF); cai no valor do passo anterior.
  const regiaoEfetiva = (() => {
    const cidade = cidadeEndereco.trim()
    const estado = ufEndereco.trim()
    if (cidade && estado) return `${cidade} - ${estado}`
    if (cidade) return cidade
    return regiao
  })()

  async function buscarEndereco(valorCep: string, opts?: { manual?: boolean }) {
    const digitos = valorCep.replace(/\D/g, '')
    if (digitos.length !== 8) {
      if (opts?.manual) setErroCepLocal('Informe um CEP com 8 dígitos')
      return
    }
    setBuscandoCep(true)
    setErroCepLocal(null)
    try {
      const endereco = await buscarEnderecoPorCep(valorCep)
      if (!endereco) {
        setErroCepLocal('CEP não encontrado')
        return
      }
      // Sempre sobrescreve — um CEP novo e válido deve substituir o endereço
      // anterior na hora, mesmo que os campos já estivessem preenchidos.
      if (endereco.logradouro) setLogradouro(endereco.logradouro)
      if (endereco.bairro) setBairro(endereco.bairro)
      if (endereco.uf) setUfEndereco(endereco.uf)
      if (endereco.localidade) setCidadeEndereco(endereco.localidade)
    } finally {
      setBuscandoCep(false)
    }
  }

  // ─── Endereço por localização (GPS fresco + só campos confiáveis) ───────────
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false)
  const [erroLocalizacaoEndereco, setErroLocalizacaoEndereco] = useState<string | null>(null)
  const [msgLocalizacaoEndereco, setMsgLocalizacaoEndereco] = useState<string | null>(null)

  type CoordsComPrecisao = { lat: number; lng: number; accuracyM: number }

  /** Sempre tenta GPS fresco (maximumAge: 0). Cache do passo Região só como fallback. */
  function coordsFrescasParaEndereco(): Promise<CoordsComPrecisao | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (coordsDispositivo) {
        return Promise.resolve({ ...coordsDispositivo, accuracyM: Number.POSITIVE_INFINITY })
      }
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
          }),
        () => {
          if (coordsDispositivo) {
            resolve({ ...coordsDispositivo, accuracyM: Number.POSITIVE_INFINITY })
            return
          }
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    })
  }

  async function preencherEnderecoPelaLocalizacao() {
    setBuscandoLocalizacao(true)
    setErroLocalizacaoEndereco(null)
    setMsgLocalizacaoEndereco(null)
    setErroCepLocal(null)
    try {
      const coords = await coordsFrescasParaEndereco()
      if (!coords) {
        setErroLocalizacaoEndereco(
          'Não conseguimos acessar sua localização. Preencha pelo CEP.',
        )
        return
      }
      const achado = await reverseGeocodeEndereco(coords)
      if (!achado) {
        setErroLocalizacaoEndereco(
          'Não conseguimos resolver um endereço aqui. Preencha pelo CEP.',
        )
        return
      }

      const accuracyM = coords.accuracyM
      // GPS grosso: só cidade/UF. Rua/CEP a partir de um raio grande apontam
      // endereço errado (ex.: outro bairro na mesma cidade).
      const gpsGrosso = !Number.isFinite(accuracyM) || accuracyM > 200
      const gpsModerado = !gpsGrosso && accuracyM > 80
      const temRua = achado.precisao === 'exata' || achado.precisao === 'rua'
      const podeRua = !gpsGrosso && temRua

      const cepFinal = podeRua ? achado.cep : ''
      let logradouroFinal = podeRua ? achado.logradouro : ''
      let bairroFinal = gpsGrosso ? '' : achado.bairro
      let cidadeFinal = achado.cidade
      let ufFinal = achado.estado
      // Número só com rooftop + GPS fino (≤80m) — nunca interpolado.
      const numeroFinal =
        !gpsGrosso && !gpsModerado && achado.numero ? achado.numero : ''

      // ViaCEP confirma logradouro/bairro oficiais do CEP quando o GPS foi preciso o bastante.
      if (cepFinal) {
        const viaCep = await buscarEnderecoPorCep(cepFinal)
        if (viaCep) {
          if (viaCep.logradouro) logradouroFinal = viaCep.logradouro
          if (viaCep.bairro) bairroFinal = viaCep.bairro
          if (viaCep.localidade) cidadeFinal = viaCep.localidade
          if (viaCep.uf) ufFinal = viaCep.uf
        }
      }

      if (cepFinal) setCep(maskCep(cepFinal))
      if (logradouroFinal) setLogradouro(logradouroFinal)
      // Sem número confiável: limpa para não deixar lixo de tentativa anterior.
      setNumero(numeroFinal)
      if (bairroFinal) setBairro(bairroFinal)
      if (cidadeFinal) setCidadeEndereco(cidadeFinal)
      if (ufFinal) setUfEndereco(ufFinal)

      setErrosCampo((prev) => {
        const next = { ...prev }
        for (const campo of ['cep', 'logradouro', 'bairro', 'cidade', 'uf']) delete next[campo]
        return next
      })

      if (numeroFinal) {
        setMsgLocalizacaoEndereco(
          'Endereço detectado com precisão — confira o número e o complemento',
        )
      } else if (logradouroFinal || cepFinal) {
        setMsgLocalizacaoEndereco('Rua/CEP detectados — confira e informe o número')
      } else {
        setMsgLocalizacaoEndereco(
          'Região detectada — complete o endereço pelo CEP ou à mão',
        )
      }
    } finally {
      setBuscandoLocalizacao(false)
    }
  }

  // ─── Documentos (RG / residência) ───────────────────────────────────────────
  const [fotoDocumentoUrl, setFotoDocumentoUrl] = useState<string | undefined>()
  const cropFotoDocumento = useCroppedImageUpload({
    aspect: 4 / 3,
    purpose: 'cadastro',
    tenantId: torcida.id,
    title: 'Ajustar foto do documento',
    confirmLabel: 'Confirmar e enviar',
    onDone: ({ url }) => {
      if (url) setFotoDocumentoUrl(url)
    },
  })
  const [comprovanteResidenciaUrl, setComprovanteResidenciaUrl] = useState<string | undefined>()
  const cropComprovanteResidencia = useCroppedImageUpload({
    aspect: 4 / 3,
    purpose: 'cadastro',
    tenantId: torcida.id,
    title: 'Ajustar comprovante de residência',
    confirmLabel: 'Confirmar e enviar',
    onDone: ({ url }) => {
      if (url) setComprovanteResidenciaUrl(url)
    },
  })
  const documentosObrigatorios = torcida.exigirDocumentosCadastro
  const uploadDocsPend =
    cropComprovante.busy || cropFotoDocumento.busy || cropComprovanteResidencia.busy

  // ─── Menor de idade / responsável legal ─────────────────────────────────────
  const idadeCalculada = dataNascimento ? calcularIdadeDeInput(dataNascimento) : null
  const ehMenorDeIdade = idadeCalculada !== null && idadeCalculada < 18
  const [responsavelNome, setResponsavelNome] = useState('')
  const [responsavelDocumento, setResponsavelDocumento] = useState('')

  // ─── Termo de responsabilidade ──────────────────────────────────────────────
  const [termoAceito, setTermoAceito] = useState(false)

  const [departamentos, setDepartamentos] = useState<DepartamentoOnboarding[] | null>(null)
  const [departamentosSede, setDepartamentosSede] = useState<DepartamentoOnboarding[] | null>(null)
  // getDepartamentosDoTenant já exclui legados; filtro defensivo no client.
  const departamentosSelecionaveis =
    departamentos === null
      ? null
      : departamentos.filter((d) => !isDepartamentoLegado(d))
  const departamentosSedeSelecionaveis =
    departamentosSede === null
      ? null
      : departamentosSede.filter((d) => !isDepartamentoLegado(d))

  const unidadeSelecionada = unidadeId
    ? torcida.sedes.find((s) => s.id === unidadeId)
    : null
  const unidadePendente =
    !unidadeNaoListada && torcida.sedes.length > 1 && !unidadeId

  const vinculoEmUnidadePropria = exigeDepartamentoDaSede(
    unidadeSelecionada?.tenantId,
    torcida.id,
  )
  const nomeUnidade = unidadeSelecionada?.nome ?? 'sua unidade'
  const nomeTorcidaSede = torcida.nome
  /** Organizada "mãe" na copy (Gaviões); cai na própria torcida se o link for da Sede. */
  const nomeOrganizada = torcidaMae?.nome ?? torcida.nome
  const logoOrganizada = torcidaMae?.logoUrl ?? torcida.logoUrl
  const fotoUnidade = unidadeSelecionada?.fotoUrl ?? null

  const nomeClube = clube?.apelido?.trim() || clube?.nome || 'seu clube'

  const vinculoDraftKey = useMemo(
    () => `onboarding:vinculo-draft:${userId}:${torcida.id}`,
    [userId, torcida.id],
  )
  const [draftRestored, setDraftRestored] = useState(false)

  useEffect(() => {
    // Restore (só uma vez por mount) para não “apagar” o que já foi digitado.
    if (draftRestored) return
    if (typeof window === 'undefined') return

    try {
      const raw = window.sessionStorage.getItem(vinculoDraftKey)
      if (!raw) {
        setDraftRestored(true)
        return
      }

      const saved = JSON.parse(raw) as Partial<{
        nome: string
        telefone: string
        email: string
        cep: string
        numero: string
        bloco: string
        complemento: string
        numeroAssociado: string
        anosSocio: string
        dataExpedicaoCarteirinha: string
        periodicidadePretendida: string
        departamentoId: string
        departamentoSedeId: string
        imagemProva?: string
        dataNascimento: string
        sexo: string
        estadoCivil: string
        nacionalidade: string
        rg: string
        cpf: string
        nomePai: string
        nomeMae: string
        profissao: string
        logradouro: string
        bairro: string
        ufEndereco: string
        cidadeEndereco: string
        fotoDocumentoUrl?: string
        comprovanteResidenciaUrl?: string
        responsavelNome: string
        responsavelDocumento: string
        termoAceito: boolean
      }>

      if (typeof saved.nome === 'string') setNome(saved.nome)
      if (typeof saved.telefone === 'string') setTelefone(saved.telefone)
      if (typeof saved.email === 'string' && saved.email.trim()) setEmail(saved.email)
      else if (emailInicial) setEmail(emailInicial)
      if (typeof saved.cep === 'string') setCep(saved.cep)
      if (typeof saved.numero === 'string') setNumero(saved.numero)
      if (typeof saved.bloco === 'string') setBloco(saved.bloco)
      if (typeof saved.complemento === 'string') setComplemento(saved.complemento)
      if (typeof saved.numeroAssociado === 'string') setNumeroAssociado(saved.numeroAssociado)
      if (typeof saved.anosSocio === 'string') setAnosSocio(saved.anosSocio)
      if (typeof saved.dataExpedicaoCarteirinha === 'string')
        setDataExpedicaoCarteirinha(saved.dataExpedicaoCarteirinha)
      if (typeof saved.periodicidadePretendida === 'string')
        setPeriodicidadePretendida(saved.periodicidadePretendida)
      if (typeof saved.departamentoId === 'string') setDepartamentoId(saved.departamentoId)
      if (typeof saved.departamentoSedeId === 'string')
        setDepartamentoSedeId(saved.departamentoSedeId)
      if (typeof saved.imagemProva === 'string' || saved.imagemProva === undefined)
        setImagemProva(saved.imagemProva)

      if (typeof saved.dataNascimento === 'string') setDataNascimento(saved.dataNascimento)
      if (typeof saved.sexo === 'string') setSexo(saved.sexo)
      if (typeof saved.estadoCivil === 'string') setEstadoCivil(saved.estadoCivil)
      if (typeof saved.nacionalidade === 'string') setNacionalidade(saved.nacionalidade)
      if (typeof saved.rg === 'string') setRg(saved.rg)
      if (typeof saved.cpf === 'string') setCpf(saved.cpf)
      if (typeof saved.nomePai === 'string') setNomePai(saved.nomePai)
      if (typeof saved.nomeMae === 'string') setNomeMae(saved.nomeMae)
      if (typeof saved.profissao === 'string') setProfissao(saved.profissao)
      if (typeof saved.logradouro === 'string') setLogradouro(saved.logradouro)
      if (typeof saved.bairro === 'string') setBairro(saved.bairro)
      if (typeof saved.ufEndereco === 'string') setUfEndereco(saved.ufEndereco)
      if (typeof saved.cidadeEndereco === 'string') setCidadeEndereco(saved.cidadeEndereco)
      if (typeof saved.fotoDocumentoUrl === 'string' || saved.fotoDocumentoUrl === undefined)
        setFotoDocumentoUrl(saved.fotoDocumentoUrl)
      if (
        typeof saved.comprovanteResidenciaUrl === 'string' ||
        saved.comprovanteResidenciaUrl === undefined
      )
        setComprovanteResidenciaUrl(saved.comprovanteResidenciaUrl)
      if (typeof saved.responsavelNome === 'string') setResponsavelNome(saved.responsavelNome)
      if (typeof saved.responsavelDocumento === 'string')
        setResponsavelDocumento(saved.responsavelDocumento)
      if (typeof saved.termoAceito === 'boolean') setTermoAceito(saved.termoAceito)
    } catch {
      // Se a sessão estiver corrompida, segue com os defaults.
    } finally {
      setDraftRestored(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ok: depende só da chave
  }, [vinculoDraftKey])

  function abrirSocio(caminho: 'EXISTENTE' | 'NOVO') {
    onErro(null)
    onAbrirSocio(caminho)
  }

  useEffect(() => {
    if (modo !== 'socio' || departamentos !== null) return
    const tenantDepsId = unidadeSelecionada?.tenantId ?? torcida.id
    startTransition(async () => {
      const deps = await buscarDepartamentos(tenantDepsId)
      setDepartamentos(deps)
    })
  }, [modo, departamentos, torcida.id, unidadeSelecionada?.tenantId])

  // Áreas da sede: só quando o vínculo nasce num tenant-filho.
  useEffect(() => {
    if (modo !== 'socio' || !vinculoEmUnidadePropria || departamentosSede !== null) return
    startTransition(async () => {
      const deps = await buscarDepartamentos(torcida.id)
      setDepartamentosSede(deps)
    })
  }, [modo, vinculoEmUnidadePropria, departamentosSede, torcida.id])

  useEffect(() => {
    if (!draftRestored) return
    if (typeof window === 'undefined') return

    const saveDraft = () => {
      const draft = {
        nome,
        telefone,
        email,
        cep,
        numero,
        bloco,
        complemento,
        numeroAssociado,
        anosSocio,
        dataExpedicaoCarteirinha,
        periodicidadePretendida,
        departamentoId,
        departamentoSedeId,
        imagemProva,
        dataNascimento,
        sexo,
        estadoCivil,
        nacionalidade,
        rg,
        cpf,
        nomePai,
        nomeMae,
        profissao,
        logradouro,
        bairro,
        ufEndereco,
        cidadeEndereco,
        fotoDocumentoUrl,
        comprovanteResidenciaUrl,
        responsavelNome,
        responsavelDocumento,
        termoAceito,
      } satisfies Record<string, unknown>

      window.sessionStorage.setItem(vinculoDraftKey, JSON.stringify(draft))
    }

    const timeout = window.setTimeout(saveDraft, 250)

    return () => {
      window.clearTimeout(timeout)
      // Flush ao desmontar (voltar de passo / refresh) para não perder os últimos caracteres.
      saveDraft()
    }
  }, [
    draftRestored,
    vinculoDraftKey,
    nome,
    telefone,
    email,
    cep,
    numero,
    bloco,
    complemento,
    numeroAssociado,
    anosSocio,
    dataExpedicaoCarteirinha,
    periodicidadePretendida,
    departamentoId,
    departamentoSedeId,
    imagemProva,
    dataNascimento,
    sexo,
    estadoCivil,
    nacionalidade,
    rg,
    cpf,
    nomePai,
    nomeMae,
    profissao,
    logradouro,
    bairro,
    ufEndereco,
    cidadeEndereco,
    fotoDocumentoUrl,
    comprovanteResidenciaUrl,
    responsavelNome,
    responsavelDocumento,
    termoAceito,
  ])

  /**
   * Validação local do vínculo de sócio. Pura (só lê estado) — roda no render para
   * liberar o "Próximo" de cada aba e no submit, com as mesmas regras do Zod da action.
   */
  function validarCamposSocio(): Record<string, string[]> {
    const erros: Record<string, string[]> = {}

    // Identificação
    if (!nome.trim()) erros.nome = ['Informe seu nome completo.']
    else if (nome.trim().length < 3) erros.nome = ['Nome muito curto.']
    if (!dataNascimento) erros.dataNascimento = ['Informe sua data de nascimento.']
    else if (idadeCalculada === null || idadeCalculada < 0) {
      erros.dataNascimento = ['Data de nascimento inválida']
    } else if (idadeCalculada < 6) erros.dataNascimento = ['Idade mínima: 6 anos']
    if (!telefone) erros.telefone = ['Informe seu telefone.']
    else if (!validarTelefoneBr(telefone)) erros.telefone = ['Telefone inválido']
    if (!email.trim()) erros.email = ['Informe seu e-mail.']
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      erros.email = ['E-mail inválido']
    }
    if (!rg) erros.rg = ['Informe seu RG.']
    else if (!validarRg(rg)) erros.rg = ['RG inválido']
    if (!cpf) erros.cpf = ['Informe seu CPF.']
    else {
      const cpfNorm = normalizarCpf(cpf)
      if (!cpfNorm || !validarCpfDigitos(cpfNorm)) erros.cpf = ['CPF inválido']
    }
    if (ehMenorDeIdade) {
      if (!responsavelNome) {
        erros.responsavelNome = ['Informe o nome do responsável legal.']
      }
      if (!responsavelDocumento) {
        erros.responsavelDocumento = ['Informe o documento do responsável.']
      }
    }

    // Endereço + dados de associado
    if (!cep) erros.cep = ['Informe seu CEP.']
    else if (cep.replace(/\D/g, '').length !== 8) {
      erros.cep = ['Informe um CEP com 8 dígitos']
    }
    if (!logradouro) erros.logradouro = ['Informe o logradouro.']
    if (!cidadeEndereco) erros.cidade = ['Informe a cidade.']
    if (!bairro) erros.bairro = ['Informe o bairro.']
    if (!ufEndereco) erros.uf = ['Informe o estado (UF).']

    const jaSocio = caminhoSocio === 'EXISTENTE'
    if (jaSocio) {
      if (!numeroAssociado) {
        erros.numeroAssociado = ['Informe seu número de associado.']
      }
      if (!anosSocio) {
        erros.anosSocio = ['Informe há quantos anos é sócio da torcida.']
      } else {
        const anos = Number(anosSocio)
        if (!Number.isFinite(anos) || anos < 0 || anos > 100) {
          erros.anosSocio = ['Informe um número de anos entre 0 e 100.']
        }
      }
      if (!dataExpedicaoCarteirinha) {
        erros.dataExpedicaoCarteirinha = [
          'Informe a data da última expedição da carteirinha.',
        ]
      } else {
        const exp = parseDateOnly(dataExpedicaoCarteirinha)
        const hoje = todayPartsInZone()
        if (compareCalendarParts(exp, hoje) > 0) {
          erros.dataExpedicaoCarteirinha = [
            'A data da última expedição não pode ser futura.',
          ]
        }
      }
      if (!periodicidadePretendida) {
        erros.periodicidadePretendida = ['Informe o plano (periodicidade) do associado.']
      }
      if (!imagemProva) {
        erros.imagemProva = [
          'Envie uma foto da carteirinha ou comprovante de vínculo com a torcida.',
        ]
      }
    } else if (!caminhoSocio) {
      erros.caminhoSocio = ['Escolha se você já é sócio ou quer se associar.']
    }

    // Documentos + termo
    if (documentosObrigatorios && !fotoDocumentoUrl) {
      erros.fotoDocumentoUrl = ['Envie a foto do RG.']
    }
    if (documentosObrigatorios && !comprovanteResidenciaUrl) {
      erros.comprovanteResidenciaUrl = ['Envie o comprovante de residência.']
    }
    if (!termoAceito) {
      erros.termoResponsabilidadeAceito = [
        'É necessário aceitar o termo de responsabilidade.',
      ]
    }

    return erros
  }

  function aplicarErrosERevelar(
    erros: Record<string, string[]>,
    mensagem = 'Confira os campos destacados.',
  ) {
    setErrosCampo(erros)
    onErro(mensagem)
    // Se o primeiro erro estiver numa aba não-ativa, troca antes de rolar até ele.
    const tabDoErro = TABS_FORMULARIO_SOCIO.find((tab) =>
      Object.keys(erros).some((k) => (erros[k]?.length ?? 0) > 0 && CAMPO_TAB[k] === tab.id),
    )
    if (tabDoErro) setTabAtiva(tabDoErro.id)
    // Espera o paint com ring/role=alert (e a troca de aba) antes de rolar/focar.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => revelarPrimeiroErroCampos(erros))
    })
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
      const errosLocais = validarCamposSocio()
      if (Object.keys(errosLocais).length > 0) {
        aplicarErrosERevelar(errosLocais)
        return
      }
    }
    startTransition(async () => {
      try {
        const res = await solicitarVinculo({
          tenantId: torcida.id,
          tipo,
          // Procedência: decide se o sócio pendente acompanha o canal da
          // unidade enquanto espera aprovação (§7 22). O servidor confere o
          // slug contra a linhagem — mandar isto não basta para ganhar acesso.
          conviteSlug: conviteSlug ?? undefined,
          nome: tipo === 'SOCIO' ? nome : nome || nomeInicial || 'Torcedor',
          idade: idadeCalculada !== null ? String(idadeCalculada) : undefined,
          telefone: telefone || undefined,
          email: email.trim() || undefined,
          cidade: regiaoEfetiva || undefined,
          cep: cep || undefined,
          numero: numero || undefined,
          bloco: bloco || undefined,
          complemento: complemento || undefined,
          numeroAssociado:
            caminhoSocio === 'EXISTENTE' ? numeroAssociado || undefined : undefined,
          anosSocio: caminhoSocio === 'EXISTENTE' ? anosSocio || undefined : undefined,
          dataExpedicaoCarteirinha:
            caminhoSocio === 'EXISTENTE' ? dataExpedicaoCarteirinha || undefined : undefined,
          periodicidadePretendida:
            caminhoSocio === 'EXISTENTE'
              ? (periodicidadePretendida as
                  | 'MENSAL'
                  | 'TRIMESTRAL'
                  | 'QUADRIMENSAL'
                  | 'SEMESTRAL'
                  | 'ANUAL'
                  | 'UNICA'
                  | undefined) || undefined
              : undefined,
          caminhoSocio: caminhoSocio ?? undefined,
          imagemProva: caminhoSocio === 'EXISTENTE' ? imagemProva : undefined,
          departamentoId: departamentoId || undefined,
          departamentoSedeId: vinculoEmUnidadePropria
            ? departamentoSedeId || undefined
            : undefined,
          sedeId: unidadeId ?? undefined,
          unidadeNaoListada,
          dataNascimento: dataNascimento || undefined,
          sexo: sexo || undefined,
          estadoCivil: estadoCivil || undefined,
          nacionalidade: nacionalidade || undefined,
          rg: rg || undefined,
          cpf: cpf || undefined,
          nomePai: nomePai || undefined,
          nomeMae: nomeMae || undefined,
          profissao: profissao || undefined,
          logradouro: logradouro || undefined,
          bairro: bairro || undefined,
          uf: ufEndereco || undefined,
          fotoDocumentoUrl,
          comprovanteResidenciaUrl,
          responsavelNome: ehMenorDeIdade ? responsavelNome || undefined : undefined,
          responsavelDocumento: ehMenorDeIdade ? responsavelDocumento || undefined : undefined,
          termoResponsabilidadeAceito: tipo === 'SOCIO' ? termoAceito : undefined,
        })
        if (res?.redirectTo) {
          // Se concluiu o vínculo, limpa o rascunho local para não “puxar” valores antigos.
          window.sessionStorage.removeItem(vinculoDraftKey)
          // Evita o diálogo nativo "Sair do site?" no redirect pós-envio.
          allowUnload()
          window.location.assign(res.redirectTo)
          return
        }
        if (res?.errors) {
          aplicarErrosERevelar(res.errors)
        } else if (res?.message) {
          onErro(res.message)
        }
      } catch (err) {
        onErro(
          err instanceof Error && err.message
            ? err.message
            : 'Não foi possível enviar a solicitação. Tente de novo.',
        )
      }
    })
  }

  function onArquivo(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onErro('Selecione um arquivo de imagem.')
      return
    }
    onErro(null)
    cropComprovante.open(file)
  }

  // ─── Fluxo guiado (Identificação → Endereço → Associação → Documentos) ─────
  const errosValidacao = modo === 'socio' ? validarCamposSocio() : {}
  const abasCompletas = new Set(
    TABS_FORMULARIO_SOCIO.filter(
      (tab) => Object.keys(filtrarErrosDaAba(errosValidacao, tab.id)).length === 0,
    ).map((tab) => tab.id),
  )
  const abasPendentes = TABS_FORMULARIO_SOCIO.filter((tab) => !abasCompletas.has(tab.id))
  const indiceAbaAtiva = TABS_FORMULARIO_SOCIO.findIndex((tab) => tab.id === tabAtiva)
  const abaAnterior = indiceAbaAtiva > 0 ? TABS_FORMULARIO_SOCIO[indiceAbaAtiva - 1] : undefined
  const abaSeguinte = TABS_FORMULARIO_SOCIO[indiceAbaAtiva + 1]
  const formularioCompleto = abasPendentes.length === 0
  const errosAbaAtiva = filtrarErrosDaAba(errosValidacao, tabAtiva)
  const pendenciasAbaAtiva = Object.values(errosAbaAtiva)
    .flat()
    .filter(Boolean)

  function irParaAba(tab: TabFormularioSocio) {
    onErro(null)
    setTabAtiva(tab)
    // Volta ao topo do formulário: a aba nova monta abaixo das tabs, fora da viewport.
    requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      abasRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    })
  }

  function avancarAba() {
    if (!abaSeguinte) return
    // O botão já fica desabilitado quando a aba tem pendência; aqui é a rede de segurança.
    const errosDaAba = filtrarErrosDaAba(validarCamposSocio(), tabAtiva)
    if (Object.keys(errosDaAba).length > 0) {
      aplicarErrosERevelar(errosDaAba)
      return
    }
    irParaAba(abaSeguinte.id)
  }

  const conteudo =
    modo === 'escolha' || (modo === 'socio' && !caminhoSocio) ? (
      <div>
        <BotaoVoltar onClick={onVoltar} disabled={pending} />
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))] text-balance">
          {modo === 'socio'
            ? `Como é o seu vínculo com a ${torcida.nome}?`
            : `Como você participa da ${torcida.nome}?`}
        </h1>
        <p className="mt-1 max-w-prose text-sm text-[rgb(var(--foreground-muted))]">
          {modo === 'socio'
            ? 'Escolha se você já é sócio ou quer se associar pela primeira vez. Isso define os dados e documentos da ficha.'
            : canalRestrito
              ? `Escolha um dos dois caminhos. Com o canal restrito, sua comunidade fica na ${torcida.nome}.`
              : torcidaMae
                ? `Escolha um dos dois caminhos. Cada um define o que você vê na comunidade do ${nomeClube}, na da ${nomeOrganizada} e na da ${torcida.nome}.`
                : `Escolha um dos dois caminhos. Cada um define o que você vê na comunidade do ${nomeClube} e na da ${torcida.nome}.`}
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

        <div
          className={`mt-6 grid gap-4 ${
            modo === 'socio' ? 'lg:grid-cols-2' : 'lg:grid-cols-3'
          }`}
        >
          {/* Card 1: Torcedor da torcida — só na escolha completa (não quando
              o passo Unidade já decidiu que o caminho é de sócio). */}
          {modo === 'escolha' ? (
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
                priority
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                Entrada imediata
              </p>
              <p className="mt-1 text-lg font-semibold text-[rgb(var(--foreground))]">
                Torcedor da torcida
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                {canalRestrito
                  ? 'Entra agora na comunidade da unidade — sem aprovação nem comprovante.'
                  : 'Entra agora nas comunidades — sem aprovação nem comprovante.'}
              </p>

              <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-4 text-sm text-[rgb(var(--foreground))]">
                {canalRestrito ? (
                  <>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                      <span>
                        Espaço aberto da <strong>{nomeUnidade}</strong> (eventos e
                        novidades)
                      </span>
                    </li>
                    <li className="flex gap-2 text-[rgb(var(--foreground-muted))]">
                      <X className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                      <span>
                        Sem feed da <strong>{nomeOrganizada}</strong> nem da
                        comunidade nacional
                      </span>
                    </li>
                    <li className="flex gap-2 text-[rgb(var(--foreground-muted))]">
                      <X className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                      <span>Sem mural exclusivo de sócios</span>
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                      <span>
                        Comunidade do <strong>{nomeClube}</strong> (feed nacional)
                      </span>
                    </li>
                    {torcidaMae ? (
                      <li className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                        <span>
                          Comunidade da <strong>{nomeOrganizada}</strong>
                        </span>
                      </li>
                    ) : null}
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                      <span>
                        Espaço aberto da <strong>{torcida.nome}</strong> (eventos e
                        novidades)
                      </span>
                    </li>
                    <li className="flex gap-2 text-[rgb(var(--foreground-muted))]">
                      <X className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                      <span>Sem mural exclusivo de sócios</span>
                    </li>
                  </>
                )}
              </ul>

              <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-[rgb(var(--color-primary-fg))]">
                Entrar agora
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
          ) : null}

          {/* Card 2: Já sou sócio */}
          <button
            type="button"
            onClick={() => abrirSocio('EXISTENTE')}
            disabled={pending}
            className="group flex h-full items-stretch overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:opacity-50"
          >
            <div className="relative flex w-[6.5rem] shrink-0 items-center justify-center self-stretch border-r border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3 sm:w-[7.5rem]">
              <EscudoClube
                nome={nomeOrganizada}
                escudoUrl={logoOrganizada}
                size="xl"
                priority
              />
              <span
                className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--color-primary))] text-white shadow-sm ring-2 ring-[rgb(var(--surface))]"
                aria-hidden
              >
                <BadgeCheck className="h-3.5 w-3.5" />
              </span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Requer aprovação
              </p>
              <p className="mt-1 text-lg font-semibold text-[rgb(var(--foreground))]">
                Já sou sócio
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                Nº, expedição da carteirinha e plano — após aprovação a carteirinha digital já nasce vigente.
              </p>

              <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-4 text-sm text-[rgb(var(--foreground))]">
                {canalRestrito ? (
                  <>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                      <span>
                        Mural interno de sócios da <strong>{nomeUnidade}</strong>
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                      <span>Carteirinha, benefícios e posts exclusivos</span>
                    </li>
                    <li className="flex gap-2 text-[rgb(var(--foreground-muted))]">
                      <X className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                      <span>
                        Sem interação com a comunidade da{' '}
                        <strong>{nomeOrganizada}</strong> nem o feed nacional
                        (canal restrito)
                      </span>
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                      <span>
                        Comunidade do <strong>{nomeClube}</strong>
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                      <span>
                        Mural interno de sócios da <strong>{nomeUnidade}</strong>
                      </span>
                    </li>
                    {torcidaMae ? (
                      <li className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                        <span>
                          Também interage com a comunidade da{' '}
                          <strong>{nomeOrganizada}</strong>
                        </span>
                      </li>
                    ) : null}
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                      <span>Carteirinha, benefícios e posts exclusivos</span>
                    </li>
                  </>
                )}
              </ul>

              <div className="mt-auto flex items-end justify-between gap-4 pt-5">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[rgb(var(--color-primary-fg))]">
                  Continuar
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>

                {fotoUnidade ? (
                  <span className="relative block h-20 w-20 shrink-0">
                    <LogoImage
                      src={fotoUnidade}
                      alt={`Foto da unidade ${nomeUnidade}`}
                      fill
                      sizes="80px"
                      className="object-contain"
                    />
                  </span>
                ) : null}
              </div>
            </div>
          </button>

          {/* Card 3: Quero me associar */}
          <button
            type="button"
            onClick={() => abrirSocio('NOVO')}
            disabled={pending}
            className="group flex h-full items-stretch overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] disabled:opacity-50"
          >
            <div className="relative flex w-[6.5rem] shrink-0 items-center justify-center self-stretch border-r border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3 sm:w-[7.5rem]">
              <EscudoClube
                nome={nomeOrganizada}
                escudoUrl={logoOrganizada}
                size="xl"
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
                Quero me associar
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                Primeira associação — ficha completa. A carteirinha é emitida pela diretoria após a aprovação.
              </p>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-[rgb(var(--color-primary-fg))]">
                Continuar
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        </div>
      </div>
    ) : (
      // Formulário de sócio
      <div>
      <BotaoVoltar onClick={onVoltar} disabled={pending} label="Voltar" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
            {caminhoSocio === 'NOVO' ? 'Quero me associar' : 'Já sou sócio'}
          </h1>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            {caminhoSocio === 'NOVO'
              ? `Preencha a ficha. Após a aprovação, a liderança da ${torcida.nome} emite a carteirinha.`
              : `Informe nº, expedição e plano. A liderança da ${torcida.nome} confere e ativa sua carteirinha digital.`}
          </p>
        </div>
        <EscudoClube nome={nomeOrganizada} escudoUrl={logoOrganizada} size="xl" />
      </div>

      <div className="mt-6 space-y-4">
        <UnidadeInfoBox
          unidadeSelecionada={unidadeSelecionada}
          unidadeNaoListada={unidadeNaoListada}
        />

        {/* ─── Abas: Identificação / Endereço / Associação / Documentos ────── */}
        <div ref={abasRef} className="scroll-mt-6">
          <TabsFormularioSocio
            ativa={tabAtiva}
            onMudar={setTabAtiva}
            erros={errosCampo}
            completas={abasCompletas}
          />
        </div>

        <SecaoFormulario
          titulo="Identificação"
          oculta={tabAtiva !== 'identificacao'}
        >
          <Campo name="nome" label="Nome completo" obrigatorio erros={errosCampo.nome}>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              name="dataNascimento"
              label="Data de nascimento"
              obrigatorio
              erros={errosCampo.dataNascimento}
            >
              <DatePicker
                value={dataNascimento}
                onChange={setDataNascimento}
                maxToday
                aria-label="Data de nascimento"
              />
            </Campo>
            <Campo
              name="telefone"
              label="Telefone / WhatsApp"
              obrigatorio
              erros={errosCampo.telefone}
            >
              <Input
                type="tel"
                maxLength={16}
                value={telefone}
                onChange={(e) => setTelefone(maskTelefone(e.target.value))}
                placeholder="(11) 99999-9999"
                autoComplete="tel"
              />
            </Campo>
          </div>

          <Campo name="email" label="E-mail" obrigatorio erros={errosCampo.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              readOnly={Boolean(emailInicial.trim())}
              className={
                emailInicial.trim()
                  ? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'
                  : undefined
              }
            />
            {emailInicial.trim() ? (
              <p className="mt-1 text-[11px] text-[rgb(var(--foreground-muted))]">
                E-mail da sua conta — não pode ser de outro cadastro.
              </p>
            ) : null}
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo name="sexo" label="Sexo" erros={errosCampo.sexo}>
              <Select value={sexo} onChange={(e) => setSexo(e.target.value)}>
                <option value="">Selecione (opcional)</option>
                <option value="Masculino">Masculino</option>
                <option value="Feminino">Feminino</option>
                <option value="Prefiro não informar">Prefiro não informar</option>
              </Select>
            </Campo>
            <Campo name="estadoCivil" label="Estado civil" erros={errosCampo.estadoCivil}>
              <Select value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)}>
                <option value="">Selecione (opcional)</option>
                <option value="Solteiro(a)">Solteiro(a)</option>
                <option value="Casado(a)">Casado(a)</option>
                <option value="Divorciado(a)">Divorciado(a)</option>
                <option value="Viúvo(a)">Viúvo(a)</option>
                <option value="Outro">Outro</option>
              </Select>
            </Campo>
          </div>

          <Campo name="nacionalidade" label="Nacionalidade" erros={errosCampo.nacionalidade}>
            <Input
              value={nacionalidade}
              onChange={(e) => setNacionalidade(e.target.value)}
              placeholder="Brasileira"
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo name="rg" label="RG" obrigatorio erros={errosCampo.rg}>
              <Input
                inputMode="text"
                autoComplete="off"
                maxLength={12}
                value={rg}
                onChange={(e) => {
                  const masked = maskRg(e.target.value)
                  setRg(masked)
                  if (errosCampo.rg) {
                    setErrosCampo((prev) => {
                      const next = { ...prev }
                      delete next.rg
                      return next
                    })
                  }
                }}
                onBlur={() => {
                  if (!rg) return
                  if (!validarRg(rg)) {
                    setErrosCampo((prev) => ({ ...prev, rg: ['RG inválido'] }))
                  }
                }}
                placeholder="00.000.000-0"
              />
            </Campo>
            <Campo name="cpf" label="CPF" obrigatorio erros={errosCampo.cpf}>
              <Input
                inputMode="numeric"
                maxLength={14}
                value={cpf}
                onChange={(e) => {
                  const masked = maskCpf(e.target.value)
                  setCpf(masked)
                  if (errosCampo.cpf) {
                    setErrosCampo((prev) => {
                      const next = { ...prev }
                      delete next.cpf
                      return next
                    })
                  }
                }}
                onBlur={() => {
                  if (!cpf) return
                  const n = normalizarCpf(cpf)
                  if (!n || !validarCpfDigitos(n)) {
                    setErrosCampo((prev) => ({ ...prev, cpf: ['CPF inválido'] }))
                  }
                }}
                placeholder="000.000.000-00"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo name="nomePai" label="Nome do pai" erros={errosCampo.nomePai}>
              <Input value={nomePai} onChange={(e) => setNomePai(e.target.value)} placeholder="Opcional" />
            </Campo>
            <Campo name="nomeMae" label="Nome da mãe" erros={errosCampo.nomeMae}>
              <Input value={nomeMae} onChange={(e) => setNomeMae(e.target.value)} placeholder="Opcional" />
            </Campo>
          </div>

          <Campo name="profissao" label="Profissão" erros={errosCampo.profissao}>
            <Input
              value={profissao}
              onChange={(e) => setProfissao(e.target.value)}
              placeholder="Opcional"
            />
          </Campo>
        </SecaoFormulario>

        {/* ─── Autorização do responsável (só menor de idade) ───────────────── */}
        {ehMenorDeIdade && tabAtiva === 'identificacao' && (
          <SecaoFormulario titulo="Autorização do responsável">
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Por ser menor de idade, é necessária a autorização de um responsável legal
              para participar de atividades e caravanas da torcida.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                name="responsavelNome"
                label="Nome do responsável"
                obrigatorio
                erros={errosCampo.responsavelNome}
              >
                <Input
                  value={responsavelNome}
                  onChange={(e) => setResponsavelNome(e.target.value)}
                  placeholder="Nome completo"
                />
              </Campo>
              <Campo
                name="responsavelDocumento"
                label="Documento do responsável"
                obrigatorio
                erros={errosCampo.responsavelDocumento}
              >
                <Input
                  value={responsavelDocumento}
                  onChange={(e) => setResponsavelDocumento(e.target.value)}
                  placeholder="RG ou CPF"
                />
              </Campo>
            </div>
          </SecaoFormulario>
        )}

        {/* ─── Endereço ──────────────────────────────────────────────────── */}
        <SecaoFormulario titulo="Endereço" oculta={tabAtiva !== 'endereco'}>
          {regiaoEfetiva && (
            <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
              <span className="font-medium text-[rgb(var(--foreground))]">Região:</span>{' '}
              {regiaoEfetiva}
            </p>
          )}

          {isGoogleMapsConfigured() && (
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3">
              <button
                type="button"
                onClick={() => void preencherEnderecoPelaLocalizacao()}
                disabled={buscandoLocalizacao}
                className="inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--color-primary-fg))] transition-colors hover:underline disabled:opacity-50"
              >
                {buscandoLocalizacao ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LocateFixed className="h-4 w-4" aria-hidden="true" />
                )}
                {buscandoLocalizacao ? 'Buscando endereço…' : 'Preencher pela minha localização'}
              </button>
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                Usa GPS atual com alta precisão. Preenche só o que der para
                confirmar — número só quando a posição for exata. Confira antes de seguir.
              </p>
              {msgLocalizacaoEndereco && (
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-success-fg))]"
                >
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {msgLocalizacaoEndereco}
                </p>
              )}
              {erroLocalizacaoEndereco && (
                <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {erroLocalizacaoEndereco}
                </p>
              )}
            </div>
          )}

          <Campo
            name="cep"
            label="CEP"
            obrigatorio
            erros={erroCepLocal ? [erroCepLocal] : errosCampo.cep}
          >
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                maxLength={9}
                value={cep}
                onChange={(e) => {
                  const masked = maskCep(e.target.value)
                  setCep(masked)
                  setErroCepLocal(null)
                  if (errosCampo.cep) {
                    setErrosCampo((prev) => {
                      const next = { ...prev }
                      delete next.cep
                      return next
                    })
                  }
                  const digitos = masked.replace(/\D/g, '')
                  if (digitos.length === 8) void buscarEndereco(masked)
                }}
                onBlur={() => void buscarEndereco(cep)}
                placeholder="00000-000"
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={() => void buscarEndereco(cep, { manual: true })}
                disabled={buscandoCep || cep.replace(/\D/g, '').length !== 8}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Buscar endereço pelo CEP"
              >
                {buscandoCep ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Buscar
              </button>
            </div>
            {buscandoCep && (
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">Buscando endereço…</p>
            )}
          </Campo>

          <Campo name="logradouro" label="Logradouro" obrigatorio erros={errosCampo.logradouro}>
            <Input
              value={logradouro}
              onChange={(e) => setLogradouro(e.target.value)}
              placeholder="Rua, avenida…"
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo name="numero" label="Número" erros={errosCampo.numero}>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 120" />
            </Campo>
            <Campo name="bloco" label="Bloco" erros={errosCampo.bloco}>
              <Input value={bloco} onChange={(e) => setBloco(e.target.value)} placeholder="Opcional" />
            </Campo>
            <Campo name="complemento" label="Complemento" erros={errosCampo.complemento}>
              <Input
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                placeholder="Opcional"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo name="cidade" label="Cidade" obrigatorio erros={errosCampo.cidade}>
              <Input
                value={cidadeEndereco}
                onChange={(e) => setCidadeEndereco(e.target.value)}
                placeholder="Cidade"
              />
            </Campo>
            <Campo name="bairro" label="Bairro" obrigatorio erros={errosCampo.bairro}>
              <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bairro" />
            </Campo>
            <Campo name="uf" label="UF" obrigatorio erros={errosCampo.uf}>
              <Input
                maxLength={2}
                value={ufEndereco}
                onChange={(e) => setUfEndereco(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                placeholder="SP"
              />
            </Campo>
          </div>
        </SecaoFormulario>

        {/* ─── Associação ────────────────────────────────────────────────── */}
        <SecaoFormulario titulo="Associação" oculta={tabAtiva !== 'associacao'}>
          {caminhoSocio === 'NOVO' ? (
            <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
              Na primeira associação a diretoria atribui o número e emite a
              carteirinha depois da aprovação. Aqui você só declara a área
              pretendida (opcional).
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                name="numeroAssociado"
                label="Nº de associado"
                obrigatorio
                erros={errosCampo.numeroAssociado}
              >
                <Input
                  inputMode="numeric"
                  maxLength={7}
                  value={numeroAssociado}
                  onChange={(e) => {
                    setNumeroAssociado(e.target.value.replace(/\D/g, '').slice(0, 7))
                    if (errosCampo.numeroAssociado) {
                      setErrosCampo((prev) => {
                        const next = { ...prev }
                        delete next.numeroAssociado
                        return next
                      })
                    }
                  }}
                  placeholder="Até 7 dígitos"
                />
              </Campo>
              <Campo
                name="anosSocio"
                label="Há quantos anos é sócio"
                obrigatorio
                erros={errosCampo.anosSocio}
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={anosSocio}
                  onChange={(e) => setAnosSocio(e.target.value)}
                  placeholder="Ex: 3"
                />
              </Campo>
              <Campo
                name="dataExpedicaoCarteirinha"
                label="Data da última expedição da carteirinha"
                hint="Pagamento mais recente de renovação do seu vínculo associativo vigente."
                obrigatorio
                erros={errosCampo.dataExpedicaoCarteirinha}
              >
                <DatePicker
                  value={dataExpedicaoCarteirinha}
                  onChange={setDataExpedicaoCarteirinha}
                  maxToday
                  aria-label="Data da última expedição da carteirinha"
                />
              </Campo>
              <Campo
                name="periodicidadePretendida"
                label="Plano (periodicidade)"
                obrigatorio
                erros={errosCampo.periodicidadePretendida}
              >
                <Select
                  value={periodicidadePretendida}
                  onChange={(e) => setPeriodicidadePretendida(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {resolverPeriodicidadesOnboarding(torcida.periodicidadesOnboarding).map(
                    (p) => (
                      <option key={p} value={p}>
                        {PERIODICIDADE_PLANO_LABEL[p] ?? p}
                      </option>
                    ),
                  )}
                </Select>
              </Campo>
            </div>
          )}

          {departamentosSelecionaveis !== null && departamentosSelecionaveis.length > 0 && (
            <Campo
              name="departamentoId"
              label={
                vinculoEmUnidadePropria
                  ? `Departamento na sua unidade — ${nomeUnidade}`
                  : 'Departamento pretendido'
              }
              erros={errosCampo.departamentoId}
            >
              <Select value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}>
                <option value="">Selecione (opcional)</option>
                {departamentosSelecionaveis.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                Informativo para a diretoria — só entra na equipe após aprovação.
              </p>
            </Campo>
          )}

          {/* Cada nível da hierarquia tem seus próprios departamentos: quem
              entra por uma unidade com portal próprio declara a área nos dois,
              e o papel (membro ou gestor) é decidido por cada diretoria. */}
          {vinculoEmUnidadePropria &&
            departamentosSedeSelecionaveis !== null &&
            departamentosSedeSelecionaveis.length > 0 && (
              <Campo
                name="departamentoSedeId"
                label={`Departamento na sede — ${nomeTorcidaSede}`}
                erros={errosCampo.departamentoSedeId}
              >
                <Select
                  value={departamentoSedeId}
                  onChange={(e) => setDepartamentoSedeId(e.target.value)}
                >
                  <option value="">Selecione (opcional)</option>
                  {departamentosSedeSelecionaveis.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                  Você pode atuar em áreas diferentes em cada nível — por exemplo, da
                  bateria na sede e gestor da bateria na sua unidade. Deixe em branco se
                  atua só na unidade.
                </p>
              </Campo>
            )}
        </SecaoFormulario>

        {/* ─── Documentos ────────────────────────────────────────────────── */}
        <SecaoFormulario titulo="Documentos" oculta={tabAtiva !== 'documentos'}>
          {caminhoSocio === 'EXISTENTE' ? (
            <div>
              <BlocoImagemProva
                imagemProva={imagemProva}
                uploadPend={cropComprovante.busy}
                erros={errosCampo.imagemProva}
                onArquivo={onArquivo}
                onLimpar={() => setImagemProva(undefined)}
              />
              <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                Usado só para validar seu vínculo com a torcida; não fica visível a outros associados.
              </p>
            </div>
          ) : null}

          <div
            data-campo="fotoDocumentoUrl"
            className={
              errosCampo.fotoDocumentoUrl?.[0]
                ? 'rounded-xl bg-red-500/[0.04] p-2 -m-2 ring-2 ring-red-500/45'
                : undefined
            }
          >
            <ImageDropZone
              layout="split"
              label={
                <>
                  Foto do RG
                  {documentosObrigatorios ? (
                    <span className="text-red-500"> *</span>
                  ) : (
                    <span className="font-normal text-[rgb(var(--foreground-muted))]">
                      {' '}
                      (opcional)
                    </span>
                  )}
                </>
              }
              busy={cropFotoDocumento.busy}
              cameraLabel="Tirar foto"
              formatsHint={
                documentosObrigatorios
                  ? 'JPEG, PNG ou WebP, até 10 MB — ajuste o enquadramento antes do envio'
                  : 'JPEG, PNG ou WebP — pode ser enviada depois'
              }
              file={
                fotoDocumentoUrl
                  ? {
                      name: 'documento.jpg',
                      status: cropFotoDocumento.busy ? 'uploading' : 'done',
                      previewUrl: fotoDocumentoUrl,
                    }
                  : null
              }
              onClear={fotoDocumentoUrl ? () => setFotoDocumentoUrl(undefined) : undefined}
              onFile={(file) => cropFotoDocumento.open(file)}
            />
            {errosCampo.fotoDocumentoUrl?.[0] && (
              <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errosCampo.fotoDocumentoUrl[0]}
              </p>
            )}
          </div>

          <div
            data-campo="comprovanteResidenciaUrl"
            className={
              errosCampo.comprovanteResidenciaUrl?.[0]
                ? 'rounded-xl bg-red-500/[0.04] p-2 -m-2 ring-2 ring-red-500/45'
                : undefined
            }
          >
            <ImageDropZone
              layout="split"
              label={
                <>
                  Comprovante de residência
                  {documentosObrigatorios ? (
                    <span className="text-red-500"> *</span>
                  ) : (
                    <span className="font-normal text-[rgb(var(--foreground-muted))]">
                      {' '}
                      (opcional)
                    </span>
                  )}
                </>
              }
              busy={cropComprovanteResidencia.busy}
              cameraLabel="Tirar foto"
              formatsHint={
                documentosObrigatorios
                  ? 'JPEG, PNG ou WebP, até 10 MB — ajuste o enquadramento antes do envio'
                  : 'JPEG, PNG ou WebP — pode ser solicitado depois'
              }
              file={
                comprovanteResidenciaUrl
                  ? {
                      name: 'comprovante-residencia.jpg',
                      status: cropComprovanteResidencia.busy ? 'uploading' : 'done',
                      previewUrl: comprovanteResidenciaUrl,
                    }
                  : null
              }
              onClear={
                comprovanteResidenciaUrl ? () => setComprovanteResidenciaUrl(undefined) : undefined
              }
              onFile={(file) => cropComprovanteResidencia.open(file)}
            />
            {errosCampo.comprovanteResidenciaUrl?.[0] && (
              <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errosCampo.comprovanteResidenciaUrl[0]}
              </p>
            )}
          </div>
        </SecaoFormulario>

        {/* ─── Termo de responsabilidade (fecha a última aba) ─────────────── */}
        {tabAtiva === 'documentos' && (
          <div
            data-campo="termoResponsabilidadeAceito"
            className={
              errosCampo.termoResponsabilidadeAceito?.[0]
                ? 'rounded-xl bg-red-500/[0.04] p-1 ring-2 ring-red-500/45'
                : undefined
            }
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
              <input
                type="checkbox"
                checked={termoAceito}
                onChange={(e) => {
                  setTermoAceito(e.target.checked)
                  if (errosCampo.termoResponsabilidadeAceito) {
                    setErrosCampo((prev) => {
                      const next = { ...prev }
                      delete next.termoResponsabilidadeAceito
                      return next
                    })
                  }
                }}
                className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
              />
              <span className="min-w-0 text-sm text-[rgb(var(--foreground))]">
                Declaro que serei responsável pelos meus atos ao usar os símbolos da torcida em
                jogos e eventos, e concordo em receber comunicações da torcida.
              </span>
            </label>
            {errosCampo.termoResponsabilidadeAceito?.[0] && (
              <p role="alert" className="mt-1 px-1 text-xs text-red-600 dark:text-red-400">
                {errosCampo.termoResponsabilidadeAceito[0]}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {abaAnterior ? (
            <BotaoAbaAnterior
              label={abaAnterior.label}
              onClick={() => irParaAba(abaAnterior.id)}
              disabled={pending}
            />
          ) : (
            <span />
          )}
          {abaSeguinte ? (
            <BotaoPrimario
              onClick={avancarAba}
              disabled={pending}
              label={`Próximo: ${abaSeguinte.label}`}
            />
          ) : (
            <BotaoPrimario
              onClick={() => enviar('SOCIO')}
              pending={pending || uploadDocsPend}
              disabled={!formularioCompleto}
              label="Enviar solicitação"
            />
          )}
        </div>
        {pendenciasAbaAtiva.length > 0 ? (
          <p className="text-right text-xs text-[rgb(var(--foreground-muted))]">
            {pendenciasAbaAtiva[0]}
            {pendenciasAbaAtiva.length > 1
              ? ` (+${pendenciasAbaAtiva.length - 1})`
              : ''}
          </p>
        ) : !abaSeguinte && !formularioCompleto ? (
          <p className="text-right text-xs text-[rgb(var(--foreground-muted))]">
            Falta preencher: {abasPendentes.map((tab) => tab.label).join(', ')}.
          </p>
        ) : null}
        <p className="text-center text-sm text-[rgb(var(--foreground-muted))]">
          Não é sócio da organizada?{' '}
          <button
            type="button"
            onClick={() => enviar('TORCEDOR')}
            disabled={pending || unidadePendente}
            className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline disabled:opacity-50"
          >
            Entrar só como torcedor da torcida
          </button>
          {' '}
          (sem aprovação nem mural exclusivo).
        </p>
      </div>
      </div>
    )

  return (
    <>
      {cropComprovante.dialog}
      {cropFotoDocumento.dialog}
      {cropComprovanteResidencia.dialog}
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
    </>
  )
}

// ─── Peças compartilhadas ───────────────────────────────────────────────────────

const TIPO_SEDE_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

/** Info-box da unidade escolhida (ou pendente de cadastro), com link para o mapa. */
/** Sub-seção visual do passo Vínculo (Identificação, Endereço, Associação…). */
function SecaoFormulario({
  titulo,
  oculta,
  children,
}: {
  titulo: string
  /** Painel de aba não-ativa: fica desmontado (estado dos campos vive no wizard, não aqui). */
  oculta?: boolean
  children: React.ReactNode
}) {
  if (oculta) return null
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</p>
      <div className="mt-3 space-y-4">{children}</div>
    </div>
  )
}

type TabFormularioSocio = 'identificacao' | 'endereco' | 'associacao' | 'documentos'

const TABS_FORMULARIO_SOCIO: { id: TabFormularioSocio; label: string; icon: typeof User }[] = [
  { id: 'identificacao', label: 'Identificação', icon: User },
  { id: 'endereco', label: 'Endereço', icon: MapPin },
  { id: 'associacao', label: 'Associação', icon: BadgeCheck },
  { id: 'documentos', label: 'Documentos', icon: FileText },
]

/** Mapa campo → aba, usado para revelar a aba certa quando o submit falha. */
const CAMPO_TAB: Record<string, TabFormularioSocio> = {
  nome: 'identificacao',
  dataNascimento: 'identificacao',
  telefone: 'identificacao',
  email: 'identificacao',
  sexo: 'identificacao',
  estadoCivil: 'identificacao',
  nacionalidade: 'identificacao',
  rg: 'identificacao',
  cpf: 'identificacao',
  nomePai: 'identificacao',
  nomeMae: 'identificacao',
  profissao: 'identificacao',
  responsavelNome: 'identificacao',
  responsavelDocumento: 'identificacao',
  cep: 'endereco',
  logradouro: 'endereco',
  numero: 'endereco',
  bloco: 'endereco',
  complemento: 'endereco',
  cidade: 'endereco',
  bairro: 'endereco',
  uf: 'endereco',
  numeroAssociado: 'associacao',
  anosSocio: 'associacao',
  dataExpedicaoCarteirinha: 'associacao',
  periodicidadePretendida: 'associacao',
  caminhoSocio: 'associacao',
  departamentoId: 'associacao',
  departamentoSedeId: 'associacao',
  imagemProva: 'documentos',
  fotoDocumentoUrl: 'documentos',
  comprovanteResidenciaUrl: 'documentos',
  termoResponsabilidadeAceito: 'documentos',
}

/** Recorta um mapa de erros só com os campos que pertencem a uma aba. */
function filtrarErrosDaAba(
  erros: Record<string, string[]>,
  tab: TabFormularioSocio,
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [campo, mensagens] of Object.entries(erros)) {
    if ((mensagens?.length ?? 0) > 0 && CAMPO_TAB[campo] === tab) out[campo] = mensagens
  }
  return out
}

/** Navegação em abas do formulário de sócio — sinaliza aba concluída e aba com erro. */
function TabsFormularioSocio({
  ativa,
  onMudar,
  erros,
  completas,
}: {
  ativa: TabFormularioSocio
  onMudar: (tab: TabFormularioSocio) => void
  erros: Record<string, string[]>
  completas: Set<TabFormularioSocio>
}) {
  const camposComErro = new Set(
    Object.keys(erros).filter((k) => (erros[k]?.length ?? 0) > 0),
  )
  return (
    <div
      role="tablist"
      aria-label="Seções do formulário"
      // 4 abas não cabem lado a lado em telas estreitas: rola em vez de
      // espremer o rótulo até virar reticência.
      className="flex gap-1 overflow-x-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible"
    >
      {TABS_FORMULARIO_SOCIO.map((tab) => {
        const Icon = tab.icon
        // Erro tem prioridade sobre o check: erro da action (CPF/RG duplicado) passa
        // pela validação local, e é ele que precisa aparecer.
        const temErro = Array.from(camposComErro).some((c) => CAMPO_TAB[c] === tab.id)
        const completa = !temErro && completas.has(tab.id)
        const ativaAgora = ativa === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={ativaAgora}
            onClick={() => onMudar(tab.id)}
            className={`relative flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors sm:px-2 ${
              ativaAgora
                ? 'bg-[rgb(var(--color-primary))] text-white'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{tab.label}</span>
            {temErro && (
              <span
                aria-hidden
                className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${
                  ativaAgora ? 'bg-white' : 'bg-red-500'
                }`}
              />
            )}
            {completa && (
              <Check
                aria-hidden
                className={`absolute right-1 top-1 h-3 w-3 ${
                  ativaAgora ? 'text-white' : 'text-[rgb(var(--color-primary-fg))]'
                }`}
              />
            )}
            {completa && <span className="sr-only">— concluída</span>}
          </button>
        )
      })}
    </div>
  )
}

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
              className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
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
  onLimpar,
}: {
  imagemProva?: string
  uploadPend: boolean
  erros?: string[]
  onArquivo: (file: File | undefined) => void
  onLimpar: () => void
}) {
  const hasError = Boolean(erros?.[0])
  return (
    <div
      data-campo="imagemProva"
      className={
        hasError
          ? 'rounded-xl bg-red-500/[0.04] p-2 -m-2 ring-2 ring-red-500/45'
          : undefined
      }
    >
      <ImageDropZone
        layout="split"
        label={
          <>
            Foto da carteirinha ou comprovante de vínculo <span className="text-red-500">*</span>
          </>
        }
        busy={uploadPend}
        cameraLabel="Tirar foto"
        formatsHint="JPEG, PNG ou WebP, até 10 MB — ajuste o enquadramento antes do envio"
        file={
          imagemProva
            ? {
                name: 'comprovante.jpg',
                status: uploadPend ? 'uploading' : 'done',
                previewUrl: imagemProva,
              }
            : null
        }
        onClear={imagemProva ? onLimpar : undefined}
        onFile={(file) => onArquivo(file)}
      />
      {erros?.[0] && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {erros[0]}
        </p>
      )}
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
      className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  )
}

/** Volta uma aba do formulário de sócio (secundário — não sai do passo). */
function BotaoAbaAnterior({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:cursor-not-allowed disabled:opacity-50"
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
      className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
      {!pending && <ArrowRight className="h-4 w-4" />}
    </button>
  )
}

function Campo({
  name,
  label,
  hint,
  obrigatorio,
  erros,
  children,
}: {
  /** Chave do campo — usada para scroll/foco quando há erro no submit. */
  name?: string
  label: string
  hint?: string
  obrigatorio?: boolean
  erros?: string[]
  children: React.ReactNode
}) {
  const hasError = Boolean(erros && erros.length > 0)
  const erroId = useId()
  const hintId = useId()
  return (
    <div
      data-campo={name}
      className={
        hasError
          ? 'rounded-xl bg-red-500/[0.04] p-2 -m-2 ring-2 ring-red-500/45'
          : undefined
      }
    >
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        {label} {obrigatorio && <span className="text-red-500">*</span>}
      </label>
      {hint ? (
        <p id={hintId} className="mb-1.5 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          {hint}
        </p>
      ) : null}
      {children}
      {hasError && (
        <p
          id={erroId}
          role="alert"
          className="mt-1 text-xs text-red-600 dark:text-red-400"
        >
          {erros![0]}
        </p>
      )}
    </div>
  )
}

/** Rola até o primeiro campo com erro (ordem do DOM) e foca o controle. */
function revelarPrimeiroErroCampos(erros: Record<string, string[]>) {
  if (typeof document === 'undefined') return
  const keys = Object.keys(erros).filter((k) => (erros[k]?.length ?? 0) > 0)
  if (keys.length === 0) return

  const nodes = document.querySelectorAll<HTMLElement>('[data-campo]')
  let target: HTMLElement | null = null
  for (const node of nodes) {
    const campo = node.dataset.campo
    if (campo && keys.includes(campo)) {
      target = node
      break
    }
  }
  if (!target) {
    target = document.querySelector<HTMLElement>(`[data-campo="${CSS.escape(keys[0]!)}"]`)
  }
  if (!target) return

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
  const focusable = target.querySelector<HTMLElement>(
    'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])',
  )
  focusable?.focus({ preventScroll: true })
}
