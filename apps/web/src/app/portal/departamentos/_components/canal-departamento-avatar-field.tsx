'use client'

import { useState, useTransition } from 'react'
import { toast } from '@torcida/ui'
import { Avatar } from '@/components/portal/avatar'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { useCroppedImageUpload } from '@/components/media/use-cropped-image-upload'
import {
  atualizarAvatarCanalDepartamento,
  type ActionState,
} from '../actions'

type Props = {
  conversaId: string
  nome: string
  avatarUrl: string | null
  /** Slug do departamento — revalidate do cockpit. */
  slug?: string
  compact?: boolean
  onAvatarChange?: (url: string | null) => void
}

/**
 * Foto do canal de departamento/área: crop 1:1 → Cloudinary →
 * `atualizarAvatarCanalDepartamento`. Usado no cockpit e em Mensagens.
 */
export function CanalDepartamentoAvatarField({
  conversaId,
  nome,
  avatarUrl: avatarInicial,
  slug,
  compact = false,
  onAvatarChange,
}: Props) {
  const [avatarUrl, setAvatarUrl] = useState(avatarInicial)
  const [removendo, setRemovendo] = useState(false)
  const [, startTransition] = useTransition()

  async function salvar(url: string | null) {
    const fd = new FormData()
    fd.set('conversaId', conversaId)
    fd.set('avatarUrl', url ?? '__none__')
    if (slug) fd.set('slug', slug)
    const res: ActionState = await atualizarAvatarCanalDepartamento({}, fd)
    if (res.error) throw new Error(res.error)
    setAvatarUrl(url)
    onAvatarChange?.(url)
  }

  const crop = useCroppedImageUpload({
    aspect: 1,
    purpose: 'comunidade',
    title: 'Ajustar foto do canal',
    onDone: async ({ url }) => {
      if (!url) throw new Error('Upload sem URL')
      await salvar(url)
      toast.success('Foto do canal atualizada.')
    },
  })

  const busy = crop.busy || removendo

  function onFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem.')
      return
    }
    crop.open(file)
  }

  function removerFoto() {
    setRemovendo(true)
    startTransition(async () => {
      try {
        await salvar(null)
        toast.success('Foto removida.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível remover.')
      } finally {
        setRemovendo(false)
      }
    })
  }

  return (
    <>
      {crop.dialog}
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {!compact && (
          <div className="flex items-center gap-3">
            <Avatar nome={nome} avatarUrl={avatarUrl} size="lg" fit="contain" />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Foto do canal — aparece em Mensagens.
            </p>
          </div>
        )}
        <ImageDropZone
          busy={busy}
          formatsHint="JPEG, PNG ou WebP — ajuste 1:1 antes do envio"
          prompt={compact ? 'Trocar foto do canal' : 'Arraste ou escolha a foto'}
          file={
            avatarUrl
              ? {
                  name: 'foto-canal.jpg',
                  status: busy ? 'uploading' : 'done',
                  previewUrl: avatarUrl,
                }
              : null
          }
          onClear={avatarUrl ? () => void removerFoto() : undefined}
          onFile={onFile}
        />
      </div>
    </>
  )
}
