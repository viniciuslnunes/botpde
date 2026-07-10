'use client'

import { useState } from 'react'
import type { FotoPerfilItem } from '@/lib/perfil-social'

interface PerfilFotosGridProps {
  fotos: FotoPerfilItem[]
}

export function PerfilFotosGrid({ fotos }: PerfilFotosGridProps) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (fotos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
        Nenhuma foto publicada ainda.
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fotos.map((foto, i) => (
          <button
            key={`${foto.postId}-${i}`}
            type="button"
            onClick={() => setLightbox(foto.url)}
            className="aspect-square overflow-hidden rounded-xl bg-[rgb(var(--background-subtle))]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.url} alt="" className="h-full w-full object-cover transition-transform hover:scale-105" />
          </button>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
