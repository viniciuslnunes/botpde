'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCsrfToken } from 'next-auth/react'
import { ArrowUpDown as ArrowsUpDown, Camera, Eye, Loader2, Save, Sparkles } from 'lucide-react'
import { toast } from '@torcida/ui'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { useUnsavedChanges } from '@/lib/unsaved-changes'

interface PerfilEditarFormProps {
  tenantId: string
  bio: string
  perfilPrivado: boolean
  /** Sócio pode alterar; torcedor permanece público obrigatório. */
  privacidadeBloqueada?: boolean
  exibirCidade: boolean
  exibirSede: boolean
  exibirDesde: boolean
  /** Sócio com carteirinha: controla "Sócio/Membro - Nº N" no feed. */
  exibirNumeroSocioNoFeed?: boolean
  /** Só mostra o toggle de nº quando há carteirinha. */
  temNumeroSocio?: boolean
  bannerUrl: string | null
  bannerPos: number | null
  avatarUrl: string | null
  /** Foto de login usada como fallback de exibição quando não há avatar social próprio. */
  avatarFallback: string | null
}

type PerfilPersistPayload = {
  tenantId: string
  bio: string
  perfilPrivado: boolean
  exibirCidade: boolean
  exibirSede: boolean
  exibirDesde: boolean
  exibirNumeroSocioNoFeed: boolean
  bannerUrl: string | null
  bannerPos: number | null
  avatarUrl: string | null
  apenasMidia?: boolean
}

type PerfilPersistResponse = {
  ok?: boolean
  error?: string
  perfil?: {
    bannerUrl: string | null
    bannerPos: number | null
    avatarUrl: string | null
  }
}

export function PerfilEditarForm({
  tenantId,
  bio: bioInicial,
  perfilPrivado: privadoInicial,
  privacidadeBloqueada = false,
  exibirCidade: cidadeInicial,
  exibirSede: sedeInicial,
  exibirDesde: desdeInicial,
  exibirNumeroSocioNoFeed: numeroFeedInicial = true,
  temNumeroSocio = false,
  bannerUrl: bannerInicial,
  bannerPos: bannerPosInicial,
  avatarUrl: avatarInicial,
  avatarFallback,
}: PerfilEditarFormProps) {
  const router = useRouter()
  const [bio, setBio] = useState(bioInicial)
  const [perfilPrivado, setPerfilPrivado] = useState(privadoInicial)
  const [exibirCidade, setExibirCidade] = useState(cidadeInicial)
  const [exibirSede, setExibirSede] = useState(sedeInicial)
  const [exibirDesde, setExibirDesde] = useState(desdeInicial)
  const [exibirNumeroSocioNoFeed, setExibirNumeroSocioNoFeed] = useState(numeroFeedInicial)
  const [bannerUrl, setBannerUrl] = useState(bannerInicial)
  const [bannerPos, setBannerPos] = useState(bannerPosInicial ?? 50)
  const [avatarUrl, setAvatarUrl] = useState(avatarInicial)
  const [uploading, setUploading] = useState<'banner' | 'avatar' | null>(null)
  const [avatarMenu, setAvatarMenu] = useState(false)
  const [pending, startTransition] = useTransition()
  const avatarBox = useRef<HTMLDivElement>(null)
  const privacidadeRef = useRef<HTMLDivElement>(null)
  const privacidadeInputRef = useRef<HTMLInputElement>(null)
  const posSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drag = useRef<{ startY: number; startPos: number; h: number } | null>(null)
  // `?foco=privacidade` é dado da URL, não estado: lendo pelo hook do Next o
  // destaque já sai no primeiro render, sem o effect que o ligava depois.
  // O estado local guarda só a dispensa (desmarcar "perfil privado" apaga o
  // realce), não o valor em si.
  const searchParams = useSearchParams()
  const [destaqueDispensado, setDestaqueDispensado] = useState(false)
  const destaquePrivacidade =
    !destaqueDispensado &&
    searchParams.get('foco') === 'privacidade' &&
    !privacidadeBloqueada

  const displayAvatar = avatarUrl ?? avatarFallback

  // Fica em effect só o efeito colateral (rolar até o bloco e focar o campo).
  useEffect(() => {
    if (!destaquePrivacidade) return
    const t = window.setTimeout(() => {
      privacidadeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      privacidadeInputRef.current?.focus({ preventScroll: true })
    }, 250)
    return () => window.clearTimeout(t)
  }, [destaquePrivacidade])

  const socialUnsaved = useMemo(() => {
    const list: string[] = []
    if (bio !== bioInicial) list.push('Bio')
    if (perfilPrivado !== privadoInicial) list.push('Privacidade do perfil')
    if (exibirCidade !== cidadeInicial) list.push('Exibir cidade')
    if (exibirSede !== sedeInicial) list.push('Exibir sede')
    if (exibirDesde !== desdeInicial) list.push('Exibir since')
    if (temNumeroSocio && exibirNumeroSocioNoFeed !== numeroFeedInicial) {
      list.push('Nº de sócio no feed')
    }
    return list
  }, [
    bio,
    bioInicial,
    perfilPrivado,
    privadoInicial,
    exibirCidade,
    cidadeInicial,
    exibirSede,
    sedeInicial,
    exibirDesde,
    desdeInicial,
    exibirNumeroSocioNoFeed,
    numeroFeedInicial,
    temNumeroSocio,
  ])

  useUnsavedChanges({
    id: 'perfil-social-editar',
    title: 'Perfil social',
    isDirty: socialUnsaved.length > 0,
    changes: socialUnsaved,
  })

  // Sincroniza com dados do servidor após router.refresh().
  useEffect(() => {
    startTransition(() => {
      setBio(bioInicial)
      setPerfilPrivado(privadoInicial)
      setExibirCidade(cidadeInicial)
      setExibirSede(sedeInicial)
      setExibirDesde(desdeInicial)
      setExibirNumeroSocioNoFeed(numeroFeedInicial)
      setBannerUrl(bannerInicial)
      setBannerPos(bannerPosInicial ?? 50)
      setAvatarUrl(avatarInicial)
    })
  }, [
    bioInicial,
    privadoInicial,
    cidadeInicial,
    sedeInicial,
    desdeInicial,
    numeroFeedInicial,
    bannerInicial,
    bannerPosInicial,
    avatarInicial,
  ])

  const buildPayload = useCallback(
    (
      overrides?: Partial<Pick<PerfilPersistPayload, 'bannerUrl' | 'bannerPos' | 'avatarUrl'>>,
      options?: { apenasMidia?: boolean },
    ): PerfilPersistPayload => {
      const nextBanner = overrides?.bannerUrl !== undefined ? overrides.bannerUrl : bannerUrl
      const nextPos = overrides?.bannerPos !== undefined ? overrides.bannerPos : bannerPos
      const apenasMidia = options?.apenasMidia === true
      return {
        tenantId,
        bio,
        perfilPrivado,
        exibirCidade,
        exibirSede,
        exibirDesde,
        exibirNumeroSocioNoFeed,
        bannerUrl: nextBanner,
        bannerPos: nextBanner ? nextPos : null,
        avatarUrl: overrides?.avatarUrl !== undefined ? overrides.avatarUrl : avatarUrl,
        ...(apenasMidia ? { apenasMidia: true } : {}),
      }
    },
    [
      tenantId,
      bio,
      perfilPrivado,
      exibirCidade,
      exibirSede,
      exibirDesde,
      exibirNumeroSocioNoFeed,
      bannerUrl,
      bannerPos,
      avatarUrl,
    ],
  )

  const persistPerfil = useCallback(
    async (
      overrides?: Partial<Pick<PerfilPersistPayload, 'bannerUrl' | 'bannerPos' | 'avatarUrl'>>,
      options?: { silent?: boolean; refresh?: boolean; apenasMidia?: boolean },
    ) => {
      const payload = buildPayload(overrides, { apenasMidia: options?.apenasMidia })
      const res = await fetch('/api/perfil/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await res.json().catch(() => ({}))) as PerfilPersistResponse
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível salvar.')

      if (body.perfil?.bannerUrl !== undefined) setBannerUrl(body.perfil.bannerUrl)
      if (body.perfil?.bannerPos !== undefined) setBannerPos(body.perfil.bannerPos ?? 50)
      if (body.perfil?.avatarUrl !== undefined) setAvatarUrl(body.perfil.avatarUrl)

      if (options?.refresh !== false) router.refresh()
      if (!options?.silent) toast.success('Perfil social atualizado.')
      return body
    },
    [buildPayload, router],
  )

  function onBannerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!bannerUrl || uploading !== null) return
    const h = e.currentTarget.getBoundingClientRect().height
    drag.current = { startY: e.clientY, startPos: bannerPos, h }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onBannerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const delta = ((e.clientY - drag.current.startY) / drag.current.h) * 100
    setBannerPos(Math.min(100, Math.max(0, Math.round(drag.current.startPos - delta))))
  }
  function onBannerPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const moved = drag.current !== null
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!moved || !bannerUrl) return
    if (posSaveTimer.current) clearTimeout(posSaveTimer.current)
    posSaveTimer.current = setTimeout(() => {
      void persistPerfil(undefined, { silent: true, refresh: true, apenasMidia: true }).catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o enquadramento.')
      })
    }, 400)
  }

  useEffect(() => {
    if (!avatarMenu) return
    function onDown(ev: MouseEvent) {
      if (avatarBox.current && !avatarBox.current.contains(ev.target as Node)) setAvatarMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [avatarMenu])

  const cropBanner = useCroppedImageUpload({
    aspect: 3,
    purpose: 'perfil-banner',
    tenantId,
    title: 'Ajustar capa',
    onDone: async ({ url }) => {
      if (!url) return
      setUploading('banner')
      try {
        setBannerUrl(url)
        setBannerPos(50)
        await persistPerfil(
          { bannerUrl: url, bannerPos: 50 },
          { silent: true, refresh: true, apenasMidia: true },
        )
        toast.success('Capa salva no perfil.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a capa.')
      } finally {
        setUploading(null)
      }
    },
  })

  const cropAvatar = useCroppedImageUpload({
    aspect: 1,
    purpose: 'perfil-avatar',
    tenantId,
    title: 'Ajustar foto de perfil',
    onDone: async ({ url }) => {
      if (!url) return
      setUploading('avatar')
      try {
        setAvatarUrl(url)
        await persistPerfil({ avatarUrl: url }, { silent: true, refresh: true, apenasMidia: true })
        const csrfToken = await getCsrfToken()
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csrfToken, data: { image: url } }),
        }).catch(() => {})
        router.refresh()
        toast.success('Foto de perfil salva.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a foto.')
      } finally {
        setUploading(null)
      }
    },
  })

  function salvar() {
    startTransition(async () => {
      try {
        await persistPerfil()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.')
      }
    })
  }

  return (
    <section className="space-y-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      {cropBanner.dialog}
      {cropAvatar.dialog}
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Editar perfil social
      </h2>
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Capa e foto são salvas automaticamente após o ajuste. Use o botão abaixo para bio e
        privacidade.
      </p>

      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))]">
        <div
          className={`relative h-28 select-none touch-none sm:h-32 ${bannerUrl ? 'cursor-ns-resize' : ''}`}
          onPointerDown={onBannerPointerDown}
          onPointerMove={onBannerPointerMove}
          onPointerUp={onBannerPointerUp}
          onPointerCancel={onBannerPointerUp}
        >
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
              style={{ objectPosition: `center ${bannerPos}%` }}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-b from-[rgb(var(--primary)_/_0.28)] via-[rgb(var(--primary)_/_0.10)] to-[rgb(var(--surface))]" />
          )}

          {(uploading === 'banner' || cropBanner.busy) && (
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}

          {bannerUrl && uploading !== 'banner' && !cropBanner.busy && (
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
              <ArrowsUpDown className="h-3 w-3" />
              Arraste para enquadrar
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 bg-[rgb(var(--surface))] px-4 pb-3 pt-1">
          <div ref={avatarBox} className="relative -mt-8 shrink-0">
            <button
              type="button"
              disabled={uploading !== null || pending || cropAvatar.busy}
              onClick={() => {
                if (displayAvatar) setAvatarMenu((v) => !v)
              }}
              className="group relative block h-16 w-16 overflow-hidden rounded-full ring-4 ring-[rgb(var(--surface))] disabled:opacity-60"
            >
              {displayAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center bg-[rgb(var(--background-subtle))]">
                  <Camera className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
                </span>
              )}
              {(uploading === 'avatar' || cropAvatar.busy) && (
                <span className="absolute inset-0 grid place-items-center bg-black/45">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </span>
              )}
            </button>

            {avatarMenu && displayAvatar && (
              <div className="absolute left-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setAvatarMenu(false)
                    window.open(displayAvatar, '_blank', 'noopener,noreferrer')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
                >
                  <Eye className="h-4 w-4" />
                  Ver imagem
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Prévia da capa e da foto. Envie as imagens abaixo.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ImageDropZone
          label="Foto de capa"
          busy={uploading === 'banner' || cropBanner.busy || pending}
          formatsHint="JPEG, PNG ou WebP — ajuste ~3:1 antes do envio"
          file={
            bannerUrl
              ? {
                  name: 'capa.jpg',
                  status:
                    uploading === 'banner' || cropBanner.busy ? 'uploading' : 'done',
                  previewUrl: bannerUrl,
                }
              : null
          }
          onClear={
            bannerUrl
              ? () => {
                  void persistPerfil(
                    { bannerUrl: null, bannerPos: null },
                    { silent: true, refresh: true, apenasMidia: true },
                  )
                    .then(() => toast.success('Capa removida.'))
                    .catch((err: unknown) =>
                      toast.error(err instanceof Error ? err.message : 'Não foi possível remover.'),
                    )
                }
              : undefined
          }
          onFile={(file) => cropBanner.open(file)}
        />
        <ImageDropZone
          label="Foto de perfil"
          busy={uploading === 'avatar' || cropAvatar.busy || pending}
          formatsHint="JPEG, PNG ou WebP — ajuste 1:1 antes do envio"
          file={
            avatarUrl
              ? {
                  name: 'avatar.jpg',
                  status:
                    uploading === 'avatar' || cropAvatar.busy ? 'uploading' : 'done',
                  previewUrl: avatarUrl,
                }
              : null
          }
          onClear={
            avatarUrl
              ? () => {
                  void persistPerfil(
                    { avatarUrl: null },
                    { silent: true, refresh: true, apenasMidia: true },
                  )
                    .then(() => toast.success('Foto de perfil removida.'))
                    .catch((err: unknown) =>
                      toast.error(err instanceof Error ? err.message : 'Não foi possível remover.'),
                    )
                }
              : undefined
          }
          onFile={(file) => cropAvatar.open(file)}
        />
      </div>

      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={280}
        rows={3}
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
        placeholder="Escreva sua bio para a comunidade."
      />

      <div
        ref={privacidadeRef}
        id="perfil-privacidade"
        className={[
          'scroll-mt-28 space-y-2 rounded-xl border p-3 transition-[box-shadow,background-color,border-color] duration-500',
          destaquePrivacidade
            ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.1)] shadow-[0_0_0_3px_rgb(var(--color-primary)_/_0.28)]'
            : 'border-transparent',
        ].join(' ')}
      >
        {destaquePrivacidade && !privacidadeBloqueada && (
          <div className="flex items-start gap-2 rounded-lg bg-[rgb(var(--surface))] px-3 py-2 text-sm">
            <Sparkles
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]"
            />
            <div>
              <p className="font-semibold text-[rgb(var(--color-primary-fg))]">
                Altere a privacidade aqui
              </p>
              <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                Desmarque “Perfil privado” e salve para liberar a opção Público nas publicações.
              </p>
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-[rgb(var(--foreground-muted))]">
          <input
            ref={privacidadeInputRef}
            type="checkbox"
            checked={perfilPrivado}
            disabled={privacidadeBloqueada}
            onChange={(e) => {
              setPerfilPrivado(e.target.checked)
              if (!e.target.checked) setDestaqueDispensado(true)
            }}
          />
          {privacidadeBloqueada
            ? 'Perfil público (obrigatório para torcedores)'
            : 'Perfil privado (só seguidores veem suas publicações e atividade)'}
        </label>
      </div>

      <div className="space-y-2 rounded-lg border border-[rgb(var(--border))] p-3">
        <p className="text-xs font-semibold text-[rgb(var(--foreground-muted))]">Exibir no perfil</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={exibirCidade} onChange={(e) => setExibirCidade(e.target.checked)} />
          Cidade
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={exibirSede} onChange={(e) => setExibirSede(e.target.checked)} />
          Sede / subsede
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={exibirDesde} onChange={(e) => setExibirDesde(e.target.checked)} />
          Membro desde
        </label>
        {temNumeroSocio && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={exibirNumeroSocioNoFeed}
              onChange={(e) => setExibirNumeroSocioNoFeed(e.target.checked)}
            />
            Número de sócio no feed
            <span className="text-xs text-[rgb(var(--foreground-muted))]">(Sócio/Membro - Nº …)</span>
          </label>
        )}
      </div>

      <button
        type="button"
        disabled={pending || uploading !== null}
        onClick={salvar}
        className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar bio e privacidade
      </button>
    </section>
  )
}
