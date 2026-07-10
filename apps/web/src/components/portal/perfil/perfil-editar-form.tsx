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

      <div className="flex flex-wrap gap-3">
        <input
          ref={bannerRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleUpload(f, 'banner')
          }}
        />
        <button
          type="button"
          disabled={uploading !== null}
          onClick={() => bannerRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
        >
          {uploading === 'banner' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {bannerUrl ? 'Trocar banner' : 'Adicionar banner'}
        </button>

        <input
          ref={avatarRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleUpload(f, 'avatar')
          }}
        />
        <button
          type="button"
          disabled={uploading !== null}
          onClick={() => avatarRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
        >
          {uploading === 'avatar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {avatarUrl ? 'Trocar foto' : 'Foto do perfil'}
        </button>
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
