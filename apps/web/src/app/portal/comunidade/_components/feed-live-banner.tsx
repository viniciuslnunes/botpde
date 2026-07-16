'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp } from 'lucide-react'
import { useFeedStream } from '@/lib/use-feed-stream'
import { isComunidadeFeedNearTop } from '@/lib/feed-live-refresh'

/**
 * Banner "N novos posts" quando o usuário está longe do topo.
 * No topo, o infinite feed já refetcha sozinho — aqui só reforça scroll/RSC.
 */
export function FeedLiveBanner({ filtro }: { filtro?: 'descobrir' | 'seguindo' }) {
  const router = useRouter()
  const [novos, setNovos] = useState(0)

  useFeedStream(() => {
    if (isComunidadeFeedNearTop()) {
      setNovos(0)
      router.refresh()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setNovos((n) => n + 1)
  })

  if (novos === 0) return null

  function verNovos() {
    setNovos(0)
    const href =
      filtro === 'seguindo' ? '/portal/comunidade?filtro=seguindo' : '/portal/comunidade'
    router.push(href)
    router.refresh()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="sticky top-28 z-10 flex justify-center lg:top-32">
      <button
        type="button"
        onClick={verNovos}
        className="flex items-center gap-1.5 rounded-full bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
      >
        <ArrowUp className="h-4 w-4" />
        {novos === 1 ? '1 novo post' : `${novos} novos posts`}
      </button>
    </div>
  )
}
