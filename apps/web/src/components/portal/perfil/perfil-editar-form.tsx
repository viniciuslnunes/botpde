'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpDown as ArrowsUpDown, Camera, Eye, ImagePlus, Loader2, Save, Sparkles } from 'lucide-react'
import { toast } from '@torcida/ui'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
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
  const [bannerUrl, setBannerUrl] = useState(bannerInicial)
  const [bannerPos, setBannerPos] = useState(bannerPosInicial ?? 50)
  const [avatarUrl, setAvatarUrl] = useState(avatarInicial)
  const [uploading, setUploading] = useState<'banner' | 'avatar' | null>(null)
  const [avatarMenu, setAvatarMenu] = useState(false)
  const [pending, startTransition] = useTransition()
  const bannerRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const avatarBox = useRef<HTMLDivElement>(null)
  const privacidadeRef = useRef<HTMLDivElement>(null)
  const privacidadeInputRef = useRef<HTMLInputElement>(null)
  const posSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drag = useRef<{ startY: number; startPos: number; h: number } | null>(null)
  const [destaquePrivacidade, setDestaquePrivacidade] = useState(false)

  const displayAvatar = avatarUrl ?? avatarFallback

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('foco') !== 'privacidade' || privacidadeBloqueada) return
    setDestaquePrivacidade(true)
    const t = window.setTimeout(() => {
      privacidadeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      privacidadeInputRef.current?.focus({ preventScroll: true })
    }, 250)
    return () => window.clearTimeout(t)
  }, [privacidadeBloqueada])

  const socialUnsaved = useMemo(() => {
    const list: string[] = []
    if (bio !== bioInicial) list.push('Bio')
    if (perfilPrivado !== privadoInicial) list.push('Privacidade do perfil')
    if (exibirCidade !== cidadeInicial) list.push('Exibir cidade')
    if (exibirSede !== sedeInicial) list.push('Exibir sede')
    if (exibirDesde !== desdeInicial) list.push('Exibir since')
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

  async function handleUpload(file: File, tipo: 'banner' | 'avatar') {
    setUploading(tipo)
    const toastId = tipo === 'banner' ? 'perfil-banner-upload' : 'perfil-avatar-upload'
    try {
      const purpose = tipo === 'banner' ? 'perfil-banner' : 'perfil-avatar'
      const url = await toast
        .promise(uploadMediaToCloudinary(file, undefined, purpose, tenantId), {
          loading: tipo === 'banner' ? 'Enviando capa…' : 'Enviando foto…',
          success: 'Arquivo enviado. Salvando no perfil…',
          error: (e) => (e instanceof Error ? e.message : 'Falha no upload.'),
          id: toastId,
        })
        .unwrap()
      if (tipo === 'banner') {
        setBannerUrl(url)
        setBannerPos(50)
        await persistPerfil({ bannerUrl: url, bannerPos: 50 }, { silent: true, refresh: true, apenasMidia: true })
        toast.success('Capa salva no perfil.', { id: toastId })
      } else {
        setAvatarUrl(url)
        await persistPerfil({ avatarUrl: url }, { silent: true, refresh: true, apenasMidia: true })
        // Sincroniza a foto na sessão (JWT) — sem isso topbar/menu ficam com a
        // imagem antiga até o usuário deslogar e logar de novo.
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: url }),
        }).catch(() => {})
        router.refresh()
        toast.success('Foto de perfil salva.', { id: toastId })
      }
    } catch {
      // erro já notificado pelo toast.promise
    } finally {
      setUploading(null)
    }
  }

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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        Editar perfil social
      </h2>
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Capa e foto são salvas automaticamente após o upload. Use o botão abaixo para bio e privacidade.
      </p>

      <input
        ref={bannerRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleUpload(f, 'banner')
          e.target.value = ''
        }}
      />
      <input
        ref={avatarRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleUpload(f, 'avatar')
          e.target.value = ''
        }}
      />

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

          {uploading === 'banner' && (
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}

          {bannerUrl && uploading !== 'banner' && (
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
              <ArrowsUpDown className="h-3 w-3" />
              Arraste para enquadrar
            </span>
          )}

          <button
            type="button"
            disabled={uploading !== null || pending}
            onClick={() => bannerRef.current?.click()}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Camera className="h-3.5 w-3.5" />
            {bannerUrl ? 'Trocar capa' : 'Adicionar capa'}
          </button>
        </div>

        <div className="flex items-center gap-3 bg-[rgb(var(--surface))] px-4 pb-3">
          <div ref={avatarBox} className="relative -mt-8 shrink-0">
            <button
              type="button"
              disabled={uploading !== null || pending}
              onClick={() => (displayAvatar ? setAvatarMenu((v) => !v) : avatarRef.current?.click())}
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
              <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-4 w-4 text-white" />
              </span>
              {uploading === 'avatar' && (
                <span className="absolute inset-0 grid place-items-center bg-black/45">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </span>
              )}
            </button>

            {avatarMenu && displayAvatar && (
              <div className="absolute left-0 top-full z-10 mt-1 w-52 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg">
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
                <button
                  type="button"
                  onClick={() => {
                    setAvatarMenu(false)
                    avatarRef.current?.click()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
                >
                  <ImagePlus className="h-4 w-4" />
                  Alterar imagem de perfil
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            A capa aparece no topo do perfil assim que o upload terminar.
          </p>
        </div>
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
              if (!e.target.checked) setDestaquePrivacidade(false)
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
