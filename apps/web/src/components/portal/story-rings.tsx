'use client'

import { useRef, useState, useTransition } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { Avatar } from './avatar'
import { StoryViewer } from './story-viewer'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { publicarMomentoStory } from '@/app/portal/comunidade/actions'
import type { StoryRingItem } from '@/lib/stories'

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
        const url = await uploadMediaToCloudinary(file)
        const result = await publicarMomentoStory(url)
        if (!result.success) {
          toast.error(result.message ?? 'Não foi possível publicar o momento.')
          return
        }
        toast.success('Momento publicado! Expira em 24h.')
        window.location.reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Falha no upload.')
      }
    })
  }

  if (rings.length === 0 && !currentUserId) return null

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {currentUserId && (
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
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
          </button>
        )}

        {meuRing && meuRing.momentos.length > 0 && (
          <button
            type="button"
            onClick={() => setViewerIdx(rings.findIndex((r) => r.userId === currentUserId))}
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
          </button>
        )}

        {outrosRings.map((ring) => {
          const idx = rings.findIndex((r) => r.userId === ring.userId)
          return (
            <button
              key={ring.userId}
              type="button"
              onClick={() => setViewerIdx(idx)}
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
            </button>
          )
        })}
      </div>

      {viewerIdx !== null && (
        <StoryViewer rings={rings} initialRingIndex={viewerIdx} onClose={() => setViewerIdx(null)} />
      )}
    </>
  )
}
