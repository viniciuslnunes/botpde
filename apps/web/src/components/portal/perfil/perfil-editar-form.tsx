'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, Loader2, Save } from 'lucide-react'
import { toast } from '@torcida/ui'
import { atualizarPerfilSocial } from '@/app/portal/comunidade/actions'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'

interface PerfilEditarFormProps {
  bio: string
  perfilPrivado: boolean
  exibirCidade: boolean
  exibirSede: boolean
  exibirDesde: boolean
  bannerUrl: string | null
  avatarUrl: string | null
}

export function PerfilEditarForm({
  bio: bioInicial,
  perfilPrivado: privadoInicial,
  exibirCidade: cidadeInicial,
  exibirSede: sedeInicial,
  exibirDesde: desdeInicial,
  bannerUrl: bannerInicial,
  avatarUrl: avatarInicial,
}: PerfilEditarFormProps) {
  const [bio, setBio] = useState(bioInicial)
  const [perfilPrivado, setPerfilPrivado] = useState(privadoInicial)
  const [exibirCidade, setExibirCidade] = useState(cidadeInicial)
  const [exibirSede, setExibirSede] = useState(sedeInicial)
  const [exibirDesde, setExibirDesde] = useState(desdeInicial)
  const [bannerUrl, setBannerUrl] = useState(bannerInicial)
  const [avatarUrl, setAvatarUrl] = useState(avatarInicial)
  const [uploading, setUploading] = useState<'banner' | 'avatar' | null>(null)
  const [pending, startTransition] = useTransition()
  const bannerRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File, tipo: 'banner' | 'avatar') {
    setUploading(tipo)
    try {
      const purpose = tipo === 'banner' ? 'perfil-banner' : 'perfil-avatar'
      const url = await uploadMediaToCloudinary(file, undefined, purpose)
      if (tipo === 'banner') setBannerUrl(url)
      else setAvatarUrl(url)
      toast.success(tipo === 'banner' ? 'Banner carregado. Clique em salvar.' : 'Foto carregada. Clique em salvar.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no upload.')
    } finally {
      setUploading(null)
    }
  }

  function salvar() {
    startTransition(async () => {
      try {
        await atualizarPerfilSocial({
          bio,
          perfilPrivado,
          exibirCidade,
          exibirSede,
          exibirDesde,
          bannerUrl,
          avatarUrl,
        })
        toast.success('Perfil social atualizado.')
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

      {/* Prévia: faixa de capa + avatar sobreposto, espelhando o header do perfil. */}
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))]">
        <div className="relative h-28 sm:h-32">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-b from-[rgb(var(--primary)_/_0.28)] via-[rgb(var(--primary)_/_0.10)] to-[rgb(var(--surface))]" />
          )}

          {uploading === 'banner' && (
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}

          <button
            type="button"
            disabled={uploading !== null}
            onClick={() => bannerRef.current?.click()}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Camera className="h-3.5 w-3.5" />
            {bannerUrl ? 'Trocar capa' : 'Adicionar capa'}
          </button>
        </div>

        <div className="flex items-center gap-3 bg-[rgb(var(--surface))] px-4 pb-3">
          <div className="-mt-8 shrink-0">
            <button
              type="button"
              disabled={uploading !== null}
              onClick={() => avatarRef.current?.click()}
              className="group relative block h-16 w-16 overflow-hidden rounded-full ring-4 ring-[rgb(var(--surface))] disabled:opacity-60"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center bg-[rgb(var(--background-subtle))]">
                  <Camera className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
                </span>
              )}
              <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                {uploading === 'avatar' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <Camera className="h-4 w-4 text-white" />
                )}
              </span>
              {uploading === 'avatar' && (
                <span className="absolute inset-0 grid place-items-center bg-black/45">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </span>
              )}
            </button>
          </div>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Toque na capa ou na foto para trocar. As alterações valem após salvar.
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

      <label className="flex items-center gap-2 text-sm text-[rgb(var(--foreground-muted))]">
        <input
          type="checkbox"
          checked={perfilPrivado}
          onChange={(e) => setPerfilPrivado(e.target.checked)}
        />
        Perfil privado (só seguidores veem suas publicações e atividade)
      </label>

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
        Salvar perfil
      </button>
    </section>
  )
}
