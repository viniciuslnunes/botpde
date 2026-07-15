'use client'

import { useRef, useState, useTransition } from 'react'
import { m } from 'motion/react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { Avatar } from './avatar'
import { StoryViewer } from './story-viewer'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { publicarMomentoStory } from '@/app/portal/comunidade/actions'
import type { StoryRingItem } from '@/lib/stories'
import { springSnappy } from '@/lib/motion-presets'

interface StoryRingsProps {
  rings: StoryRingItem[]
  currentUserId: string
  currentUserNome: string | null
  currentUserAvatar: string | null
}

export function StoryRings({
  rings,
  currentUserId,
  currentUserNome,
  currentUserAvatar,
}: StoryRingsProps) {
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const meuRing = rings.find((r) => r.userId === currentUserId)
  const outrosRings = rings.filter((r) => r.userId !== currentUserId)

  function publicar(file: File) {
    startTransition(async () => {
      try {
        const url = await toast
          .promise(uploadMediaToCloudinary(file), {
            loading: 'Enviando momento…',
            success: 'Upload pronto. Publicando…',
            error: (e) => (e instanceof Error ? e.message : 'Falha no upload.'),
            id: 'story-upload',
          })
          .unwrap()
        const result = await publicarMomentoStory(url)
        if (!result.success) {
          toast.error(result.message ?? 'Não foi possível publicar o momento.', {
            id: 'story-upload',
          })
          return
        }
        toast.success('Momento publicado! Expira em 24h.', { id: 'story-upload' })
        window.location.reload()
      } catch {
        // erro já notificado
      }
    })
  }

  if (rings.length === 0 && !currentUserId) return null

  return (
    <>
      <div className="app-scrollbar-none flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {currentUserId && (
          <m.button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            whileTap={{ scale: 0.92 }}
            transition={springSnappy}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <div className="relative">
              <div className="rounded-full bg-gradient-to-tr from-[rgb(var(--primary))] to-pink-500 p-0.5">
                <div className="rounded-full bg-[rgb(var(--surface))] p-0.5">
                  <Avatar nome={currentUserNome} avatarUrl={currentUserAvatar} size="md" />
                </div>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[rgb(var(--primary))] p-0.5 text-white">
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
              </span>
            </div>
            <span className="max-w-14 truncate text-[10px] text-[rgb(var(--foreground-muted))]">
              Seu momento
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) publicar(file)
                e.target.value = ''
              }}
            />
          </m.button>
        )}

        {meuRing && meuRing.momentos.length > 0 && (
          <m.button
            type="button"
            onClick={() => setViewerIdx(rings.findIndex((r) => r.userId === currentUserId))}
            whileTap={{ scale: 0.92 }}
            transition={springSnappy}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <div className="rounded-full bg-gradient-to-tr from-[rgb(var(--primary))] to-pink-500 p-0.5">
              <div className="rounded-full bg-[rgb(var(--surface))] p-0.5">
                <Avatar nome={meuRing.nome} avatarUrl={meuRing.avatarUrl} size="md" />
              </div>
            </div>
            <span className="max-w-14 truncate text-[10px] font-medium text-[rgb(var(--foreground))]">
              Você
            </span>
          </m.button>
        )}

        {outrosRings.map((ring) => {
          const idx = rings.findIndex((r) => r.userId === ring.userId)
          return (
            <m.button
              key={ring.userId}
              type="button"
              onClick={() => setViewerIdx(idx)}
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.04 }}
              transition={springSnappy}
              className="flex shrink-0 flex-col items-center gap-1"
            >
              <div
                className={[
                  'rounded-full p-0.5',
                  ring.temNovo
                    ? 'bg-gradient-to-tr from-[rgb(var(--primary))] to-pink-500'
                    : 'bg-[rgb(var(--border))]',
                ].join(' ')}
              >
                <div className="rounded-full bg-[rgb(var(--surface))] p-0.5">
                  <Avatar nome={ring.nome} avatarUrl={ring.avatarUrl} size="md" />
                </div>
              </div>
              <span className="max-w-14 truncate text-[10px] text-[rgb(var(--foreground-muted))]">
                {ring.nome ?? 'Membro'}
              </span>
            </m.button>
          )
        })}
      </div>

      {viewerIdx !== null && (
        <StoryViewer rings={rings} initialRingIndex={viewerIdx} onClose={() => setViewerIdx(null)} />
      )}
    </>
  )
}
