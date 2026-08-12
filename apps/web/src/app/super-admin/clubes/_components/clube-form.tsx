'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { m } from 'motion/react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  MapPin,
  Shield,
  Sparkles,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  CAMPOS_COMPLETUDE_CLUBE,
  SERIES_CLUBE,
  TORCEDORES_ESTIMADOS_TIPOS,
  apelidoClube,
  completudeClube,
  rotuloSerieClube,
  rotuloTipoEstimativa,
  slugClube,
} from '@torcida/types'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { BandeiraEstado } from '@/components/onboarding/bandeira-estado'
import { MapaBrasilUfPicker } from '@/components/onboarding/mapa-brasil-uf-picker'
import { ComboboxRegiao } from '@/app/onboarding/combobox-regiao'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import { formatTorcedoresEstimados } from '@/lib/format-contagem'
import { NOME_UF } from '@/lib/regioes-brasil'
import { springSnappy } from '@/lib/motion-presets'
import { atualizarClubeAction, criarClubeAction, type ResultadoAcao } from '../actions'

export interface ClubeFormValores {
  id?: string
  nome: string
  apelido: string
  slug: string
  serie: string
  estado: string
  cidade: string
  escudoUrl: string
  apiExternalId: string
  torcedoresEstimados: string
  torcedoresEstimadosFonte: string
  torcedoresEstimadosTipo: string
}

export const CLUBE_FORM_VAZIO: ClubeFormValores = {
  nome: '',
  apelido: '',
  slug: '',
  serie: 'OUTRA',
  estado: '',
  cidade: '',
  escudoUrl: '',
  apiExternalId: '',
  torcedoresEstimados: '',
  torcedoresEstimadosFonte: '',
  torcedoresEstimadosTipo: '',
}

interface Props {
  /** Ausente = criação. */
  inicial?: ClubeFormValores
  /** Após criar, navega para o detalhe do clube novo. */
  aoCriar?: (clubeId: string) => void
}

type ClubeStepId = 'identidade' | 'praca' | 'catalogo' | 'base'

const CLUBE_STEPS: Array<{
  id: ClubeStepId
  label: string
  short: string
  description: string
  icon: typeof Shield
  errorKeys: string[]
}> = [
  {
    id: 'identidade',
    label: 'Identidade',
    short: '1',
    description: 'Nome, apelido e escudo',
    icon: Shield,
    errorKeys: ['nome', 'apelido', 'escudoUrl'],
  },
  {
    id: 'praca',
    label: 'Praça',
    short: '2',
    description: 'UF no mapa e cidade IBGE',
    icon: MapPin,
    errorKeys: ['estado', 'cidade'],
  },
  {
    id: 'catalogo',
    label: 'Catálogo',
    short: '3',
    description: 'Slug e série',
    icon: Database,
    errorKeys: ['slug', 'serie'],
  },
  {
    id: 'base',
    label: 'Base digital',
    short: '4',
    description: 'Estimativa de torcedores',
    icon: Sparkles,
    errorKeys: ['torcedoresEstimados', 'torcedoresEstimadosFonte', 'torcedoresEstimadosTipo'],
  },
]

const CAMPO_CLASSE =
  'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--color-primary))]'

const IMPACTO_POR_CAMPO = Object.fromEntries(
  CAMPOS_COMPLETUDE_CLUBE.map((c) => [c.campo, c.impacto]),
) as Record<string, string>

const LABEL_COMPLETUDE = Object.fromEntries(
  CAMPOS_COMPLETUDE_CLUBE.map((c) => [c.campo, c.label]),
) as Record<string, string>

function Campo({
  label,
  hint,
  erro,
  children,
  className = '',
  required,
}: {
  label: string
  hint?: string
  erro?: string
  children: ReactNode
  className?: string
  required?: boolean
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-semibold text-[rgb(var(--foreground-muted))]">
        {label}
        {required ? <span className="text-[rgb(var(--color-danger-fg))]"> *</span> : null}
      </span>
      {children}
      {erro ? (
        <span className="block text-xs text-[rgb(var(--color-danger-fg))]">{erro}</span>
      ) : hint ? (
        <span className="block text-xs text-[rgb(var(--foreground-muted))]">{hint}</span>
      ) : null}
    </label>
  )
}

function stepFromErrors(campos: Record<string, string> | undefined): ClubeStepId | null {
  if (!campos) return null
  for (const step of CLUBE_STEPS) {
    if (step.errorKeys.some((key) => Boolean(campos[key]))) return step.id
  }
  return null
}

function ClubeStepNav({
  step,
  onChange,
  hasErrors,
  badges,
}: {
  step: ClubeStepId
  onChange: (id: ClubeStepId) => void
  hasErrors: Partial<Record<ClubeStepId, boolean>>
  badges: Partial<Record<ClubeStepId, string>>
}) {
  const activeIndex = CLUBE_STEPS.findIndex((s) => s.id === step)

  return (
    <nav aria-label="Etapas do formulário de clube" className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {CLUBE_STEPS.map((item, index) => {
          const active = item.id === step
          const done = index < activeIndex
          const Icon = item.icon
          const erro = hasErrors[item.id]
          const badge = badges[item.id]
          return (
            <li key={item.id}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`clube-step-${item.id}`}
                id={`clube-tab-${item.id}`}
                onClick={() => onChange(item.id)}
                className={[
                  'group relative flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors',
                  active
                    ? 'border-[rgb(var(--color-primary)_/_0.45)] bg-[rgb(var(--color-primary)_/_0.1)]'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary)_/_0.28)] hover:bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                <span
                  className={[
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold tabular-nums',
                    active
                      ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                      : done
                        ? 'bg-[rgb(var(--color-primary)_/_0.18)] text-[rgb(var(--color-primary-fg))]'
                        : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                  ].join(' ')}
                >
                  {done && !active ? <Check className="h-4 w-4" aria-hidden /> : item.short}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <Icon
                      className={[
                        'h-3.5 w-3.5 shrink-0',
                        active
                          ? 'text-[rgb(var(--color-primary-fg))]'
                          : 'text-[rgb(var(--foreground-muted))]',
                      ].join(' ')}
                      aria-hidden
                    />
                    <span
                      className={[
                        'truncate text-sm font-semibold',
                        active
                          ? 'text-[rgb(var(--foreground))]'
                          : 'text-[rgb(var(--foreground-muted))] group-hover:text-[rgb(var(--foreground))]',
                      ].join(' ')}
                    >
                      {item.label}
                    </span>
                    {erro ? (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                        aria-label="Há erros nesta etapa"
                      />
                    ) : null}
                    {badge ? (
                      <span className="ml-auto shrink-0 rounded-md bg-[rgb(var(--color-primary)_/_0.14)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                    {item.description}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <div
        className="h-1 overflow-hidden rounded-full bg-[rgb(var(--background-subtle))]"
        aria-hidden
      >
        <m.div
          className="h-full rounded-full bg-[rgb(var(--color-primary))]"
          initial={false}
          animate={{ width: `${((activeIndex + 1) / CLUBE_STEPS.length) * 100}%` }}
          transition={springSnappy}
        />
      </div>
    </nav>
  )
}

function ClubeStepFooter({
  step,
  onChange,
}: {
  step: ClubeStepId
  onChange: (id: ClubeStepId) => void
}) {
  const index = CLUBE_STEPS.findIndex((s) => s.id === step)
  const prev = index > 0 ? CLUBE_STEPS[index - 1] : null
  const next = index < CLUBE_STEPS.length - 1 ? CLUBE_STEPS[index + 1] : null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--border))] pt-4">
      <div>
        {prev ? (
          <button
            type="button"
            onClick={() => onChange(prev.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[rgb(var(--border))] px-3.5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {prev.label}
          </button>
        ) : (
          <span className="text-xs text-[rgb(var(--foreground-muted))]">
            Etapa 1 de {CLUBE_STEPS.length}
          </span>
        )}
      </div>
      <div>
        {next ? (
          <button
            type="button"
            onClick={() => onChange(next.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] px-3.5 py-2 text-sm font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.35)] transition-colors hover:bg-[rgb(var(--color-primary)_/_0.2)]"
          >
            {next.label}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <span className="text-xs text-[rgb(var(--foreground-muted))]">
            Revise e use a barra para salvar
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Formulário do clube — o mesmo em criar e editar, porque as regras de campo
 * obrigatório valem nos dois casos (o Zod de `@torcida/types` é a fonte).
 *
 * Etapas no chrome do admin (sede): Identidade → Praça → Catálogo → Base.
 * Inteligência do onboarding: mapa UF, cidade IBGE, escudo com drop zone,
 * slug auto e trio de estimativa com preview de completude.
 */
export function ClubeForm({ inicial, aoCriar }: Props) {
  const router = useRouter()
  const [baseline, setBaseline] = useState<ClubeFormValores>(inicial ?? CLUBE_FORM_VAZIO)
  const [valores, setValores] = useState<ClubeFormValores>(baseline)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, iniciarEnvio] = useTransition()
  const [slugManual, setSlugManual] = useState(Boolean(inicial?.slug))
  const [apelidoManual, setApelidoManual] = useState(Boolean(inicial?.apelido))
  const [step, setStep] = useState<ClubeStepId>('identidade')

  const editando = Boolean(inicial?.id)

  const apelidoSugerido = useMemo(() => apelidoClube(valores.nome), [valores.nome])
  const apelidoEfetivo = apelidoManual
    ? valores.apelido
    : valores.nome
      ? apelidoSugerido
      : ''

  const slugSugerido = useMemo(
    () => slugClube(valores.nome, valores.estado),
    [valores.nome, valores.estado],
  )
  const slugEfetivo = slugManual ? valores.slug : valores.nome ? slugSugerido : ''

  const sujo = useMemo(() => {
    const atual = { ...valores, slug: slugEfetivo, apelido: apelidoEfetivo }
    return (Object.keys(baseline) as (keyof ClubeFormValores)[]).some(
      (chave) => (atual[chave] ?? '') !== (baseline[chave] ?? ''),
    )
  }, [valores, slugEfetivo, apelidoEfetivo, baseline])

  const diagnostico = useMemo(() => {
    const n = valores.torcedoresEstimados ? Number(valores.torcedoresEstimados) : null
    return completudeClube({
      slug: slugEfetivo || null,
      serie: valores.serie || null,
      estado: valores.estado || null,
      escudoUrl: valores.escudoUrl || null,
      cidade: valores.cidade || null,
      torcedoresEstimados: Number.isFinite(n) && (n ?? 0) > 0 ? n : null,
    })
  }, [valores, slugEfetivo])

  const previewEstimativa = useMemo(() => {
    const n = Number(valores.torcedoresEstimados)
    if (!Number.isFinite(n) || n <= 0) return null
    const tipo = valores.torcedoresEstimadosTipo as
      | 'IBOPE_DIGITAL'
      | 'LIMITE_ATE'
      | 'PLATAFORMA'
      | ''
    return formatTorcedoresEstimados(n, tipo || null)
  }, [valores.torcedoresEstimados, valores.torcedoresEstimadosTipo])

  const crop = useCroppedImageUpload({
    aspect: 1,
    purpose: 'clube-escudo',
    title: 'Recortar escudo',
    onDone: ({ url }) => {
      if (!url) return
      setValores((v) => ({ ...v, escudoUrl: url }))
      toast.success('Escudo enviado.')
    },
  })

  const hasErrors = useMemo(() => {
    const map: Partial<Record<ClubeStepId, boolean>> = {}
    for (const s of CLUBE_STEPS) {
      map[s.id] = s.errorKeys.some((k) => Boolean(erros[k]))
    }
    return map
  }, [erros])

  const badges = useMemo((): Partial<Record<ClubeStepId, string>> => {
    const out: Partial<Record<ClubeStepId, string>> = {}
    if (valores.estado) out.praca = valores.estado
    if (diagnostico.completo) out.base = 'OK'
    else if (diagnostico.percentual > 0) out.base = `${diagnostico.percentual}%`
    return out
  }, [valores.estado, diagnostico])

  function definir<K extends keyof ClubeFormValores>(chave: K, valor: ClubeFormValores[K]) {
    setValores((v) => ({ ...v, [chave]: valor }))
    setErros((e) => (e[chave] ? { ...e, [chave]: '' } : e))
  }

  function selecionarUf(uf: string) {
    setValores((v) => {
      const cidadeFica = uf && v.estado === uf ? v.cidade : ''
      return { ...v, estado: uf, cidade: cidadeFica }
    })
    setErros((e) => {
      const next = { ...e }
      if (next.estado) next.estado = ''
      if (next.cidade) next.cidade = ''
      return next
    })
  }

  function selecionarMunicipio(m: { cidade: string; uf: string }) {
    setValores((v) => ({ ...v, cidade: m.cidade, estado: m.uf }))
    setErros((e) => {
      const next = { ...e }
      if (next.cidade) next.cidade = ''
      if (next.estado) next.estado = ''
      return next
    })
  }

  function tratarResultado(resultado: ResultadoAcao) {
    if (!resultado.ok) {
      setErros(resultado.campos ?? {})
      const etapaErro = stepFromErrors(resultado.campos)
      if (etapaErro) setStep(etapaErro)
      toast.error(resultado.erro ?? 'Não foi possível salvar.')
      return
    }
    setErros({})
    if (!editando && resultado.clubeId) {
      toast.success('Clube cadastrado.')
      aoCriar?.(resultado.clubeId)
      router.push(`/super-admin/clubes/${resultado.clubeId}`)
      return
    }
    toast.success('Clube atualizado.')
    const salvo = { ...valores, slug: slugEfetivo, apelido: apelidoEfetivo }
    setValores(salvo)
    setBaseline(salvo)
    router.refresh()
  }

  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fd = new FormData(event.currentTarget)
    fd.set('slug', slugEfetivo)
    fd.set('apelido', apelidoEfetivo)
    iniciarEnvio(async () => {
      const resultado = editando ? await atualizarClubeAction(fd) : await criarClubeAction(fd)
      tratarResultado(resultado)
    })
  }

  function descartar() {
    setValores(baseline)
    setErros({})
    setSlugManual(Boolean(inicial?.slug))
    setApelidoManual(Boolean(inicial?.apelido))
    setStep('identidade')
  }

  const formId = editando ? `clube-form-${inicial?.id}` : 'clube-form-novo'
  const activeMeta = CLUBE_STEPS.find((s) => s.id === step)!
  const valueRegiao =
    valores.cidade && valores.estado ? { cidade: valores.cidade, uf: valores.estado } : null

  return (
    <form id={formId} onSubmit={enviar} data-persist-bar-root className="space-y-5">
      {inicial?.id ? <input type="hidden" name="id" value={inicial.id} /> : null}

      {/* Campos sempre no DOM para FormData em qualquer etapa. */}
      <input type="hidden" name="nome" value={valores.nome} />
      <input type="hidden" name="apelido" value={apelidoEfetivo} />
      <input type="hidden" name="escudoUrl" value={valores.escudoUrl} />
      <input type="hidden" name="estado" value={valores.estado} />
      <input type="hidden" name="cidade" value={valores.cidade} />
      <input type="hidden" name="serie" value={valores.serie} />
      <input type="hidden" name="apiExternalId" value={valores.apiExternalId} />
      <input type="hidden" name="torcedoresEstimados" value={valores.torcedoresEstimados} />
      <input type="hidden" name="torcedoresEstimadosFonte" value={valores.torcedoresEstimadosFonte} />
      <input type="hidden" name="torcedoresEstimadosTipo" value={valores.torcedoresEstimadosTipo} />

      <ClubeStepNav step={step} onChange={setStep} hasErrors={hasErrors} badges={badges} />

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3 border-b border-[rgb(var(--border))] pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
            <activeMeta.icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">
              {activeMeta.label}
            </h2>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
              {activeMeta.description}
            </p>
          </div>
          {valores.nome || valores.escudoUrl ? (
            <div className="ml-auto shrink-0">
              <EscudoClube
                nome={valores.nome || 'Clube'}
                apelido={apelidoEfetivo}
                escudoUrl={valores.escudoUrl || null}
                size="sm"
              />
            </div>
          ) : null}
        </div>

        <div
          id="clube-step-identidade"
          role="tabpanel"
          aria-labelledby="clube-tab-identidade"
          hidden={step !== 'identidade'}
          className={step === 'identidade' ? 'block space-y-5' : 'hidden'}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <EscudoClube
                nome={valores.nome || 'Clube'}
                apelido={apelidoEfetivo}
                escudoUrl={valores.escudoUrl || null}
                size="xl"
              />
              <p className="max-w-[10rem] text-center text-[11px] text-[rgb(var(--foreground-muted))]">
                {IMPACTO_POR_CAMPO.escudoUrl}
              </p>
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <ImageDropZone
                label="Escudo do clube"
                prompt="Arraste o escudo ou procure o arquivo"
                formatsHint="JPEG, PNG ou WebP — recorte quadrado no envio"
                browseLabel="Enviar imagem"
                busy={crop.busy}
                file={
                  valores.escudoUrl
                    ? {
                        name: 'Escudo',
                        status: 'done',
                        previewUrl: valores.escudoUrl,
                        previewKey: valores.escudoUrl,
                      }
                    : null
                }
                onFile={(arquivo) => crop.open(arquivo)}
                onClear={() => definir('escudoUrl', '')}
              />
              {erros.escudoUrl ? (
                <p className="text-xs text-[rgb(var(--color-danger-fg))]">{erros.escudoUrl}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nome" required erro={erros.nome} className="sm:col-span-2">
              <input
                value={valores.nome}
                onChange={(e) => definir('nome', e.target.value)}
                placeholder="Sport Club Corinthians Paulista"
                className={CAMPO_CLASSE}
                autoComplete="off"
              />
            </Campo>
            <Campo
              label="Apelido"
              hint={
                apelidoManual
                  ? 'Como aparece em espaços curtos e no placeholder do escudo.'
                  : apelidoEfetivo
                    ? `Sugestão a partir do nome: ${apelidoEfetivo}`
                    : 'Digite o nome para sugerir um apelido curto.'
              }
              erro={erros.apelido}
              className="sm:col-span-2"
            >
              <input
                value={apelidoEfetivo}
                onChange={(e) => {
                  setApelidoManual(true)
                  definir('apelido', e.target.value)
                }}
                placeholder={apelidoSugerido || 'Ex.: Corinthians'}
                className={CAMPO_CLASSE}
                autoComplete="off"
              />
            </Campo>
          </div>
        </div>

        <div
          id="clube-step-praca"
          role="tabpanel"
          aria-labelledby="clube-tab-praca"
          hidden={step !== 'praca'}
          className={step === 'praca' ? 'block space-y-5' : 'hidden'}
        >
          <MapaBrasilUfPicker ufSelecionada={valores.estado} onUfSelecionar={selecionarUf} />
          {erros.estado ? (
            <p className="text-xs text-[rgb(var(--color-danger-fg))]">{erros.estado}</p>
          ) : (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">{IMPACTO_POR_CAMPO.estado}</p>
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="w-full shrink-0 space-y-1 sm:w-48">
              <span className="block text-xs font-semibold leading-4 text-[rgb(var(--foreground-muted))]">
                Estado
              </span>
              {valores.estado ? (
                <div className="flex h-[42px] items-center gap-2.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3">
                  <BandeiraEstado uf={valores.estado} size="sm" />
                  <span className="min-w-0 truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                    {NOME_UF[valores.estado] ?? valores.estado}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                    {valores.estado}
                  </span>
                </div>
              ) : (
                <p className="flex h-[42px] items-center rounded-lg border border-dashed border-[rgb(var(--border))] px-3 text-xs text-[rgb(var(--foreground-muted))]">
                  Toque no mapa acima
                </p>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <span className="block text-xs font-semibold leading-4 text-[rgb(var(--foreground-muted))]">
                Cidade
              </span>
              <div className="[&_input]:box-border [&_input]:h-[42px] [&_input]:py-0">
                <ComboboxRegiao
                  id="clube-cidade"
                  value={valueRegiao}
                  onSelecionar={selecionarMunicipio}
                  uf={valores.estado || undefined}
                  disabled={!valores.estado}
                  placeholder={
                    valores.estado
                      ? `Busque a cidade em ${valores.estado}`
                      : 'Selecione o estado no mapa'
                  }
                />
              </div>
              {erros.cidade ? (
                <span className="block text-xs text-[rgb(var(--color-danger-fg))]">{erros.cidade}</span>
              ) : (
                <span className="block text-xs text-[rgb(var(--foreground-muted))]">
                  {valores.estado
                    ? IMPACTO_POR_CAMPO.cidade
                    : 'Escolha a UF no mapa para listar só cidades daquele estado.'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          id="clube-step-catalogo"
          role="tabpanel"
          aria-labelledby="clube-tab-catalogo"
          hidden={step !== 'catalogo'}
          className={step === 'catalogo' ? 'block space-y-4' : 'hidden'}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              {slugSugerido && valores.nome.trim() ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgb(var(--color-primary)_/_0.28)] bg-[rgb(var(--color-primary)_/_0.08)] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                      Sugestão a partir do cadastro
                    </p>
                    <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                      {valores.nome.trim()}
                      {valores.estado ? ` · ${valores.estado}` : ''}
                      {valores.cidade ? ` · ${valores.cidade}` : ''}
                    </p>
                    <p className="mt-1 truncate font-mono text-sm font-semibold text-[rgb(var(--foreground))]">
                      {slugSugerido}
                    </p>
                  </div>
                  {slugManual && valores.slug !== slugSugerido ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSlugManual(false)
                        definir('slug', slugSugerido)
                      }}
                      className="shrink-0 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-on))] hover:opacity-90"
                    >
                      Usar sugestão
                    </button>
                  ) : !slugManual ? (
                    <span className="shrink-0 rounded-md bg-[rgb(var(--color-primary)_/_0.16)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                      Aplicada
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]">
                  Preencha o nome na Identidade
                  {!valores.estado ? ' e a UF na Praça' : ''} para gerar o slug automaticamente.
                </p>
              )}

              <Campo
                label="Slug"
                hint={IMPACTO_POR_CAMPO.slug}
                erro={erros.slug}
              >
                <input
                  value={slugEfetivo}
                  onChange={(e) => {
                    setSlugManual(true)
                    definir('slug', e.target.value)
                  }}
                  placeholder={slugSugerido || 'sport-club-corinthians-paulista-sp'}
                  className={`${CAMPO_CLASSE} font-mono`}
                  autoComplete="off"
                />
              </Campo>
            </div>

            <Campo label="Série" required hint={IMPACTO_POR_CAMPO.serie} erro={erros.serie}>
              <select
                value={valores.serie}
                onChange={(e) => definir('serie', e.target.value)}
                className={CAMPO_CLASSE}
              >
                {SERIES_CLUBE.map((serie) => (
                  <option key={serie} value={serie}>
                    {rotuloSerieClube(serie)}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </div>

        <div
          id="clube-step-base"
          role="tabpanel"
          aria-labelledby="clube-tab-base"
          hidden={step !== 'base'}
          className={step === 'base' ? 'block space-y-5' : 'hidden'}
        >
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.45)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Completude do cadastro
              </p>
              <span
                className={[
                  'text-sm font-semibold tabular-nums',
                  diagnostico.completo
                    ? 'text-[rgb(var(--color-success-fg))]'
                    : 'text-[rgb(var(--color-warning-fg))]',
                ].join(' ')}
              >
                {diagnostico.percentual}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border))]">
              <m.div
                className="h-full rounded-full bg-[rgb(var(--color-primary))]"
                initial={false}
                animate={{ width: `${diagnostico.percentual}%` }}
                transition={springSnappy}
              />
            </div>
            {diagnostico.faltando.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {diagnostico.faltando.map((campo) => (
                  <li key={campo} className="text-xs text-[rgb(var(--foreground-muted))]">
                    <span className="font-medium text-[rgb(var(--foreground))]">
                      {LABEL_COMPLETUDE[campo] ?? campo}
                    </span>
                    {' — '}
                    {IMPACTO_POR_CAMPO[campo]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-[rgb(var(--color-success-fg))]">
                Cadastro completo para onboarding, Sofascore e base digital.
              </p>
            )}
          </div>

          <fieldset className="space-y-4 rounded-xl border border-[rgb(var(--border))] p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Estimativa de torcedores
            </legend>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Os três campos andam juntos: número sem procedência é boato, e o dimensionamento de
              base digital lê os três. {IMPACTO_POR_CAMPO.torcedoresEstimados}
            </p>
            {previewEstimativa ? (
              <p className="rounded-lg bg-[rgb(var(--color-primary)_/_0.1)] px-3 py-2 text-sm font-medium text-[rgb(var(--color-primary-fg))]">
                Preview: {previewEstimativa}
                {valores.torcedoresEstimadosFonte
                  ? ` · ${valores.torcedoresEstimadosFonte}`
                  : null}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo label="Torcedores estimados" erro={erros.torcedoresEstimados}>
                <input
                  inputMode="numeric"
                  value={
                    valores.torcedoresEstimados
                      ? Number(valores.torcedoresEstimados).toLocaleString('pt-BR')
                      : ''
                  }
                  onChange={(e) => {
                    const digitos = e.target.value.replace(/\D/g, '').slice(0, 9)
                    definir('torcedoresEstimados', digitos.replace(/^0+(?=\d)/, ''))
                  }}
                  placeholder="0"
                  className={`${CAMPO_CLASSE} tabular-nums`}
                />
              </Campo>
              <Campo label="Fonte" erro={erros.torcedoresEstimadosFonte}>
                <input
                  value={valores.torcedoresEstimadosFonte}
                  onChange={(e) => definir('torcedoresEstimadosFonte', e.target.value)}
                  placeholder="IBOPE Repucom 2024"
                  className={CAMPO_CLASSE}
                />
              </Campo>
              <Campo label="Tipo" erro={erros.torcedoresEstimadosTipo}>
                <select
                  value={valores.torcedoresEstimadosTipo}
                  onChange={(e) => definir('torcedoresEstimadosTipo', e.target.value)}
                  className={CAMPO_CLASSE}
                >
                  <option value="">—</option>
                  {TORCEDORES_ESTIMADOS_TIPOS.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {rotuloTipoEstimativa(tipo)}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          </fieldset>
        </div>

        <div className="mt-6">
          <ClubeStepFooter step={step} onChange={setStep} />
        </div>
      </div>

      {sujo ? (
        <StickyPersistBar locked hint={editando ? 'Alterações não salvas' : 'Clube novo'}>
          <button
            type="button"
            onClick={descartar}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Descartar
          </button>
          <button
            type="submit"
            form={formId}
            disabled={enviando}
            className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {editando ? 'Salvar' : 'Cadastrar clube'}
          </button>
        </StickyPersistBar>
      ) : null}

      {crop.dialog}
    </form>
  )
}
